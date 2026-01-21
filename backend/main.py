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
import traceback
from pathlib import Path
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from prompts import (
    JD_PARSE_PROMPT, JD_PARSE_SYSTEM_PROMPT,
    RESUME_REWRITE_PROMPT, RESUME_REWRITE_SYSTEM_PROMPT,
    RESUME_REWRITE_LATEX_PROMPT, RESUME_REWRITE_LATEX_SYSTEM_PROMPT,
    COMBINED_PROCESS_PROMPT, COMBINED_PROCESS_SYSTEM_PROMPT,
    FAST_REWRITE_PROMPT, FAST_REWRITE_SYSTEM_PROMPT,
    ATS_SCORE_PROMPT, ATS_SCORE_SYSTEM_PROMPT
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

# Cache for resume metadata to avoid re-extraction
resume_metadata_cache: Dict[str, Dict] = {}


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
    skip_validation: Optional[bool] = Field(False, description="Skip validation for faster processing")


class CombinedProcessRequest(BaseModel):
    """Combined request for faster processing - parses JD and rewrites resume in one call"""
    job_description: str = Field(..., description="Raw job description text")
    resume: str = Field(..., description="Original resume text or LaTeX code")
    resume_format: Optional[str] = Field("text", description="Format: 'text' or 'latex'")
    skip_validation: Optional[bool] = Field(False, description="Skip validation for faster processing")


class ResumeRewriteResponse(BaseModel):
    rewritten_resume: str = Field(..., description="ATS-optimized resume (text or LaTeX)")
    changes_made: List[str] = Field(..., description="Summary of changes made")
    validation_passed: bool = Field(..., description="Whether validation passed")
    resume_format: str = Field(..., description="Format of returned resume: 'text' or 'latex'")


class LaTeXToPDFRequest(BaseModel):
    latex_code: str = Field(..., description="LaTeX code to compile to PDF")


class ResumeParseRequest(BaseModel):
    resume: str = Field(..., description="Resume text or LaTeX code")
    resume_format: Optional[str] = Field("text", description="Format: 'text' or 'latex'")


class ResumeParseResponse(BaseModel):
    personalInfo: Dict = Field(..., description="Personal information (name, email, phone, address)")
    workHistory: List[Dict] = Field(..., description="Work history entries")
    education: List[Dict] = Field(..., description="Education entries")
    skills: List[str] = Field(..., description="Skills list")
    summary: Optional[str] = Field(None, description="Professional summary")
    projects: Optional[List[Dict]] = Field(None, description="Projects entries")
    references: Optional[List[Dict]] = Field(None, description="References")


class FormAnalysisRequest(BaseModel):
    form_html: str = Field(..., description="HTML of the form to analyze")
    url: Optional[str] = Field(None, description="URL of the page for site-specific detection")


class FormAnalysisResponse(BaseModel):
    fields: List[Dict] = Field(..., description="Detected form fields with mappings")
    steps: Optional[List[Dict]] = Field(None, description="Multi-step form structure")
    site_type: Optional[str] = Field(None, description="Detected site type (greenhouse, lever, workday, etc.)")
    file_uploads: List[Dict] = Field(..., description="File upload fields")


def truncate_prompt_if_needed(text: str, max_length: int = 12000) -> str:
    """
    Truncate very long text while preserving structure
    Keeps beginning and end, removes middle portion
    """
    if len(text) <= max_length:
        return text
    
    # Keep first 60% and last 40% to preserve structure
    first_part = text[:int(max_length * 0.6)]
    last_part = text[-int(max_length * 0.4):]
    
    return first_part + "\n\n[... content truncated for efficiency ...]\n\n" + last_part


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
        # Initialize client with only api_key to avoid any proxy/environment variable conflicts
        client_kwargs = {"api_key": OPENAI_API_KEY}
        # Only add base_url if explicitly set (for custom endpoints)
        base_url = os.getenv("OPENAI_BASE_URL")
        if base_url:
            client_kwargs["base_url"] = base_url
        
        client = openai.OpenAI(**client_kwargs)
        
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
        # Log full error for debugging
        import traceback
        error_details = traceback.format_exc()
        print(f"LLM API call error: {error_details}")  # Log to console
        error_msg = str(e) if str(e) else f"Unknown error: {type(e).__name__}"
        if not error_msg or error_msg.strip() == "":
            error_msg = f"Empty error message from {type(e).__name__}"
        raise HTTPException(
            status_code=500,
            detail=f"LLM API call failed: {error_msg}. Check your API key and model name."
        )


def extract_structured_json(text: str) -> Dict:
    """
    Extract JSON from LLM response safely.
    Tries full parse, then the first JSON object. Raises ValueError on failure.
    """
    # Try full parse
    try:
        return json.loads(text)
    except Exception:
        pass

    # Try first JSON object (even if wrapped in code fences or extra text)
    json_match = re.search(r'\{[\s\S]*\}', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except Exception:
            pass

    raise ValueError("Failed to parse JSON from LLM response")


@app.post("/parse-jd", response_model=JDParseResponse)
async def parse_job_description(request: JDParseRequest):
    """
    Parse job description into structured JSON format
    """
    prompt = JD_PARSE_PROMPT.format(job_description=request.job_description)
    system_prompt = JD_PARSE_SYSTEM_PROMPT

    try:
        # Truncate JD if very long to speed up processing
        prompt = JD_PARSE_PROMPT.format(job_description=truncate_prompt_if_needed(request.job_description, max_length=8000))
        response_text = call_llm(prompt, system_prompt, temperature=0.0)
        
        # Debug: log the response
        print(f"LLM response length: {len(response_text) if response_text else 0}")
        print(f"LLM response preview: {response_text[:500] if response_text else 'EMPTY'}")
        
        if not response_text or len(response_text.strip()) == 0:
            raise ValueError("LLM returned empty response")
        
        parsed_data = extract_structured_json(response_text)
        
        # Log parsed data for debugging
        print(f"Parsed JD - Skills: {len(parsed_data.get('skills', []))}, Keywords: {len(parsed_data.get('keywords', []))}, Requirements: {len(parsed_data.get('requirements', []))}")
        if parsed_data.get('skills'):
            print(f"Sample skills: {parsed_data['skills'][:5]}")
        
        return JDParseResponse(**parsed_data)
    except HTTPException:
        # Re-raise HTTP exceptions (like API key errors)
        raise
    except ValueError as e:
        # JSON parsing errors
        raise HTTPException(status_code=500, detail=f"Failed to parse JD response: {str(e)}. Response: {response_text[:500] if 'response_text' in locals() else 'N/A'}")
    except Exception as e:
        # Log full error for debugging
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in parse_jd: {error_details}")  # Log to console
        error_msg = str(e) if str(e) else f"Unknown error: {type(e).__name__}"
        raise HTTPException(status_code=500, detail=f"Failed to parse JD: {error_msg}")


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


def extract_keywords_from_text(text: str) -> list:
    """
    Extract keywords from text for logging/comparison purposes
    Returns list of unique keywords (technical terms, tools, concepts)
    """
    keywords = []
    text_lower = text.lower()
    
    # Extract technical terms (capitalized words, acronyms)
    caps_words = re.findall(r'\b[A-Z][A-Za-z0-9+#.]*(?:\s+[A-Z][A-Za-z0-9+#.]*)*\b', text)
    keywords.extend([w for w in caps_words if len(w) > 2])
    
    # Extract acronyms
    acronyms = re.findall(r'\b[A-Z]{2,6}(?:[/-][A-Z]{2,6})?\b', text)
    keywords.extend(acronyms)
    
    # Extract multi-word technical phrases
    multi_word = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b', text)
    keywords.extend([p for p in multi_word if len(p.split()) >= 2])
    
    # Common tech keywords
    tech_keywords = [
        'python', 'java', 'javascript', 'typescript', 'react', 'angular', 'vue', 'node.js',
        'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible',
        'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch',
        'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy',
        'go', 'golang', 'rust', 'c++', 'c#', '.net', 'spring boot', 'django', 'flask', 'fastapi',
        'git', 'linux', 'unix', 'bash', 'shell scripting', 'graphql', 'rest api', 'ci/cd',
        'machine learning', 'deep learning', 'data science', 'nlp', 'computer vision',
        'microservices', 'distributed systems', 'cloud-native', 'serverless',
        'agile', 'scrum', 'devops', 'continuous integration',
        'api design', 'restful', 'event-driven', 'reactive',
        'monitoring', 'observability', 'logging', 'metrics', 'tracing'
    ]
    
    for tech in tech_keywords:
        pattern = r'\b' + re.escape(tech.lower()) + r'\b'
        if re.search(pattern, text_lower):
            keywords.append(tech.title() if ' ' not in tech else tech)
    
    # Remove duplicates and filter out common words
    exclude_words = ['The', 'This', 'That', 'With', 'From', 'For', 'And', 'Are', 'You', 'Your', 
                     'Our', 'Company', 'Team', 'Work', 'Job', 'Position', 'Role', 'Will', 
                     'Must', 'Should', 'Have', 'Has', 'Been', 'Being', 'Apply', 'Submit']
    keywords = [kw for kw in set(keywords) if kw not in exclude_words and len(kw) > 2]
    
    return sorted(keywords, key=str.lower)


def extract_keywords_from_text(text: str) -> list:
    """
    Extract keywords from text for logging/comparison purposes
    Returns list of unique keywords (technical terms, tools, concepts)
    """
    keywords = []
    text_lower = text.lower()
    
    # Extract technical terms (capitalized words, acronyms)
    caps_words = re.findall(r'\b[A-Z][A-Za-z0-9+#.]*(?:\s+[A-Z][A-Za-z0-9+#.]*)*\b', text)
    keywords.extend([w for w in caps_words if len(w) > 2])
    
    # Extract acronyms
    acronyms = re.findall(r'\b[A-Z]{2,6}(?:[/-][A-Z]{2,6})?\b', text)
    keywords.extend(acronyms)
    
    # Extract multi-word technical phrases
    multi_word = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b', text)
    keywords.extend([p for p in multi_word if len(p.split()) >= 2])
    
    # Common tech keywords
    tech_keywords = [
        'python', 'java', 'javascript', 'typescript', 'react', 'angular', 'vue', 'node.js',
        'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible',
        'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch',
        'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy',
        'go', 'golang', 'rust', 'c++', 'c#', '.net', 'spring boot', 'django', 'flask', 'fastapi',
        'git', 'linux', 'unix', 'bash', 'shell scripting', 'graphql', 'rest api', 'ci/cd',
        'machine learning', 'deep learning', 'data science', 'nlp', 'computer vision',
        'microservices', 'distributed systems', 'cloud-native', 'serverless',
        'agile', 'scrum', 'devops', 'continuous integration',
        'api design', 'restful', 'event-driven', 'reactive',
        'monitoring', 'observability', 'logging', 'metrics', 'tracing'
    ]
    
    for tech in tech_keywords:
        pattern = r'\b' + re.escape(tech.lower()) + r'\b'
        if re.search(pattern, text_lower):
            keywords.append(tech.title() if ' ' not in tech else tech)
    
    # Remove duplicates and filter out common words
    exclude_words = ['The', 'This', 'That', 'With', 'From', 'For', 'And', 'Are', 'You', 'Your', 
                     'Our', 'Company', 'Team', 'Work', 'Job', 'Position', 'Role', 'Will', 
                     'Must', 'Should', 'Have', 'Has', 'Been', 'Being', 'Apply', 'Submit']
    keywords = [kw for kw in set(keywords) if kw not in exclude_words and len(kw) > 2]
    
    return sorted(keywords, key=str.lower)


def enforce_keyword_minimums(text: str, keywords: list, min_count: int) -> list:
    """
    Check if keywords appear minimum required times in text.
    Returns list of keywords that are underrepresented.
    """
    missing = []
    text_lower = text.lower()
    for kw in keywords:
        kw_lower = kw.lower()
        count = text_lower.count(kw_lower)
        if count < min_count:
            missing.append(f"{kw} (found {count}, need {min_count})")
    return missing


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
    
    # Extract original resume metadata for validation (use cache if available)
    resume_hash = str(hash(request.resume))
    if resume_hash in resume_metadata_cache:
        resume_text = resume_metadata_cache[resume_hash]["resume_text"]
        original_skills = resume_metadata_cache[resume_hash]["skills"]
        original_companies = resume_metadata_cache[resume_hash]["companies"]
        original_dates = resume_metadata_cache[resume_hash]["dates"]
    else:
        if is_latex_format:
            # Extract text from LaTeX for validation
            resume_text = extract_text_from_latex(request.resume)
        else:
            resume_text = request.resume
        
        original_skills = extract_skills_from_resume(resume_text)
        original_companies = extract_companies_from_resume(resume_text)
        original_dates = extract_dates_from_resume(resume_text)
        
        # Cache metadata
        resume_metadata_cache[resume_hash] = {
            "resume_text": resume_text,
            "skills": original_skills,
            "companies": original_companies,
            "dates": original_dates
        }
    
    # Use appropriate prompt based on format
    # Handle empty lists gracefully
    skills_str = ', '.join(request.parsed_jd.skills) if request.parsed_jd.skills else "Not specified"
    keywords_str = ', '.join(request.parsed_jd.keywords) if request.parsed_jd.keywords else "Not specified"
    requirements_str = ', '.join(request.parsed_jd.requirements) if request.parsed_jd.requirements else "Not specified"
    
    # Truncate resume if very long to speed up processing
    resume_for_prompt = truncate_prompt_if_needed(request.resume, max_length=10000)
    
    if is_latex_format:
        prompt = RESUME_REWRITE_LATEX_PROMPT.format(
            skills=skills_str,
            keywords=keywords_str,
            requirements=requirements_str,
            resume=resume_for_prompt
        )
        system_prompt = RESUME_REWRITE_LATEX_SYSTEM_PROMPT
    else:
        prompt = RESUME_REWRITE_PROMPT.format(
            skills=skills_str,
            keywords=keywords_str,
            requirements=requirements_str,
            resume=resume_for_prompt
        )
        system_prompt = RESUME_REWRITE_SYSTEM_PROMPT

    # Log what we're sending to the LLM
    print(f"Rewriting resume with - Skills: {skills_str[:100]}, Keywords: {keywords_str[:100]}")
    
    try:
        # Use temperature 0.0 for faster, more deterministic responses
        rewritten_resume = call_llm(prompt, system_prompt, temperature=0.0)
        
        # Log response preview
        print(f"Rewritten resume length: {len(rewritten_resume) if rewritten_resume else 0}")
        print(f"Rewritten resume preview: {rewritten_resume[:300] if rewritten_resume else 'EMPTY'}")
        
        # Validate the rewritten resume (unless skipped)
        if request.skip_validation:
            validation_result = {
                "passed": True,
                "changes": ["Validation skipped for faster processing"],
                "warnings": [],
                "errors": []
            }
        else:
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


class FastRewriteRequest(BaseModel):
    """Simple request for fast resume rewriting"""
    job_description: str = Field(..., description="Job description text")
    resume: str = Field(..., description="Resume text or LaTeX code")
    resume_format: Optional[str] = Field("latex", description="Format: 'text' or 'latex'")
    skip_reinforcement: Optional[bool] = Field(False, description="Skip reinforcement pass for faster processing (may reduce ATS score)")


class FastRewriteResponse(BaseModel):
    """Simple response with just the rewritten resume"""
    rewritten_resume: str = Field(..., description="Rewritten resume (raw text/LaTeX)")
    resume_format: str = Field(..., description="Format of returned resume")


class ATSScoreRequest(BaseModel):
    """Request for ATS score calculation"""
    job_description: str = Field(..., description="Job description text")
    resume: str = Field(..., description="Resume text or LaTeX code")
    resume_format: Optional[str] = Field("latex", description="Format: 'text' or 'latex'")


class ATSScoreBreakdown(BaseModel):
    """Breakdown of ATS score components"""
    keyword_matching: float = Field(..., description="Keyword matching score (0-100)")
    keyword_placement: float = Field(..., description="Keyword placement score (0-100)")
    keyword_density: float = Field(..., description="Keyword density score (0-100)")
    relevance_alignment: float = Field(..., description="Relevance and alignment score (0-100)")


class ATSScoreResponse(BaseModel):
    """Response with ATS score and analysis"""
    ats_score: float = Field(..., description="Overall ATS compatibility score (0-100)")
    breakdown: ATSScoreBreakdown = Field(..., description="Score breakdown by component")
    missing_keywords: List[str] = Field(default_factory=list, description="Keywords from JD missing in resume")
    strengths: List[str] = Field(default_factory=list, description="Strengths of the resume")
    recommendations: List[str] = Field(default_factory=list, description="Recommendations for improvement")


@app.post("/fast-rewrite", response_model=FastRewriteResponse)
async def fast_rewrite(request: FastRewriteRequest):
    """
    FAST ENDPOINT: Resume optimization using full prompt from prompts.py
    - No JSON wrapping (returns raw LaTeX/text)
    - No validation step
    - Uses FAST_REWRITE_PROMPT from prompts.py
    """
    # Enhanced keyword extraction with categorization (CORE, TOOLS, SECONDARY)
    jd_lower = request.job_description.lower()
    jd_text = request.job_description
    
    # Define tool/platform keywords (programming languages, frameworks, tools)
    tool_keywords_list = [
        'python', 'java', 'javascript', 'typescript', 'react', 'angular', 'vue', 'node.js',
        'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible',
        'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch',
        'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy',
        'go', 'golang', 'rust', 'c++', 'c#', '.net', 'spring boot', 'django', 'flask', 'fastapi',
        'git', 'linux', 'unix', 'bash', 'shell scripting', 'graphql', 'rest api', 'ci/cd'
    ]
    
    # Extract tool keywords
    tool_keywords = []
    for tool in tool_keywords_list:
        pattern = r'\b' + re.escape(tool.lower()) + r'\b'
        if re.search(pattern, jd_lower):
            tool_keywords.append(tool.title() if ' ' not in tool else tool)
    
    # Extract acronyms as tools (API, AWS, ML, AI, CI/CD, etc.)
    acronyms = re.findall(r'\b[A-Z]{2,6}(?:[/-][A-Z]{2,6})?\b', jd_text)
    tool_keywords.extend([a for a in acronyms if a not in tool_keywords])
    tool_keywords = list(set(tool_keywords))[:25]
    
    # Extract core keywords (concepts, methodologies, domain terms)
    # Multi-word technical phrases (2-4 words)
    multi_word_phrases = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b', jd_text)
    exclude_phrases = {'The', 'This', 'That', 'With', 'From', 'For', 'And', 'Are', 'You', 'Your', 'Our', 'Company', 'Team', 'Work', 'Job', 'Position', 'Role', 'Will', 'Must', 'Should', 'Have', 'Has', 'Been', 'Being'}
    technical_phrases = [p for p in multi_word_phrases if p not in exclude_phrases and len(p.split()) >= 2]
    
    # Core keywords: domain concepts, methodologies, important terms
    core_keywords = []
    core_patterns = [
        r'\b(machine learning|deep learning|data science|nlp|computer vision)\b',
        r'\b(microservices|distributed systems|cloud-native|serverless)\b',
        r'\b(agile|scrum|devops|ci/cd|continuous integration)\b',
        r'\b(inference|model serving|latency|throughput|scalability|concurrency)\b',
        r'\b(api design|restful|graphql|event-driven|reactive)\b',
        r'\b(monitoring|observability|logging|metrics|tracing)\b'
    ]
    
    for pattern in core_patterns:
        matches = re.findall(pattern, jd_lower, re.IGNORECASE)
        core_keywords.extend([m.title() if isinstance(m, str) else m[0].title() for m in matches])
    
    # Add technical phrases to core keywords
    core_keywords.extend(technical_phrases[:15])
    core_keywords = list(set(core_keywords))[:20]
    
    # Secondary keywords: contextual terms, soft skills, domain-specific
    secondary_keywords = []
    secondary_patterns = [
        r'\b(communication|leadership|problem solving|teamwork|collaboration)\b',
        r'\b(architecture|design|implementation|optimization|performance)\b',
        r'\b(testing|quality assurance|automation|deployment)\b'
    ]
    
    for pattern in secondary_patterns:
        matches = re.findall(pattern, jd_lower, re.IGNORECASE)
        secondary_keywords.extend([m.title() if isinstance(m, str) else m[0].title() for m in matches])
    
    # Extract capitalized words that aren't tools or core
    caps_words = re.findall(r'\b[A-Z][A-Za-z0-9+#.]*(?:\s+[A-Z][A-Za-z0-9+#.]*)*\b', jd_text)
    exclude_words = ['The', 'This', 'That', 'With', 'From', 'For', 'And', 'Are', 'You', 'Your', 'Our', 'Company', 'Team', 'Work', 'Job', 'Position', 'Role', 'Will', 'Must', 'Should', 'Have', 'Has', 'Been', 'Being']
    additional_secondary = [w for w in caps_words if len(w) > 2 and w not in exclude_words and w not in tool_keywords and w not in core_keywords]
    secondary_keywords.extend(additional_secondary[:15])
    secondary_keywords = list(set(secondary_keywords))[:20]
    
    # Format for prompt
    core_keywords_str = ', '.join(core_keywords) if core_keywords else 'Not specified'
    tool_keywords_str = ', '.join(tool_keywords) if tool_keywords else 'Not specified'
    secondary_keywords_str = ', '.join(secondary_keywords) if secondary_keywords else 'Not specified'
    
    print("\n" + "="*80)
    print("[FAST-REWRITE] ========== STARTING RESUME OPTIMIZATION ==========")
    print("="*80)
    print(f"[FAST-REWRITE] JD length: {len(request.job_description)} chars")
    print(f"[FAST-REWRITE] Resume length: {len(request.resume)} chars")
    print(f"[FAST-REWRITE] Resume format: {request.resume_format}")
    print(f"[FAST-REWRITE] Model: {OPENAI_MODEL}")
    
    print("\n[FAST-REWRITE] --- EXTRACTED KEYWORDS FROM JD ---")
    print(f"[FAST-REWRITE] CORE KEYWORDS ({len(core_keywords)}): {core_keywords_str}")
    if core_keywords:
        for i, kw in enumerate(core_keywords, 1):
            print(f"  {i}. {kw}")
    print(f"\n[FAST-REWRITE] TOOL/PLATFORM KEYWORDS ({len(tool_keywords)}): {tool_keywords_str}")
    if tool_keywords:
        for i, kw in enumerate(tool_keywords, 1):
            print(f"  {i}. {kw}")
    print(f"\n[FAST-REWRITE] SECONDARY/CONTEXTUAL KEYWORDS ({len(secondary_keywords)}): {secondary_keywords_str}")
    if secondary_keywords:
        for i, kw in enumerate(secondary_keywords, 1):
            print(f"  {i}. {kw}")
    
    # Use the V2 prompt format with categorized keywords
    prompt = FAST_REWRITE_PROMPT.format(
        core_keywords=core_keywords_str,
        tool_keywords=tool_keywords_str,
        secondary_keywords=secondary_keywords_str,
        resume=request.resume
    )
    
    try:
        print("\n[FAST-REWRITE] --- CALLING LLM FOR RESUME REWRITE ---")
        print(f"[FAST-REWRITE] Prompt length: {len(prompt)} chars")
        
        # Initial LLM call - returns raw LaTeX, no JSON parsing needed
        rewritten = call_llm(prompt, FAST_REWRITE_SYSTEM_PROMPT, temperature=0.0)
        
        print(f"[FAST-REWRITE] LLM returned {len(rewritten) if rewritten else 0} chars")
        
        # Extract keywords from rewritten resume to show what changed
        if rewritten:
            print("\n[FAST-REWRITE] --- ANALYZING REWRITTEN RESUME ---")
            rewritten_keywords = extract_keywords_from_text(rewritten[:5000])  # Sample first 5k chars
            print(f"[FAST-REWRITE] Keywords found in rewritten resume: {len(rewritten_keywords)}")
            print(f"[FAST-REWRITE] Sample keywords: {', '.join(rewritten_keywords[:20])}")
            
            # Check if core keywords appear in rewritten resume
            print("\n[FAST-REWRITE] --- CHECKING KEYWORD INCLUSION ---")
            rewritten_lower = rewritten.lower()
            core_found = [kw for kw in core_keywords if kw.lower() in rewritten_lower]
            core_missing = [kw for kw in core_keywords if kw.lower() not in rewritten_lower]
            print(f"[FAST-REWRITE] Core keywords FOUND in rewritten resume: {len(core_found)}/{len(core_keywords)}")
            if core_found:
                print(f"  Found: {', '.join(core_found[:10])}")
            if core_missing:
                print(f"  Missing: {', '.join(core_missing[:10])}")
        
        # Clean up any markdown code fences if present
        if rewritten and rewritten.startswith('```'):
            lines = rewritten.split('\n')
            if lines[-1].strip() == '```':
                lines = lines[1:-1]
            elif lines[0].startswith('```'):
                lines = lines[1:]
            rewritten = '\n'.join(lines)
        
        rewritten = rewritten.strip()
        
        # POST-REWRITE ATS REINFORCEMENT PASS (Optional - can be skipped for speed)
        # Only runs if skip_reinforcement=False AND significant keywords are missing
        if not request.skip_reinforcement and core_keywords:
            print("\n[FAST-REWRITE] --- CHECKING KEYWORD FREQUENCY (REINFORCEMENT PASS) ---")
            missing_core = enforce_keyword_minimums(rewritten, core_keywords, min_count=5)
            # Only trigger if >30% of core keywords are missing (avoid unnecessary second LLM call)
            missing_ratio = len(missing_core) / len(core_keywords) if core_keywords else 0
            
            print(f"[FAST-REWRITE] Core keywords check: {len(missing_core)}/{len(core_keywords)} need more mentions (threshold: >30%)")
            if missing_core:
                print(f"[FAST-REWRITE] Keywords needing reinforcement: {', '.join([kw.split('(')[0].strip() for kw in missing_core[:10]])}")
            
            if missing_core and missing_ratio > 0.3:  # Only if >30% missing
                print(f"[FAST-REWRITE] ⚠️  Reinforcement needed: {missing_ratio*100:.0f}% of core keywords underrepresented")
                print(f"[FAST-REWRITE] Triggering reinforcement pass...")
                
                # More targeted reinforcement prompt - only fix missing keywords, not full rewrite
                missing_keywords_only = [kw.split('(')[0].strip() for kw in missing_core[:8]]  # Limit to top 8
                reinforcement_prompt = f"""
IMPORTANT: The following core keywords are missing or underrepresented in the resume:
{', '.join(missing_keywords_only)}

Add these keywords naturally into the existing resume content. Focus on:
- Experience section bullet points
- Project descriptions
- Job titles (if applicable)

Keep all existing content, just enhance it with these keywords. Do NOT rewrite the entire resume.

Current resume (first 1500 chars for context):
{rewritten[:1500]}...

Return the COMPLETE resume with these keywords added naturally.
"""
                
                try:
                    # Use a shorter, more targeted prompt for reinforcement
                    reinforcement_response = call_llm(
                        reinforcement_prompt + "\n\n" + rewritten[:3000],  # Include more context
                        "You are a resume keyword optimization assistant. Add missing keywords naturally to existing content without rewriting everything.",
                        temperature=0.0
                    )
                    
                    # Clean up markdown fences
                    if reinforcement_response and reinforcement_response.startswith('```'):
                        lines = reinforcement_response.split('\n')
                        if lines[-1].strip() == '```':
                            lines = lines[1:-1]
                        elif lines[0].startswith('```'):
                            lines = lines[1:]
                        reinforcement_response = '\n'.join(lines).strip()
                    
                    # Use reinforcement response if it's longer (likely has more content)
                    if reinforcement_response and len(reinforcement_response) > len(rewritten) * 0.8:
                        rewritten = reinforcement_response
                        print(f"[FAST-REWRITE] ✓ Reinforcement pass completed (added {len(missing_keywords_only)} keywords)")
                    else:
                        print(f"[FAST-REWRITE] ⚠️  Reinforcement response too short, using original")
                except Exception as e:
                    print(f"[FAST-REWRITE] ❌ Reinforcement pass failed (using original): {e}")
                    # Continue with original rewritten resume
            elif missing_core:
                print(f"[FAST-REWRITE] ✓ {len(missing_core)} keywords missing but below threshold ({missing_ratio*100:.0f}% < 30%), skipping reinforcement for speed")
        elif request.skip_reinforcement:
            print(f"[FAST-REWRITE] ⏭️  Reinforcement pass skipped (skip_reinforcement=True)")
        
        # Check tool keywords (optional, less critical)
        if tool_keywords:
            print("\n[FAST-REWRITE] --- CHECKING TOOL KEYWORDS ---")
            missing_tools = enforce_keyword_minimums(rewritten, tool_keywords, min_count=3)
            if missing_tools and len(missing_tools) > len(tool_keywords) * 0.5:  # Only reinforce if >50% missing
                print(f"[FAST-REWRITE] ⚠️  Warning: {len(missing_tools)}/{len(tool_keywords)} tool keywords underrepresented (continuing anyway)")
            else:
                print(f"[FAST-REWRITE] ✓ Tool keywords check passed")
        
        print("\n[FAST-REWRITE] --- FINAL RESULTS ---")
        print(f"[FAST-REWRITE] Original resume length: {len(request.resume)} chars")
        print(f"[FAST-REWRITE] Rewritten resume length: {len(rewritten)} chars")
        print(f"[FAST-REWRITE] Length change: {len(rewritten) - len(request.resume):+d} chars ({((len(rewritten) - len(request.resume)) / len(request.resume) * 100):+.1f}%)")
        print("="*80)
        print("[FAST-REWRITE] ========== RESUME OPTIMIZATION COMPLETE ==========")
        print("="*80 + "\n")
        
        return FastRewriteResponse(
            rewritten_resume=rewritten,
            resume_format=request.resume_format or "latex"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fast rewrite failed: {str(e)}")


@app.post("/calculate-ats-score", response_model=ATSScoreResponse)
async def calculate_ats_score(request: ATSScoreRequest):
    """
    Calculate ATS compatibility score for resume against job description
    Uses LLM to analyze keyword matching, placement, density, and relevance
    """
    try:
        # Extract text from LaTeX if needed
        if request.resume_format == "latex" or is_latex(request.resume):
            resume_text = extract_text_from_latex(request.resume)
        else:
            resume_text = request.resume
        
        # Truncate if very long (to avoid token limits)
        jd_truncated = truncate_prompt_if_needed(request.job_description, max_length=8000)
        resume_truncated = truncate_prompt_if_needed(resume_text, max_length=10000)
        
        # Format prompt
        prompt = ATS_SCORE_PROMPT.format(
            job_description=jd_truncated,
            resume=resume_truncated
        )
        
        print("\n" + "="*80)
        print("[ATS-SCORE] ========== STARTING ATS SCORE CALCULATION ==========")
        print("="*80)
        print(f"[ATS-SCORE] JD length: {len(jd_truncated)} chars")
        print(f"[ATS-SCORE] Resume length: {len(resume_truncated)} chars")
        print(f"[ATS-SCORE] Model: {OPENAI_MODEL}")
        
        # Extract and log keywords from JD for comparison
        print("\n[ATS-SCORE] --- EXTRACTING KEYWORDS FROM JOB DESCRIPTION ---")
        jd_keywords_extracted = extract_keywords_from_text(jd_truncated)
        print(f"[ATS-SCORE] Found {len(jd_keywords_extracted)} unique keywords in JD:")
        for i, kw in enumerate(jd_keywords_extracted[:30], 1):  # Show first 30
            print(f"  {i}. {kw}")
        if len(jd_keywords_extracted) > 30:
            print(f"  ... and {len(jd_keywords_extracted) - 30} more")
        
        # Extract and log keywords from Resume
        print("\n[ATS-SCORE] --- EXTRACTING KEYWORDS FROM RESUME ---")
        resume_keywords_extracted = extract_keywords_from_text(resume_truncated)
        print(f"[ATS-SCORE] Found {len(resume_keywords_extracted)} unique keywords in Resume:")
        for i, kw in enumerate(resume_keywords_extracted[:30], 1):  # Show first 30
            print(f"  {i}. {kw}")
        if len(resume_keywords_extracted) > 30:
            print(f"  ... and {len(resume_keywords_extracted) - 30} more")
        
        # Compare and find missing keywords
        print("\n[ATS-SCORE] --- COMPARING KEYWORDS ---")
        missing_from_resume = [kw for kw in jd_keywords_extracted if kw.lower() not in [r.lower() for r in resume_keywords_extracted]]
        found_in_resume = [kw for kw in jd_keywords_extracted if kw.lower() in [r.lower() for r in resume_keywords_extracted]]
        print(f"[ATS-SCORE] JD keywords FOUND in resume: {len(found_in_resume)}/{len(jd_keywords_extracted)}")
        if found_in_resume:
            print(f"[ATS-SCORE] Found keywords: {', '.join(found_in_resume[:20])}")
            if len(found_in_resume) > 20:
                print(f"  ... and {len(found_in_resume) - 20} more")
        print(f"[ATS-SCORE] JD keywords MISSING from resume: {len(missing_from_resume)}")
        if missing_from_resume:
            print(f"[ATS-SCORE] Missing keywords: {', '.join(missing_from_resume[:20])}")
            if len(missing_from_resume) > 20:
                print(f"  ... and {len(missing_from_resume) - 20} more")
        
        print("\n[ATS-SCORE] --- CALLING LLM FOR DETAILED ANALYSIS ---")
        # Call LLM for ATS score calculation
        response_text = call_llm(prompt, ATS_SCORE_SYSTEM_PROMPT, temperature=0.0)
        
        print(f"[ATS-SCORE] LLM returned {len(response_text) if response_text else 0} chars")
        
        # Parse JSON response
        score_data = extract_structured_json(response_text)
        
        # Validate response structure
        if "ats_score" not in score_data:
            raise ValueError("Invalid ATS score response: missing 'ats_score' field")
        
        if "breakdown" not in score_data:
            raise ValueError("Invalid ATS score response: missing 'breakdown' field")
        
        breakdown = score_data["breakdown"]
        if not all(key in breakdown for key in ["keyword_matching", "keyword_placement", "keyword_density", "relevance_alignment"]):
            raise ValueError("Invalid ATS score response: incomplete breakdown")
        
        # Ensure scores are within valid range
        ats_score = max(0, min(100, float(score_data["ats_score"])))
        breakdown["keyword_matching"] = max(0, min(100, float(breakdown["keyword_matching"])))
        breakdown["keyword_placement"] = max(0, min(100, float(breakdown["keyword_placement"])))
        breakdown["keyword_density"] = max(0, min(100, float(breakdown["keyword_density"])))
        breakdown["relevance_alignment"] = max(0, min(100, float(breakdown["relevance_alignment"])))
        
        # Filter out irrelevant keywords from missing_keywords and recommendations
        # These are cookie/privacy/form-related keywords that should NOT appear in job requirements
        irrelevant_keywords_exact = [
            'cookie', 'cookies', 'consent', 'privacy policy', 'privacy', 'personal data', 
            'data protection', 'gdpr', 'tracking', 'targeting',
            'apply now', 'submit', 'upload', 'browse', 'choose file', 'required field',
            'first name', 'last name', 'email', 'phone', 'address', 'city', 'state', 'zip',
            'click here', 'learn more', 'read more', 'view job', 'share job', 'save job',
            'follow us', 'connect with us', 'social media', 'copyright', 'all rights reserved'
        ]
        
        # Non-actionable requirements that shouldn't be in missing_keywords
        # (These are qualifications/eligibility requirements, not technical skills)
        non_actionable_patterns = [
            r'\b\d+\s*(months?|years?|weeks?)\s*(of\s*)?(experience|work|employment)',
            r'\bless\s+than\s+or\s+equal\s+to\s+\d+',
            r'\bmore\s+than\s+\d+',
            r'\bat\s+least\s+\d+',
            r'\bminimum\s+of\s+\d+',
            r'\bmaximum\s+of\s+\d+',
            r'\bsecurity\s+clearance',
            r'\bability\s+to\s+obtain\s+clearance',
            r'\bobtain\s+and\s+maintain\s+clearance',
            r'\beligible\s+for\s+clearance',
            r'\bBachelor\'?s?\s+(degree|of\s+Science|of\s+Arts)',
            r'\bMaster\'?s?\s+(degree|of\s+Science|of\s+Arts)',
            r'\bPhD\b',
            r'\bDoctorate\b',
            r'\bdegree\s+in\s+[A-Z]',
            r'\bmust\s+be\s+located',
            r'\bwilling\s+to\s+relocate',
            r'\bwork\s+authorization',
            r'\blegal\s+right\s+to\s+work',
            r'\bUS\s+citizen',
            r'\bpermanent\s+resident',
        ]
        
        # Keywords that are only irrelevant in certain contexts (e.g., "analytics" in cookie context)
        # But we'll filter them if they appear alone or with cookie-related terms
        context_dependent = ['analytics', 'performance']
        
        def is_irrelevant(text):
            """Check if text contains irrelevant keywords or non-actionable requirements"""
            if not text:
                return False
            text_lower = text.lower().strip()
            
            # Check for exact matches (case-insensitive) - cookie/privacy/form keywords
            for irrelevant in irrelevant_keywords_exact:
                # Use word boundaries to avoid partial matches
                pattern = r'\b' + re.escape(irrelevant.lower()) + r'\b'
                if re.search(pattern, text_lower):
                    return True
            
            # Check for non-actionable requirements (experience duration, clearance, degree, etc.)
            for pattern in non_actionable_patterns:
                if re.search(pattern, text_lower, re.IGNORECASE):
                    return True
            
            # Check for context-dependent keywords when they appear alone or with cookie terms
            for kw in context_dependent:
                pattern = r'\b' + re.escape(kw.lower()) + r'\b'
                if re.search(pattern, text_lower):
                    # If it's just the word alone or with cookie-related terms, filter it
                    # But allow it if it's part of a technical phrase
                    if text_lower == kw.lower() or text_lower == kw.lower() + 's':
                        return True
                    # Check if it's mentioned with cookie/privacy terms
                    if any(cookie_term in text_lower for cookie_term in ['cookie', 'privacy', 'consent', 'tracking', 'targeting']):
                        return True
            
            # Check for phrases that indicate cookie/privacy context
            cookie_phrases = [
                'cookie', 'cookies', 'privacy', 'consent', 'personal data', 
                'data privacy', 'cookie consent', 'cookie policy'
            ]
            if any(phrase in text_lower for phrase in cookie_phrases):
                return True
            
            # Check for generic non-technical requirements
            generic_non_technical = [
                'must be', 'required to be', 'must have', 'should have',
                'team player', 'good communication', 'strong communication',
                'work well in', 'collaborative', 'self-motivated'
            ]
            # Only filter if the entire phrase is generic (not part of technical description)
            if any(phrase in text_lower and len(text_lower.split()) < 8 for phrase in generic_non_technical):
                return True
            
            return False
        
        # Filter missing keywords
        missing_keywords = score_data.get("missing_keywords", [])
        filtered_missing = [kw for kw in missing_keywords if not is_irrelevant(kw)]
        
        # Filter recommendations
        recommendations = score_data.get("recommendations", [])
        filtered_recommendations = [rec for rec in recommendations if not is_irrelevant(rec)]
        
        # Filter strengths (less critical, but still filter obvious irrelevant ones)
        strengths = score_data.get("strengths", [])
        filtered_strengths = [s for s in strengths if not is_irrelevant(s)]
        
        print("\n[ATS-SCORE] --- FILTERING IRRELEVANT KEYWORDS ---")
        print(f"[ATS-SCORE] Original missing keywords from LLM: {missing_keywords}")
        print(f"[ATS-SCORE] Filtered {len(missing_keywords) - len(filtered_missing)} irrelevant missing keywords")
        print(f"[ATS-SCORE] Final missing keywords (after filtering): {filtered_missing}")
        print(f"[ATS-SCORE] Filtered {len(recommendations) - len(filtered_recommendations)} irrelevant recommendations")
        print(f"[ATS-SCORE] Final recommendations: {filtered_recommendations}")
        
        print("\n[ATS-SCORE] --- FINAL ATS SCORE RESULTS ---")
        print(f"[ATS-SCORE] Overall ATS Score: {ats_score}%")
        print(f"[ATS-SCORE] Breakdown:")
        print(f"  - Keyword Matching: {breakdown['keyword_matching']}%")
        print(f"  - Keyword Placement: {breakdown['keyword_placement']}%")
        print(f"  - Keyword Density: {breakdown['keyword_density']}%")
        print(f"  - Relevance & Alignment: {breakdown['relevance_alignment']}%")
        print(f"[ATS-SCORE] Strengths: {filtered_strengths}")
        print("="*80)
        print("[ATS-SCORE] ========== ATS SCORE CALCULATION COMPLETE ==========")
        print("="*80 + "\n")
        
        return ATSScoreResponse(
            ats_score=ats_score,
            breakdown=ATSScoreBreakdown(**breakdown),
            missing_keywords=filtered_missing,
            strengths=filtered_strengths,
            recommendations=filtered_recommendations
        )
        
    except Exception as e:
        print(f"[ATS-SCORE] Error calculating ATS score: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"ATS score calculation failed: {str(e)}")


@app.post("/process-and-rewrite", response_model=ResumeRewriteResponse)
async def process_and_rewrite(request: CombinedProcessRequest):
    """
    Combined endpoint: Parse JD and rewrite resume
    NOTE: For faster processing, use /fast-rewrite instead
    """
    # Detect format if not specified
    is_latex_format = request.resume_format == "latex" or is_latex(request.resume)
    
    # Extract original resume metadata for validation (use cache if available)
    resume_hash = str(hash(request.resume))
    if resume_hash in resume_metadata_cache:
        resume_text = resume_metadata_cache[resume_hash]["resume_text"]
        original_skills = resume_metadata_cache[resume_hash]["skills"]
        original_companies = resume_metadata_cache[resume_hash]["companies"]
        original_dates = resume_metadata_cache[resume_hash]["dates"]
    else:
        if is_latex_format:
            resume_text = extract_text_from_latex(request.resume)
        else:
            resume_text = request.resume
        
        original_skills = extract_skills_from_resume(resume_text)
        original_companies = extract_companies_from_resume(resume_text)
        original_dates = extract_dates_from_resume(resume_text)
        
        # Cache metadata
        resume_metadata_cache[resume_hash] = {
            "resume_text": resume_text,
            "skills": original_skills,
            "companies": original_companies,
            "dates": original_dates
        }
    
    # Truncate inputs if very long
    jd_truncated = truncate_prompt_if_needed(request.job_description, max_length=8000)
    resume_truncated = truncate_prompt_if_needed(request.resume, max_length=10000)
    
    # Use combined prompt
    prompt = COMBINED_PROCESS_PROMPT.format(
        job_description=jd_truncated,
        resume=resume_truncated
    )
    system_prompt = COMBINED_PROCESS_SYSTEM_PROMPT
    
    try:
        # Single LLM call for both parsing and rewriting
        response_text = call_llm(prompt, system_prompt, temperature=0.0)
        
        # Parse the combined response
        combined_data = extract_structured_json(response_text)
        
        if "parsed_jd" not in combined_data or "rewritten_resume" not in combined_data:
            raise ValueError("Invalid response format from combined processing")
        
        parsed_jd = JDParseResponse(**combined_data["parsed_jd"])
        rewritten_resume = combined_data["rewritten_resume"]
        
        # Validate the rewritten resume (unless skipped)
        if request.skip_validation:
            validation_result = {
                "passed": True,
                "changes": ["Validation skipped for faster processing"],
                "warnings": [],
                "errors": []
            }
        else:
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
        raise HTTPException(status_code=500, detail=f"Failed to process and rewrite: {str(e)}")


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




@app.get("/get-user-profile")
async def get_user_profile(profile_name: str = "AnishDhandore"):
    """
    Get user profile from profiles/{profile_name}.json
    """
    backend_dir = Path(__file__).resolve().parent
    profiles_dir = backend_dir / "profiles"
    profile_file = profiles_dir / f"{profile_name}.json"
    
    if not profile_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Profile file not found: {profile_file}. Please create profiles/{profile_name}.json"
        )
    
    try:
        profile_content = profile_file.read_text(encoding='utf-8')
        profile_data = json.loads(profile_content)
        return profile_data
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Invalid JSON in profile file: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read profile file: {str(e)}"
        )


@app.get("/get-original-resume")
async def get_original_resume():
    """
    Get the original resume from the resumes/original/AnishDhandoreResume/ directory
    Automatically finds the main .tex file
    """
    # Resolve path - resumes folder is in backend/resumes/
    # __file__ is backend/main.py (absolute path), so parent is backend/
    backend_dir = Path(__file__).resolve().parent  # backend/ (absolute)
    original_dir = backend_dir / "resumes" / "original"
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


@app.post("/parse-resume", response_model=ResumeParseResponse)
async def parse_resume(request: ResumeParseRequest):
    """
    Parse resume into structured JSON format
    Extracts personal info, work history, education, skills, etc.
    """
    from prompts import RESUME_PARSE_PROMPT, RESUME_PARSE_SYSTEM_PROMPT
    
    # Extract text from LaTeX if needed
    if request.resume_format == "latex" or is_latex(request.resume):
        resume_text = extract_text_from_latex(request.resume)
    else:
        resume_text = request.resume
    
    prompt = RESUME_PARSE_PROMPT.format(resume=truncate_prompt_if_needed(resume_text, max_length=12000))
    system_prompt = RESUME_PARSE_SYSTEM_PROMPT
    
    try:
        response_text = call_llm(prompt, system_prompt, temperature=0.0)
        parsed_data = extract_structured_json(response_text)
        return ResumeParseResponse(**parsed_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse resume: {str(e)}")


@app.post("/analyze-form", response_model=FormAnalysisResponse)
async def analyze_form(request: FormAnalysisRequest):
    """
    Analyze HTML form and detect fields, types, and structure
    Uses LLM to intelligently map form fields to user data
    """
    from prompts import FORM_ANALYSIS_PROMPT, FORM_ANALYSIS_SYSTEM_PROMPT
    
    # Truncate HTML if very long (keep structure)
    form_html = truncate_prompt_if_needed(request.form_html, max_length=15000)
    url = request.url or ""
    
    prompt = FORM_ANALYSIS_PROMPT.format(form_html=form_html, url=url)
    system_prompt = FORM_ANALYSIS_SYSTEM_PROMPT
    
    try:
        response_text = call_llm(prompt, system_prompt, temperature=0.0)
        analysis_data = extract_structured_json(response_text)
        
        # Ensure required fields exist
        if "fields" not in analysis_data:
            analysis_data["fields"] = []
        if "file_uploads" not in analysis_data:
            analysis_data["file_uploads"] = []
        
        return FormAnalysisResponse(**analysis_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze form: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "SanaAI Job Assistant API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
