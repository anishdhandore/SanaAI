"""
FastAPI backend for SanaAI Job Application Assistant
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, List, Optional
import json
import re
import os
import subprocess
import tempfile
from pathlib import Path
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from prompts import (
    JD_PARSE_PROMPT, JD_PARSE_SYSTEM_PROMPT,
    RESUME_REWRITE_PROMPT, RESUME_REWRITE_SYSTEM_PROMPT,
    RESUME_REWRITE_LATEX_PROMPT, RESUME_REWRITE_LATEX_SYSTEM_PROMPT
)

# Load environment variables from .env file if it exists
load_dotenv()
from validation import (
    extract_skills_from_resume,
    extract_companies_from_resume,
    extract_dates_from_resume,
    validate_resume_changes
)

app = FastAPI(title="SanaAI Job Assistant API")

# CORS middleware for Chrome extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict to Chrome extension origin in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# TODO: Add OpenAI API key here
# You can set it as an environment variable: export OPENAI_API_KEY=your-key-here
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "your-openai-api-key-here")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")  # Default: gpt-5-mini (uses responses.create API)


class JDParseRequest(BaseModel):
    job_description: str = Field(..., description="Raw job description text")


class JDParseResponse(BaseModel):
    skills: List[str] = Field(..., description="Required skills")
    requirements: List[str] = Field(..., description="Job requirements")
    keywords: List[str] = Field(..., description="Important keywords")
    experience_years: Optional[int] = Field(None, description="Years of experience required")
    education: Optional[str] = Field(None, description="Education requirements")
    location: Optional[str] = Field(None, description="Job location")
    employment_type: Optional[str] = Field(None, description="Full-time, Part-time, etc.")


class ResumeRewriteRequest(BaseModel):
    resume: str = Field(..., description="Original resume text or LaTeX code")
    parsed_jd: JDParseResponse = Field(..., description="Parsed job description")
    resume_format: Optional[str] = Field("text", description="Format: 'text' or 'latex'")


class ResumeRewriteResponse(BaseModel):
    rewritten_resume: str = Field(..., description="ATS-optimized resume (text or LaTeX)")
    changes_made: List[str] = Field(..., description="Summary of changes made")
    validation_passed: bool = Field(..., description="Whether validation passed")
    resume_format: str = Field(..., description="Format of returned resume: 'text' or 'latex'")


class LaTeXToPDFRequest(BaseModel):
    latex_code: str = Field(..., description="LaTeX code to compile to PDF")


def call_llm(prompt: str, system_prompt: str = None, temperature: float = 0.0) -> str:
    """
    Call LLM API (OpenAI)
    Requires OPENAI_API_KEY to be set as environment variable or in main.py
    
    Supports both:
    - gpt-5-mini: Uses responses.create() API
    - Other models: Uses chat.completions.create() API
    """
    import openai
    
    # Check if API key is set
    if OPENAI_API_KEY == "your-openai-api-key-here" or not OPENAI_API_KEY:
        raise ValueError(
            "OpenAI API key not set. Please set OPENAI_API_KEY environment variable "
            "or update OPENAI_API_KEY in main.py"
        )
    
    try:
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        
        # gpt-5-mini uses the responses.create() API
        if OPENAI_MODEL == "gpt-5-mini":
            # Combine system prompt and user prompt for gpt-5-mini
            full_prompt = prompt
            if system_prompt:
                full_prompt = f"{system_prompt}\n\n{prompt}"
            
            response = client.responses.create(
                model="gpt-5-mini",
                input=full_prompt
            )
            return response.output_text
        else:
            # Other models use chat.completions.create() API
            response = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt or "You are a helpful assistant."},
                    {"role": "user", "content": prompt}
                ],
                temperature=temperature
            )
            return response.choices[0].message.content
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM API call failed: {str(e)}. Check your API key and model name."
        )


def extract_structured_json(text: str) -> Dict:
    """
    Extract JSON from LLM response
    Handles cases where LLM wraps JSON in markdown code blocks
    """
    # Try to find JSON in markdown code blocks
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if json_match:
        text = json_match.group(1)
    
    # Try to find JSON object directly
    json_match = re.search(r'\{.*\}', text, re.DOTALL)
    if json_match:
        text = json_match.group(0)
    
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        raise ValueError("Failed to parse JSON from LLM response")


@app.post("/parse-jd", response_model=JDParseResponse)
async def parse_job_description(request: JDParseRequest):
    """
    Parse job description into structured JSON format
    """
    prompt = JD_PARSE_PROMPT.format(job_description=request.job_description)
    system_prompt = JD_PARSE_SYSTEM_PROMPT

    try:
        response_text = call_llm(prompt, system_prompt, temperature=0.0)
        parsed_data = extract_structured_json(response_text)
        
        return JDParseResponse(**parsed_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse JD: {str(e)}")


def is_latex(resume_text: str) -> bool:
    """Detect if the resume is LaTeX format"""
    latex_indicators = [
        r'\\documentclass',
        r'\\begin\{document\}',
        r'\\section',
        r'\\textbf',
        r'\\textit',
        r'\\usepackage',
    ]
    return any(re.search(pattern, resume_text) for pattern in latex_indicators)


def extract_text_from_latex(latex_code: str) -> str:
    """Extract plain text from LaTeX code for validation"""
    # Remove LaTeX commands but keep content
    text = latex_code
    # Remove LaTeX commands (basic cleanup)
    text = re.sub(r'\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^\}]*\})*', '', text)
    text = re.sub(r'\{([^\}]+)\}', r'\1', text)  # Remove braces, keep content
    text = re.sub(r'%.*', '', text)  # Remove comments
    text = re.sub(r'\s+', ' ', text)  # Normalize whitespace
    return text.strip()


@app.post("/rewrite-resume", response_model=ResumeRewriteResponse)
async def rewrite_resume(request: ResumeRewriteRequest):
    """
    Rewrite resume to maximize ATS similarity while preserving all original information
    Supports both plain text and LaTeX formats
    """
    # Detect format if not specified
    is_latex_format = request.resume_format == "latex" or is_latex(request.resume)
    
    # Extract original resume metadata for validation
    if is_latex_format:
        # Extract text from LaTeX for validation
        resume_text = extract_text_from_latex(request.resume)
    else:
        resume_text = request.resume
    
    original_skills = extract_skills_from_resume(resume_text)
    original_companies = extract_companies_from_resume(resume_text)
    original_dates = extract_dates_from_resume(resume_text)
    
    # Use appropriate prompt based on format
    if is_latex_format:
        prompt = RESUME_REWRITE_LATEX_PROMPT.format(
            skills=', '.join(request.parsed_jd.skills),
            keywords=', '.join(request.parsed_jd.keywords),
            requirements=', '.join(request.parsed_jd.requirements),
            resume=request.resume
        )
        system_prompt = RESUME_REWRITE_LATEX_SYSTEM_PROMPT
    else:
        prompt = RESUME_REWRITE_PROMPT.format(
            skills=', '.join(request.parsed_jd.skills),
            keywords=', '.join(request.parsed_jd.keywords),
            requirements=', '.join(request.parsed_jd.requirements),
            resume=request.resume
        )
        system_prompt = RESUME_REWRITE_SYSTEM_PROMPT

    try:
        rewritten_resume = call_llm(prompt, system_prompt, temperature=0.1)
        
        # Validate the rewritten resume
        if is_latex_format:
            rewritten_text = extract_text_from_latex(rewritten_resume)
        else:
            rewritten_text = rewritten_resume
        
        validation_result = validate_resume_changes(
            original_resume=resume_text,
            rewritten_resume=rewritten_text,
            original_skills=original_skills,
            original_companies=original_companies,
            original_dates=original_dates
        )
        
        return ResumeRewriteResponse(
            rewritten_resume=rewritten_resume,
            changes_made=validation_result["changes"],
            validation_passed=validation_result["passed"],
            resume_format="latex" if is_latex_format else "text"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rewrite resume: {str(e)}")


@app.post("/latex-to-pdf")
async def latex_to_pdf(request: LaTeXToPDFRequest):
    """
    Convert LaTeX code to PDF
    Returns the PDF file for download
    """
    # Create temporary directory for LaTeX compilation
    with tempfile.TemporaryDirectory() as tmpdir:
        latex_file = Path(tmpdir) / "resume.tex"
        pdf_file = Path(tmpdir) / "resume.pdf"
        
        # Write LaTeX code to file
        latex_file.write_text(request.latex_code, encoding='utf-8')
        
        try:
            # Compile LaTeX to PDF using pdflatex
            # Run pdflatex twice to resolve references
            result = subprocess.run(
                ['pdflatex', '-interaction=nonstopmode', '-output-directory', tmpdir, str(latex_file)],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                # Try second compilation for references
                subprocess.run(
                    ['pdflatex', '-interaction=nonstopmode', '-output-directory', tmpdir, str(latex_file)],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
            
            if not pdf_file.exists():
                error_msg = result.stderr or result.stdout or "Unknown LaTeX compilation error"
                raise HTTPException(
                    status_code=500,
                    detail=f"LaTeX compilation failed: {error_msg[:500]}"
                )
            
            # Return PDF file
            return FileResponse(
                path=str(pdf_file),
                media_type='application/pdf',
                filename='resume.pdf',
                headers={'Content-Disposition': 'attachment; filename=resume.pdf'}
            )
            
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=500, detail="LaTeX compilation timed out")
        except FileNotFoundError:
            raise HTTPException(
                status_code=500,
                detail="pdflatex not found. Please install LaTeX (e.g., MacTeX on macOS, TeX Live on Linux)"
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF conversion failed: {str(e)}")




@app.get("/get-original-resume")
async def get_original_resume():
    """
    Get the original resume from the resumes/original/AnishDhandoreResume/ directory
    Automatically finds the main .tex file
    """
    original_dir = Path(__file__).parent.parent / "resumes" / "original"
    resume_folder = original_dir / "AnishDhandoreResume"
    
    # First try the specific folder, then fall back to original_dir
    search_dir = resume_folder if resume_folder.exists() else original_dir
    
    if not search_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Resume directory not found. Please create resumes/original/AnishDhandoreResume/ and place your resume there."
        )
    
    # Look for common resume file names
    possible_names = ["resume.tex", "main.tex", "cv.tex", "curriculum.tex", "AnishDhandoreResume.tex"]
    tex_files = list(search_dir.rglob("*.tex"))
    
    if not tex_files:
        raise HTTPException(
            status_code=404,
            detail=f"No .tex file found in {search_dir.name}/. Please place your resume.tex file there."
        )
    
    # Prefer files with common names, otherwise use first found
    main_file = None
    for name in possible_names:
        for tex_file in tex_files:
            if tex_file.name.lower() == name.lower():
                main_file = tex_file
                break
        if main_file:
            break
    
    if not main_file:
        main_file = tex_files[0]
    
    try:
        resume_content = main_file.read_text(encoding='utf-8')
        
        # Detect format
        is_latex_format = is_latex(resume_content)
        
        return {
            "resume": resume_content,
            "filename": main_file.name,
            "format": "latex" if is_latex_format else "text",
            "path": str(main_file.relative_to(original_dir)),
            "folder": search_dir.name
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read resume file: {str(e)}"
        )


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "SanaAI Job Assistant API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
