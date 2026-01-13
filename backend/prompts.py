"""
LLM Prompt Templates for SanaAI Job Assistant

These prompts are designed to be deterministic and structured,
treating the LLM like a compiler rather than a chatbot.
"""

JD_PARSE_PROMPT = """Parse the following job description into structured JSON format.

Job Description:
{job_description}

Return ONLY a valid JSON object with the following structure:
{{
  "skills": ["skill1", "skill2", ...],
  "requirements": ["requirement1", "requirement2", ...],
  "keywords": ["keyword1", "keyword2", ...],
  "experience_years": <number or null>,
  "education": "<string or null>",
  "location": "<string or null>",
  "employment_type": "<string or null>"
}}

Extract:
- skills: Technical and soft skills mentioned
- requirements: Specific job requirements and qualifications
- keywords: Important terms that should appear in resume
- experience_years: Minimum years of experience if specified
- education: Education level required
- location: Job location
- employment_type: Full-time, Part-time, Contract, etc.

Return ONLY the JSON object, no additional text."""

JD_PARSE_SYSTEM_PROMPT = """You are a job description parser. Extract structured information from job postings.
Be precise and only extract information that is explicitly stated. Do not infer or assume."""

RESUME_REWRITE_PROMPT = """Rewrite the following resume to maximize ATS (Applicant Tracking System) compatibility for this specific job, while STRICTLY adhering to these constraints:

CRITICAL CONSTRAINTS:
1. DO NOT add any new skills that are not already in the resume
2. DO NOT add any new companies or work experiences
3. DO NOT change any dates (employment dates, education dates, etc.)
4. DO NOT add any new qualifications or certifications
5. DO NOT fabricate or invent any experience
6. Preserve all company names exactly as written
7. Preserve all job titles exactly as written
8. Preserve all dates exactly as written

WHAT YOU CAN DO:
- Rephrase existing descriptions using keywords from the job description
- Reorder bullet points to emphasize relevant experience
- Use synonyms for skills already present (e.g., "Python" -> "Python programming")
- Emphasize relevant experience by moving it higher
- Format for ATS compatibility (single column, plain text, no tables, no complex formatting)

Job Requirements:
Skills: {skills}
Keywords: {keywords}
Requirements: {requirements}

Original Resume:
{resume}

Return the rewritten resume in ATS-safe format:
- Single column layout
- Plain text (no tables, no complex formatting)
- Standard sections: Contact, Summary, Experience, Education, Skills
- Use simple formatting (bullets, line breaks)
- Ensure all keywords from job description appear naturally in context

Return ONLY the rewritten resume text, no explanations or metadata."""

RESUME_REWRITE_SYSTEM_PROMPT = """You are a resume optimization tool. Your job is to rewrite resumes for ATS compatibility while strictly preserving all original information. You are like a compiler - deterministic and precise. Never add new information."""

RESUME_REWRITE_LATEX_PROMPT = """Rewrite the following LaTeX resume code to maximize ATS (Applicant Tracking System) compatibility for this specific job, while STRICTLY adhering to these constraints:

CRITICAL CONSTRAINTS:
1. DO NOT add any new skills that are not already in the resume
2. DO NOT add any new companies or work experiences
3. DO NOT change any dates (employment dates, education dates, etc.)
4. DO NOT add any new qualifications or certifications
5. DO NOT fabricate or invent any experience
6. Preserve all company names exactly as written
7. Preserve all job titles exactly as written
8. Preserve all dates exactly as written
9. Maintain valid LaTeX syntax - the output must be compilable LaTeX code
10. Preserve the document structure and formatting commands

WHAT YOU CAN DO:
- Rephrase existing descriptions using keywords from the job description
- Reorder sections or bullet points to emphasize relevant experience
- Use synonyms for skills already present (e.g., "Python" -> "Python programming")
- Emphasize relevant experience by moving it higher in sections
- Optimize LaTeX content for ATS while keeping LaTeX structure
- Add keywords naturally within existing LaTeX commands

Job Requirements:
Skills: {skills}
Keywords: {keywords}
Requirements: {requirements}

Original LaTeX Resume Code:
{resume}

Return ONLY the rewritten LaTeX code. The output must:
- Be valid, compilable LaTeX code
- Include all necessary \\documentclass, \\usepackage, and document structure
- Preserve the original LaTeX document structure
- Optimize content for ATS while maintaining LaTeX formatting
- Ensure all keywords from job description appear naturally in the LaTeX content

Return ONLY the complete LaTeX code, no explanations or metadata."""

RESUME_REWRITE_LATEX_SYSTEM_PROMPT = """You are a LaTeX resume optimization tool. Your job is to rewrite LaTeX resume code for ATS compatibility while strictly preserving all original information and maintaining valid LaTeX syntax. You are like a compiler - deterministic and precise. Never add new information. Always return valid, compilable LaTeX code."""
