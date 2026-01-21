"""
LLM Prompt Templates for SanaAI Job Assistant

These prompts are designed to be deterministic and structured,
treating the LLM like a compiler rather than a chatbot.
"""

JD_PARSE_PROMPT = """Parse the following job description into structured JSON format.

Job Description:
{job_description}

IMPORTANT: Ignore legal boilerplate text such as:
- Equal Employment Opportunity (EEO) statements
- "THE LAW" references
- Generic company policies
- Standard disclaimers
- Footer text

Focus ONLY on actual job requirements, responsibilities, and qualifications.

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
- skills: Technical and soft skills mentioned (e.g., Python, React, Machine Learning, Communication)
- requirements: Specific job requirements and qualifications (e.g., "Bachelor's degree", "5 years experience", "Experience with cloud platforms")
- keywords: Important terms that should appear in resume (e.g., technologies, methodologies, domain terms)
- experience_years: Minimum years of experience if specified (extract number only)
- education: Education level required (e.g., "Bachelor's", "Master's", "PhD")
- location: Job location (city, state, or remote)
- employment_type: Full-time, Part-time, Contract, etc.

If no relevant skills/requirements/keywords are found (only boilerplate), return empty arrays but still extract other fields.

Return ONLY the JSON object, no additional text."""

JD_PARSE_SYSTEM_PROMPT = """You are a job description parser. Extract structured information from job postings.
Be precise and only extract information that is explicitly stated. Do not infer or assume.
Filter out legal boilerplate, EEO statements, and generic company policies. Focus on actual job requirements.
Return ONLY a valid JSON object. No Markdown, no code fences, no extra text."""

RESUME_REWRITE_PROMPT = """Rewrite the following resume to maximize ATS (Applicant Tracking System) compatibility for this specific job, while STRICTLY adhering to these constraints:

CRITICAL CONSTRAINTS:
1. DO NOT add any new companies or work experiences
2. DO NOT change any dates (employment dates, education dates, etc.)
3. DO NOT add any new qualifications or certifications
4. DO NOT fabricate or invent any experience
5. Preserve all company names exactly as written
6. Preserve all job titles exactly as written
7. Preserve all dates exactly as written
8. For every section the word count should be same as original resume

WHAT YOU CAN DO:
- Add new skills that are not already in the resume
- Rephrase existing descriptions using keywords from the job description
- Reorder bullet points to emphasize relevant experience
- Use synonyms for skills already present (e.g., "Python" -> "Python programming")
- Emphasize relevant experience by moving it higher
- Format for ATS maximum compatibility (single column, plain text, no tables, no complex formatting)

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

RESUME_REWRITE_SYSTEM_PROMPT = """You are a resume optimization tool. Your job is to rewrite resumes for maximizing ATS compatibility (95-100% similarity) while strictly preserving all original information. You are like a compiler - deterministic and precise. Never add totally new information - such as new experience, projects, and education. Return ONLY the rewritten resume text (no fences, no explanations)."""

RESUME_REWRITE_LATEX_PROMPT = """Rewrite the following LaTeX resume code to maximize ATS (Applicant Tracking System) 90-95% similarity to the original resume for this specific job, while STRICTLY adhering to these constraints:

CRITICAL CONSTRAINTS:
0. The Word Count for every section should not exceed the original resume.
1. DO NOT add any new companies or work experiences
2. DO NOT change any dates (employment dates, education dates, etc.)
3. DO NOT add any new qualifications or certifications
4. DO NOT invent any new experience
5. Preserve all company names exactly as written
6. You can change the job title to a more relevant one that is mentioned in the job description while making sure it is still a valid job title and not hallucinated.
7. Preserve all dates exactly as written
8. For every section the word count should be less or same as original resume so we do not go on to the next page.
9. Maintain valid LaTeX syntax - the output must be compilable LaTeX code
10. Preserve the document structure and formatting commands

WHAT YOU CAN DO:
- Rephrase existing descriptions using keywords from the job description
- Reorder sections or bullet points to emphasize relevant experience
- Use synonyms for skills already present (e.g., "Python" -> "Python programming")
- Emphasize relevant experience by moving it higher in sections
- Optimize LaTeX content for 90-95% similarity to ATS while keeping LaTeX structure
- Add keywords naturally within existing LaTeX commands
- Enhance bullet points with more specific, keyword-rich descriptions
- Make descriptions more impactful and ATS-friendly

Job Requirements:
Skills: {skills}
Keywords: {keywords}
Requirements: {requirements}

IMPORTANT: Even if skills/keywords are minimal or generic, you MUST still optimize the resume by:
- Rephrasing bullet points to be more impactful and keyword-rich
- Using stronger action verbs
- Making descriptions more specific and quantifiable
- Reordering content to highlight most relevant experience first
- Enhancing existing descriptions with better wording
- Use words or skills that the job description mentions

Original LaTeX Resume Code:
{resume}

Return ONLY the rewritten LaTeX code. The output must:
- Be valid, compilable LaTeX code
- Include all necessary \\documentclass, \\usepackage, and document structure
- Preserve the original LaTeX document structure
- Optimize content for ATS while maintaining LaTeX formatting
- Include relevant keywords naturally in the LaTeX content
- ALWAYS make improvements to wording and structure, even if keywords are limited

Return ONLY the complete LaTeX code, no explanations or metadata. DO NOT include any text explaining why changes were or weren't made."""

RESUME_REWRITE_LATEX_SYSTEM_PROMPT = """You are a LaTeX resume optimization tool. Your job is to rewrite LaTeX resume code for ATS compatibility while strictly preserving all original information and maintaining valid LaTeX syntax. You are like a compiler - deterministic and precise. Always return valid, compilable LaTeX code. Give the best possible output for 90-95% similarity to the original resume. Return ONLY the LaTeX code (no fences, no explanations)."""

COMBINED_PROCESS_PROMPT = """You will parse a job description and rewrite a resume in a single step.

STEP 1: Parse the job description below and extract:
- Skills (technical and soft skills)
- Keywords (important terms for ATS)
- Requirements (qualifications, education, experience)

STEP 2: Rewrite the resume to maximize ATS (Applicant Tracking System) 90-95% similarity to the original resume for this specific job.

Job Description:
{job_description}

CRITICAL CONSTRAINTS:
0. The Word Count for every section should not exceed the original resume.
1. DO NOT add any new companies or work experiences
2. DO NOT change any dates (employment dates, education dates, etc.)
3. DO NOT add any new qualifications or certifications
4. DO NOT invent any new experience
5. Preserve all company names exactly as written
6. You can change the job title to a more relevant one that is mentioned in the job description while making sure it is still a valid job title and not hallucinated.
7. Preserve all dates exactly as written
8. For every section the word count should be less or same as original resume so we do not go on to the next page.
9. Maintain valid LaTeX syntax - the output must be compilable LaTeX code
10. Preserve the document structure and formatting commands

WHAT YOU CAN DO:
- Rephrase existing descriptions using keywords from the job description
- Reorder sections or bullet points to emphasize relevant experience
- Use synonyms for skills already present (e.g., "Python" -> "Python programming")
- Emphasize relevant experience by moving it higher in sections
- Optimize LaTeX content for 90-95% similarity to ATS while keeping LaTeX structure
- Add keywords naturally within existing LaTeX commands
- Enhance bullet points with more specific, keyword-rich descriptions
- Make descriptions more impactful and ATS-friendly

IMPORTANT: Even if skills/keywords are minimal or generic, you MUST still optimize the resume by:
- Rephrasing bullet points to be more impactful and keyword-rich
- Using stronger action verbs
- Making descriptions more specific and quantifiable
- Reordering content to highlight most relevant experience first
- Enhancing existing descriptions with better wording
- Use words or skills that the job description mentions

Original Resume:
{resume}

Return ONLY a JSON object with this structure:
{{
  "parsed_jd": {{
    "skills": ["skill1", "skill2", ...],
    "keywords": ["keyword1", "keyword2", ...],
    "requirements": ["req1", "req2", ...],
    "experience_years": <number or null>,
    "education": "<string or null>",
    "location": "<string or null>",
    "employment_type": "<string or null>"
  }},
  "rewritten_resume": "<complete rewritten resume code/text>"
}}

The rewritten_resume output must:
- Be valid, compilable LaTeX code (if input is LaTeX)
- Include all necessary \\documentclass, \\usepackage, and document structure
- Preserve the original LaTeX document structure
- Optimize content for ATS while maintaining LaTeX formatting
- Include relevant keywords naturally in the LaTeX content
- ALWAYS make improvements to wording and structure, even if keywords are limited

Return ONLY the JSON object, no additional text. DO NOT include any text explaining why changes were or weren't made."""

COMBINED_PROCESS_SYSTEM_PROMPT = """You are an expert in resume optimization and job description parsing. Process both in a single step for maximum efficiency and speed. Return ONLY a single JSON object exactly matching the specified schema. No Markdown, no code fences, no extra text."""

RESUME_PARSE_PROMPT = """Extract structured information from the following resume. Parse it into a JSON object with personal information, work history, education, skills, and other relevant sections.

Resume:
{resume}

Return ONLY a valid JSON object with this structure:
{{
  "personalInfo": {{
    "firstName": "<first name or null>",
    "lastName": "<last name or null>",
    "fullName": "<full name or null>",
    "email": "<email or null>",
    "phone": "<phone number or null>",
    "address": {{
      "street": "<street address or null>",
      "city": "<city or null>",
      "state": "<state or null>",
      "zip": "<zip code or null>",
      "country": "<country or null>"
    }},
    "linkedin": "<LinkedIn URL or null>",
    "website": "<website URL or null>"
  }},
  "workHistory": [
    {{
      "company": "<company name>",
      "title": "<job title>",
      "startDate": "<start date in YYYY-MM format or null>",
      "endDate": "<end date in YYYY-MM format or 'present' or null>",
      "description": "<job description>",
      "location": "<location or null>"
    }}
  ],
  "education": [
    {{
      "school": "<school name>",
      "degree": "<degree type>",
      "major": "<major/field of study or null>",
      "gpa": "<GPA or null>",
      "startDate": "<start date in YYYY-MM format or null>",
      "endDate": "<end date in YYYY-MM format or null>",
      "location": "<location or null>"
    }}
  ],
  "skills": ["skill1", "skill2", ...],
  "summary": "<professional summary or null>",
  "projects": [
    {{
      "name": "<project name>",
      "description": "<project description>",
      "technologies": ["tech1", "tech2", ...],
      "url": "<project URL or null>",
      "startDate": "<start date in YYYY-MM format or null>",
      "endDate": "<end date in YYYY-MM format or 'present' or null>"
    }}
  ],
  "references": [
    {{
      "name": "<reference name>",
      "email": "<email or null>",
      "phone": "<phone or null>",
      "relationship": "<relationship or null>"
    }}
  ]
}}

Extract all available information. If a field is not present, use null. For dates, try to extract and normalize to YYYY-MM format if possible.
Return ONLY the JSON object, no additional text."""

RESUME_PARSE_SYSTEM_PROMPT = """You are a resume parser. Extract structured information from resumes accurately. Parse dates, names, and other fields precisely. Return only valid JSON."""

FORM_ANALYSIS_PROMPT = """Analyze the following HTML form and identify all form fields, their types, labels, and how to fill them.

Form HTML:
{form_html}

Page URL: {url}

Return ONLY a valid JSON object with this structure:
{{
  "fields": [
    {{
      "id": "<field id or null>",
      "name": "<field name attribute or null>",
      "type": "<field type: text, email, tel, select, textarea, file, checkbox, radio, date, etc.>",
      "label": "<field label text or null>",
      "placeholder": "<placeholder text or null>",
      "selector": "<CSS selector to find this field>",
      "required": <true or false>,
      "mappedTo": "<what user data field this maps to: firstName, lastName, email, phone, address, workHistory, education, skills, resume, coverLetter, etc.>",
      "options": ["<option1>", "<option2>", ...] // for select/radio fields
    }}
  ],
  "steps": [
    {{
      "stepNumber": 1,
      "name": "<step name>",
      "fields": ["<field selector1>", "<field selector2>", ...],
      "nextButton": "<CSS selector for next/continue button>",
      "isLastStep": false
    }}
  ],
  "site_type": "<greenhouse, lever, workday, linkedin, generic, etc. or null>",
  "file_uploads": [
    {{
      "selector": "<CSS selector>",
      "type": "<resume, coverLetter, portfolio, transcript, etc.>",
      "accept": "<accepted file types or null>"
    }}
  ]
}}

Identify:
- All input fields, textareas, selects, file inputs
- Field labels (from <label>, aria-label, placeholder, or nearby text)
- Field types and purposes
- Multi-step form structure (if present)
- File upload fields and their purposes
- Required vs optional fields

For site_type, detect common ATS platforms:
- greenhouse.io -> "greenhouse"
- lever.co -> "lever"
- workday.com -> "workday"
- linkedin.com -> "linkedin"
- jobs.lever.co -> "lever"
- boards.greenhouse.io -> "greenhouse"
- Otherwise -> "generic"

Return ONLY the JSON object, no additional text."""

FORM_ANALYSIS_SYSTEM_PROMPT = """You are a form analyzer. Analyze HTML forms and identify fields, their types, and how to fill them. Be precise with CSS selectors and field mappings."""

# =============================================================================
# FAST REWRITE PROMPTS (for /fast-rewrite endpoint)
# These use the same logic as RESUME_REWRITE_LATEX but return raw LaTeX
# =============================================================================

FAST_REWRITE_PROMPT = """Rewrite the following LaTeX resume code to achieve 95-100% ATS (Applicant Tracking System) similarity for this specific job.

CRITICAL CONSTRAINTS (ABSOLUTE — DO NOT VIOLATE):
1. DO NOT add new companies, roles, or experiences
2. DO NOT change any dates
3. DO NOT invent tools, platforms, or achievements
4. Preserve all company names exactly
5. Preserve valid, compilable LaTeX
6. Preserve overall document structure and formatting commands

ATS ENFORCEMENT RULES (MANDATORY):
- Core JD keywords MUST appear ≥5 times across Experience + Projects
- Tool/platform keywords MUST appear ≥3 times
- Multi-word JD phrases MUST appear verbatim at least once
- Keywords MUST appear primarily in:
  • Job titles
  • First experience role
  • Project descriptions
- Skills section is LOW priority for ATS scoring

SECTION WEIGHTING (REAL ATS BEHAVIOR):
- Experience: 60% of keyword usage
- Projects: 30% of keyword usage
- Skills/Coursework: 10% max

JOB TITLE OPTIMIZATION:
- You MAY adapt existing job titles to include JD-aligned phrases
- Titles must remain truthful and based on existing responsibilities
- Example: "Software Engineer" → "Software Engineer – Backend & ML Systems"

KEYWORD STRATEGY (STRICT):
- Use EXACT terminology from the JD
- Repeat important keywords naturally
- Use BOTH exact keywords AND close technical synonyms
- Avoid dumping keywords into lists — embed them in context

METRICS RULE:
- Use qualitative or bounded metrics only (e.g., "improved latency", "scaled concurrency")
- DO NOT fabricate numbers

Job Requirements:
CORE KEYWORDS (HIGH PRIORITY):
{core_keywords}

TOOLS / PLATFORMS:
{tool_keywords}

SECONDARY / CONTEXTUAL:
{secondary_keywords}

Original LaTeX Resume:
{resume}

OUTPUT REQUIREMENTS:
- Return ONLY rewritten LaTeX
- No explanations
- No markdown fences
- Must compile
- Aggressively optimized for ATS similarity"""

FAST_REWRITE_SYSTEM_PROMPT = """You are an expert LaTeX resume optimization tool specializing in ATS (Applicant Tracking System) compatibility. Your goal is to achieve 95-100% ATS similarity by enforcing keyword frequency requirements, section-aware placement, and job title alignment. You must ensure core keywords appear ≥5 times in Experience + Projects, tool keywords ≥3 times, and prioritize Experience section (60% of keyword usage). While strictly preserving critical facts (companies, dates, no new experiences), be aggressive in embedding keywords naturally in context, not dumping them in lists. Always return valid, compilable LaTeX code. Return ONLY the LaTeX code (no fences, no explanations)."""

# ATS Score Calculation Prompt
ATS_SCORE_PROMPT = """Calculate the ATS (Applicant Tracking System) compatibility score for this resume against the job description.

Job Description:
{job_description}

Resume (LaTeX format):
{resume}

CRITICAL: IGNORE these irrelevant keywords that may appear in the job description but are NOT actual job requirements:
- Cookie/privacy-related: "cookies", "cookie", "consent", "privacy policy", "personal data", "data protection", "GDPR", "tracking", "analytics cookies", "performance cookies", "targeting cookies"
- Form/UI-related: "apply now", "submit", "upload", "browse", "choose file", "required field", "first name", "last name", "email", "phone", "address"
- Navigation/UI: "click here", "learn more", "read more", "view job", "share job", "save job"
- Footer/legal: "follow us", "connect with us", "social media", "copyright", "all rights reserved"

ONLY consider actual job requirements, technical skills, qualifications, responsibilities, and experience requirements.

Calculate the ATS score based on these factors:

1. KEYWORD MATCHING (40% weight):
   - Core keywords from JD appearing in resume (ONLY job-relevant keywords)
   - Tool/platform keywords from JD appearing in resume
   - Technical terminology matching
   - Exact phrase matching (multi-word terms from JD)
   - IGNORE cookie/privacy/form keywords

2. KEYWORD PLACEMENT (25% weight):
   - Keywords in Experience section (highest weight)
   - Keywords in Projects section (medium weight)
   - Keywords in Skills section (lowest weight)
   - Keywords in job titles (bonus)

3. KEYWORD DENSITY (15% weight):
   - Frequency of important keywords (core keywords should appear 3-5+ times)
   - Natural keyword distribution (not keyword stuffing)
   - Contextual usage (keywords in meaningful sentences)

4. RELEVANCE & ALIGNMENT (20% weight):
   - How well experience descriptions match JD requirements
   - How well projects align with JD needs
   - Overall thematic alignment with job description

Return ONLY a JSON object with this exact structure:
{{
  "ats_score": <number between 0-100>,
  "breakdown": {{
    "keyword_matching": <number 0-100>,
    "keyword_placement": <number 0-100>,
    "keyword_density": <number 0-100>,
    "relevance_alignment": <number 0-100>
  }},
  "missing_keywords": ["keyword1", "keyword2", ...],
  "strengths": ["strength1", "strength2", ...],
  "recommendations": ["recommendation1", "recommendation2", ...]
}}

CRITICAL RULES FOR "missing_keywords":
- "missing_keywords" MUST ONLY contain keywords/phrases that appear in the JOB DESCRIPTION but are NOT found in the RESUME
- DO NOT list keywords that are in the resume but not in the JD - those are NOT missing
- DO NOT list keywords from the resume - only list keywords from the JD that are missing
- Focus EXCLUSIVELY on TECHNICAL skills, tools, platforms, frameworks, methodologies that can be added to a resume
- DO NOT include non-actionable requirements such as:
  * Experience duration requirements (e.g., "6 months experience", "5 years", "less than X months")
  * Eligibility requirements (e.g., "security clearance", "ability to obtain clearance", "must be eligible")
  * Degree requirements (e.g., "Bachelor's degree", "Master's degree") - these are qualifications, not skills
  * Location requirements (e.g., "must be located in", "willing to relocate")
  * Work authorization requirements
  * Soft skills that are too generic (e.g., "team player", "good communication")
- ONLY include actionable technical keywords like:
  * Programming languages (Java, Python, JavaScript, etc.)
  * Tools/Platforms (Docker, Kubernetes, AWS, etc.)
  * Frameworks (Spring, React, Django, etc.)
  * Methodologies (Agile, CI/CD, DevOps, etc.)
  * Technical concepts (Object-Oriented Design, REST APIs, Microservices, etc.)
  * Specific technologies or libraries
- If a keyword appears in both JD and resume, it should NOT be in missing_keywords
- DO NOT include cookie/privacy/form/UI keywords
- If the JD doesn't mention a keyword, it should NOT be in missing_keywords (even if it's in the resume)

IMPORTANT RULES:
- "strengths" should highlight what the resume does well in matching the JD
- "recommendations" should suggest how to incorporate missing JD keywords into the resume
- DO NOT include cookie/privacy/form/UI keywords in any field
- If the JD mentions cookies/privacy in the context of actual job requirements (e.g., "implement cookie-based authentication"), that's valid - but generic cookie consent/privacy policy text is NOT

Be precise and realistic. A score of 95-100% means the resume is nearly perfect for the JD. A score of 80-94% is good but could be improved. Below 80% needs significant optimization.

Return ONLY the JSON object, no additional text."""

ATS_SCORE_SYSTEM_PROMPT = """You are an ATS (Applicant Tracking System) scoring expert. You analyze resumes against job descriptions and calculate precise compatibility scores. You understand how real ATS systems work - they scan for keywords, check placement, measure density, and assess relevance. 

CRITICAL: When identifying "missing_keywords", you MUST:
1. Extract important TECHNICAL keywords/phrases FROM THE JOB DESCRIPTION
2. Check if each keyword appears IN THE RESUME
3. Only list TECHNICAL keywords that are IN THE JD but NOT IN THE RESUME
4. NEVER list keywords that are only in the resume - those are NOT missing from the JD's perspective
5. EXCLUDE non-actionable requirements like:
   - Experience duration (e.g., "6 months", "5 years", "less than X")
   - Eligibility requirements (e.g., "security clearance", "ability to obtain")
   - Degree requirements (e.g., "Bachelor's degree")
   - Location/authorization requirements
6. ONLY include actionable technical skills: programming languages, tools, frameworks, technologies, methodologies

Be accurate, realistic, and provide actionable feedback. Return ONLY valid JSON, no markdown, no code fences."""
