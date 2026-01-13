// Content script for extracting job descriptions and filling forms

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractJD') {
    extractJobDescription()
      .then(jdText => {
        sendResponse({ success: true, jdText });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'fillForm') {
    fillApplicationForm(request.resume)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// Extract job description from page
async function extractJobDescription() {
  // Common selectors for job description sections
  const selectors = [
    '[data-testid*="job-description"]',
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[id*="job-description"]',
    '[id*="jobDescription"]',
    '.job-description',
    '#job-description',
    '[role="main"]',
    'main',
    '.description',
    '#description'
  ];

  let jdText = '';
  
  // Try each selector
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      // Get text from all matching elements
      elements.forEach(el => {
        const text = el.innerText || el.textContent || '';
        if (text.length > jdText.length) {
          jdText = text;
        }
      });
    }
  }

  // Fallback: try to find largest text block (likely the JD)
  if (!jdText || jdText.length < 100) {
    const allTextElements = document.querySelectorAll('p, div, section, article');
    let maxLength = 0;
    allTextElements.forEach(el => {
      const text = el.innerText || el.textContent || '';
      // Look for text blocks that mention common job keywords
      if (text.length > maxLength && 
          (text.toLowerCase().includes('requirements') || 
           text.toLowerCase().includes('qualifications') ||
           text.toLowerCase().includes('responsibilities') ||
           text.toLowerCase().includes('experience'))) {
        maxLength = text.length;
        jdText = text;
      }
    });
  }

  if (!jdText || jdText.length < 50) {
    throw new Error('Could not find job description on this page. Please ensure you are on a job posting page.');
  }

  return jdText.trim();
}

// Fill application form with resume data
async function fillApplicationForm(resumeText) {
  // TODO: Implement site-specific form filling logic
  // This is a generic implementation - customize per job site
  
  // Common form field selectors
  const fieldSelectors = {
    firstName: ['input[name*="first"]', 'input[id*="first"]', 'input[placeholder*="First"]'],
    lastName: ['input[name*="last"]', 'input[id*="last"]', 'input[placeholder*="Last"]'],
    email: ['input[type="email"]', 'input[name*="email"]', 'input[id*="email"]'],
    phone: ['input[type="tel"]', 'input[name*="phone"]', 'input[id*="phone"]'],
    resume: ['input[type="file"]', 'input[name*="resume"]', 'input[id*="resume"]'],
    coverLetter: ['textarea[name*="cover"]', 'textarea[id*="cover"]', 'textarea[name*="letter"]']
  };

  // Extract basic info from resume (simple parsing)
  // TODO: Use more sophisticated parsing or ask user to provide separately
  const resumeLines = resumeText.split('\n');
  const emailMatch = resumeText.match(/[\w.-]+@[\w.-]+\.\w+/);
  const phoneMatch = resumeText.match(/[\d\s\-\(\)\+]{10,}/);

  // Fill text fields
  for (const [field, selectors] of Object.entries(fieldSelectors)) {
    if (field === 'resume') continue; // Handle file upload separately
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (el.type === 'file') return;
        
        if (field === 'email' && emailMatch) {
          el.value = emailMatch[0];
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (field === 'phone' && phoneMatch) {
          el.value = phoneMatch[0];
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (field === 'coverLetter') {
          // TODO: Generate cover letter or use resume summary
          el.value = resumeText.substring(0, 500);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }
  }

  // Handle resume file upload
  // TODO: Convert resume text to file blob and upload
  // This requires more complex handling - for now, user must manually upload
  const resumeInputs = document.querySelectorAll('input[type="file"]');
  if (resumeInputs.length > 0) {
    console.log('Resume file upload detected. Manual upload required for now.');
    // TODO: Create blob from resumeText and set to file input
  }

  // Show confirmation dialog
  const confirmed = confirm(
    'Form fields have been filled. Please review all information carefully.\n\n' +
    'IMPORTANT: Verify all details before submitting.\n\n' +
    'Click OK to continue, or Cancel to review manually.'
  );

  if (!confirmed) {
    throw new Error('User cancelled form filling');
  }
}
