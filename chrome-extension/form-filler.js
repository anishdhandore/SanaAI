/**
 * Smart Form Filler for SanaAI
 * Handles complex form filling including multi-step forms, file uploads, and pagination
 */

class SmartFormFiller {
  constructor(backendUrl, userProfile = null, profileName = "AnishDhandore") {
    this.backendUrl = backendUrl;
    this.profileName = profileName;
    this.userProfile = userProfile; // Will be loaded from backend if null
    this.currentStep = 0;
    this.formAnalysis = null;
    this.filledFields = new Set();
    this.profileLoaded = false;
    this.debugMode = false; // Enable debug mode for visual feedback
    this.mutationObserver = null;
    this.iframeDocuments = new Map(); // Track accessible iframes
    // Tunable speed settings (optimize for faster fills)
    this.delays = {
      input: 20,
      select: 30,
      checkbox: 20,
      radio: 20,
      date: 30,
      file: 120,
      comboboxType: 20,
      comboboxSelect: 40,
      stepWait: 50,
      mutationMaxWait: 4000 // ms
    };
  }

  /**
   * Load user profile from backend JSON file
   */
  async loadUserProfile() {
    if (this.profileLoaded && this.userProfile) {
      return this.userProfile;
    }

    try {
      console.log(`[FormFiller] Loading user profile: ${this.profileName}`);
      const response = await fetch(`${this.backendUrl}/get-user-profile?profile_name=${this.profileName}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load profile: ${response.statusText}`);
      }

      this.userProfile = await response.json();
      this.profileLoaded = true;
      console.log('[FormFiller] Profile loaded successfully:', this.userProfile);
      
      // Make it globally available for panel.js
      if (typeof window !== 'undefined') {
        window.HARDCODED_USER_PROFILE = this.userProfile;
      }
      
      return this.userProfile;
    } catch (error) {
      console.error('[FormFiller] Error loading user profile:', error);
      throw new Error(`Failed to load user profile: ${error.message}`);
    }
  }

  /**
   * Main entry point: Fill form intelligently
   */
  async fillForm(resumeText, resumeFormat = 'text', resumePdfBlob = null) {
    try {
      // Step 1: Load static user profile (personal info) from backend JSON
      if (!this.userProfile || !this.profileLoaded) {
        console.log('[FormFiller] Loading static user profile from backend...');
        await this.loadUserProfile();
      }

      // Step 2: Parse the resume (rewritten or original) to get dynamic work experience, projects, and skills
      // If rewritten resume exists, use it (tailored for job). Otherwise use original resume.
      console.log('[FormFiller] Parsing resume for dynamic content...');
      const parsedResume = await this.parseResume(resumeText, resumeFormat);
      
      // Step 3: Merge static profile (personal info) with dynamic resume data (work/education/projects)
      // Personal info stays from JSON, but work history, education, skills come from the tailored resume
      this.userProfile = {
        ...this.userProfile,
        // Keep personal info from JSON profile (doesn't change)
        personalInfo: this.userProfile.personalInfo,
        // Use dynamic data from parsed resume (changes per application)
        workHistory: parsedResume.workHistory || this.userProfile.workHistory || [],
        education: parsedResume.education || this.userProfile.education || [],
        skills: parsedResume.skills || this.userProfile.skills || [],
        projects: parsedResume.projects || this.userProfile.projects || [], // Projects from resume
        summary: parsedResume.summary || this.userProfile.summary || null
      };
      
      console.log('[FormFiller] Merged profile - Personal info from JSON, Work/Education/Skills from resume');
      console.log('[FormFiller] Work history entries:', this.userProfile.workHistory?.length || 0);
      console.log('[FormFiller] Education entries:', this.userProfile.education?.length || 0);
      console.log('[FormFiller] Skills:', this.userProfile.skills?.length || 0);

      // Step 4: Analyze form structure
      console.log('[FormFiller] Analyzing form...');
      this.formAnalysis = await this.analyzeForm();
      console.log('[FormFiller] Form analyzed:', this.formAnalysis);
      
      // Enable debug mode if fields were detected
      if (this.formAnalysis.fields && this.formAnalysis.fields.length > 0) {
        this.debugMode = true; // Enable visual feedback
        console.log('[FormFiller] Debug mode enabled - fields will be highlighted when filled');
      }
      
      // Enable debug mode if fields were detected
      if (this.formAnalysis.fields && this.formAnalysis.fields.length > 0) {
        this.debugMode = true; // Enable visual feedback
        console.log('[FormFiller] Debug mode enabled - fields will be highlighted when filled');
      }

      // Step 5: Fill form step by step
      if (this.formAnalysis.steps && this.formAnalysis.steps.length > 0) {
        return await this.fillMultiStepForm(resumePdfBlob);
      } else {
        return await this.fillSinglePageForm(resumePdfBlob);
      }
    } catch (error) {
      console.error('[FormFiller] Error filling form:', error);
      throw error;
    }
  }

  /**
   * Parse resume into structured JSON
   */
  async parseResume(resumeText, resumeFormat) {
    try {
      const response = await fetch(`${this.backendUrl}/parse-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: resumeText,
          resume_format: resumeFormat
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to parse resume: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[FormFiller] Resume parsing error:', error);
      // Fallback to basic extraction
      return this.extractBasicInfo(resumeText);
    }
  }

  /**
   * Extract basic info from resume (fallback)
   */
  extractBasicInfo(resumeText) {
    const emailMatch = resumeText.match(/[\w.-]+@[\w.-]+\.\w+/);
    const phoneMatch = resumeText.match(/[\d\s\-\(\)\+]{10,}/);
    const nameMatch = resumeText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/m);

    return {
      personalInfo: {
        email: emailMatch ? emailMatch[0] : null,
        phone: phoneMatch ? phoneMatch[0] : null,
        fullName: nameMatch ? nameMatch[0] : null,
        firstName: nameMatch ? nameMatch[0].split(' ')[0] : null,
        lastName: nameMatch ? nameMatch[0].split(' ').slice(1).join(' ') : null,
        address: {}
      },
      workHistory: [],
      education: [],
      skills: [],
      summary: null
    };
  }

  /**
   * Analyze form structure - NO FORM TAGS REQUIRED
   * Modern ATS (Workday, Greenhouse, Lever) don't use <form> tags
   * We detect input fields directly, not form containers
   */
  async analyzeForm() {
    // Step 1: Discover and track iframes
    await this.discoverIframes();
    
    // Step 2: Wait for form elements with MutationObserver (handles dynamic content)
    await this.waitForFormElementsWithObserver();
    
    // Step 3: Detect ALL input-like elements (including contenteditable and role="textbox")
    // This is the ONLY thing that matters - we don't care about <form> tags
    let allFields = this.getAllFields();
    
    console.log(`[FormFiller] Detected ${allFields.length} total input-like fields`);
    
    // Step 4: If no fields found, try relaxed detection
    if (allFields.length === 0) {
      console.warn('[FormFiller] No fields found with standard detection, trying relaxed detection...');
      const relaxedFields = this.getAllFieldsRelaxed();
      if (relaxedFields.length > 0) {
        console.log(`[FormFiller] Found ${relaxedFields.length} fields with relaxed detection`);
        allFields = relaxedFields;
      } else {
        // Log diagnostic information
        const allInputs = document.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="textbox"]');
        console.error(`[FormFiller] Diagnostic: Found ${allInputs.length} total input-like elements on page`);
        console.error(`[FormFiller] Page URL: ${window.location.href}`);
        console.error(`[FormFiller] Page title: ${document.title}`);
        
        // Log first few elements for debugging
        Array.from(allInputs).slice(0, 10).forEach((el, i) => {
          console.error(`[FormFiller] Element ${i + 1}:`, {
            tag: el.tagName,
            type: el.type || 'N/A',
            id: el.id || 'no-id',
            name: el.name || 'no-name',
            className: el.className || 'no-class',
            visible: el.offsetParent !== null,
            display: window.getComputedStyle(el).display
          });
        });
        
        // ONLY error if ZERO inputs exist - we don't care about form tags
        throw new Error('No input fields found on page. Please ensure you are on a page with input fields (form tags are not required).');
      }
    }
    
    // Step 5: Optional LLM analysis for better field mapping (but not required)
    // We can try to send a sample of the page HTML to LLM for smarter field detection
    // But if it fails, we just use direct detection - which is fine!
    if (allFields.length > 0) {
      try {
        // Try to get a reasonable HTML snippet for LLM analysis
        // Find the container with most fields
        const fieldContainers = new Map();
        allFields.forEach(field => {
          try {
            const element = this.findElementBySelector(field.selector);
            if (element) {
              let container = element.parentElement;
              let depth = 0;
              while (container && depth < 5) {
                const fieldCount = Array.from(container.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="textbox"]')).length;
                if (fieldCount >= 3) {
                  const containerId = container.id || container.className || container.tagName;
                  if (!fieldContainers.has(containerId)) {
                    fieldContainers.set(containerId, { element: container, count: fieldCount });
                  }
                  break;
                }
                container = container.parentElement;
                depth++;
              }
            }
          } catch (e) {
            // Skip if element not found
          }
        });
        
        let formHTML = '';
        if (fieldContainers.size > 0) {
          const bestContainer = Array.from(fieldContainers.values()).sort((a, b) => b.count - a.count)[0];
          formHTML = bestContainer.element.outerHTML;
        } else {
          // Fallback: send a smaller portion of the page
          const bodyHTML = document.body ? document.body.outerHTML : '';
          formHTML = bodyHTML.length < 200000 ? bodyHTML : bodyHTML.substring(0, 200000);
        }
        
        if (formHTML && formHTML.length < 500000) {
          console.log('[FormFiller] Attempting LLM analysis for better field mapping...');
          const response = await fetch(`${this.backendUrl}/analyze-form`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              form_html: formHTML,
              url: window.location.href
            })
          });

          if (response.ok) {
            const analysis = await response.json();
            if (analysis.fields && analysis.fields.length > 0) {
              // Validate selectors exist and merge with our detected fields
              const validLLMFields = analysis.fields.filter(field => {
                const element = this.findElementBySelector(field.selector);
                return element !== null;
              });
              
              if (validLLMFields.length > 0) {
                console.log(`[FormFiller] LLM analysis returned ${validLLMFields.length} valid fields`);
                // Use LLM fields if they're better, otherwise use direct detection
                return {
                  fields: validLLMFields.length > allFields.length ? validLLMFields : allFields,
                  steps: analysis.steps || null,
                  site_type: analysis.site_type || 'generic',
                  file_uploads: allFields.filter(f => f.type === 'file').map(f => ({
                    selector: f.selector,
                    type: 'resume'
                  }))
                };
              }
            }
          }
        }
      } catch (error) {
        console.warn('[FormFiller] LLM analysis failed, using direct detection (this is fine):', error.message);
      }
    }
    
    // Step 6: Use direct field detection (this is the primary method - works for all ATS platforms)
    console.log(`[FormFiller] Using direct field detection with ${allFields.length} fields`);
    return {
      fields: allFields,
      steps: null,
      site_type: 'generic',
      file_uploads: allFields.filter(f => f.type === 'file').map(f => ({
        selector: f.selector,
        type: 'resume'
      }))
    };
  }
  
  /**
   * Discover and track accessible iframes
   */
  async discoverIframes() {
    const iframes = document.querySelectorAll('iframe');
    console.log(`[FormFiller] Found ${iframes.length} iframes on page`);
    
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          const iframeUrl = iframe.src || iframe.contentWindow?.location?.href || 'unknown';
          this.iframeDocuments.set(iframe, iframeDoc);
          console.log(`[FormFiller] Accessible iframe found: ${iframeUrl}`);
        } else {
          console.log(`[FormFiller] Cross-origin iframe (cannot access): ${iframe.src || 'unknown'}`);
        }
      } catch (e) {
        console.log(`[FormFiller] Cannot access iframe (cross-origin): ${e.message}`);
      }
    }
  }
  
  /**
   * Wait for form elements using MutationObserver (handles dynamic content)
   */
  async waitForFormElementsWithObserver() {
    return new Promise((resolve) => {
      // Check immediately
      const fields = this.getAllFields();
      if (fields.length > 0) {
        console.log(`[FormFiller] Found ${fields.length} fields immediately`);
        resolve();
        return;
      }
      
      // Set up MutationObserver to watch for new form elements
      let timeoutId = null;
      const maxWait = this.delays.mutationMaxWait || 4000; // Faster overall
      
      const observer = new MutationObserver((mutations) => {
        const fields = this.getAllFields();
        if (fields.length > 0) {
          console.log(`[FormFiller] Found ${fields.length} fields after DOM mutation`);
          observer.disconnect();
          if (timeoutId) clearTimeout(timeoutId);
          resolve();
        }
      });
      
      // Observe document changes
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });
      
      // Also observe iframes
      this.iframeDocuments.forEach((iframeDoc, iframe) => {
        try {
          observer.observe(iframeDoc.body, {
            childList: true,
            subtree: true,
            attributes: true
          });
        } catch (e) {
          console.log('[FormFiller] Cannot observe iframe:', e.message);
        }
      });
      
      // Timeout after maxWait
      timeoutId = setTimeout(() => {
        observer.disconnect();
        const fields = this.getAllFields();
        console.log(`[FormFiller] Wait timeout. Found ${fields.length} fields`);
        resolve();
      }, maxWait);
      
      // Store observer for cleanup
      this.mutationObserver = observer;
    });
  }
  
  /**
   * Get ALL input-like fields including contenteditable and role="textbox"
   */
  getAllFields() {
    const fields = [];
    const documents = [document, ...Array.from(this.iframeDocuments.values())];
    
    console.log(`[FormFiller] Scanning ${documents.length} document(s) for fields...`);
    
    documents.forEach((doc, docIndex) => {
      const docName = docIndex === 0 ? 'main' : `iframe-${docIndex}`;
      
      // Standard form inputs
      const standardInputs = doc.querySelectorAll('input, textarea, select');
      console.log(`[FormFiller] Found ${standardInputs.length} standard inputs in ${docName}`);
      
      standardInputs.forEach(input => {
        // Be more lenient with visibility check - only skip truly hidden fields
        if (input.type !== 'hidden' && !input.disabled) {
          const field = this.createFieldObject(input, docName);
          if (field) {
            fields.push(field);
            console.log(`[FormFiller] Added field: ${field.selector} (${field.type}) - ${field.mappedTo}`);
          }
        }
      });
      
      // Contenteditable elements
      const contenteditables = doc.querySelectorAll('[contenteditable="true"]');
      console.log(`[FormFiller] Found ${contenteditables.length} contenteditable elements in ${docName}`);
      
      contenteditables.forEach(el => {
        if (!el.disabled) {
          const field = this.createFieldObject(el, docName, 'contenteditable');
          if (field) {
            fields.push(field);
            console.log(`[FormFiller] Added contenteditable field: ${field.selector}`);
          }
        }
      });
      
      // Role="textbox" elements
      const textboxes = doc.querySelectorAll('[role="textbox"]');
      console.log(`[FormFiller] Found ${textboxes.length} role="textbox" elements in ${docName}`);
      
      textboxes.forEach(el => {
        if (!el.hasAttribute('contenteditable') && !el.disabled) {
          const field = this.createFieldObject(el, docName, 'textbox');
          if (field) {
            fields.push(field);
            console.log(`[FormFiller] Added textbox field: ${field.selector}`);
          }
        }
      });

      // Role="combobox" / custom dropdowns
      const comboboxes = doc.querySelectorAll('[role="combobox"], [aria-haspopup="listbox"], .select, .dropdown');
      console.log(`[FormFiller] Found ${comboboxes.length} combobox/dropdown elements in ${docName}`);
      comboboxes.forEach(el => {
        if (!el.disabled) {
          const field = this.createFieldObject(el, docName, 'combobox');
          if (field) {
            fields.push(field);
            console.log(`[FormFiller] Added combobox field: ${field.selector}`);
          }
        }
      });
    });
    
    console.log(`[FormFiller] Total fields detected: ${fields.length}`);
    
    // Debug mode: log all fields
    if (this.debugMode || fields.length > 0) {
      console.table(fields.map(f => ({
        selector: f.selector,
        type: f.type,
        mappedTo: f.mappedTo,
        label: f.label || f.placeholder || 'no label'
      })));
    }
    
    return fields;
  }
  
  /**
   * Create field object from element
   */
  createFieldObject(element, docName = 'main', forceType = null) {
    const tagName = element.tagName.toLowerCase();
    const isCombo =
      element.getAttribute('role') === 'combobox' ||
      element.getAttribute('aria-haspopup') === 'listbox' ||
      (element.className && element.className.toLowerCase().includes('dropdown')) ||
      (element.className && element.className.toLowerCase().includes('select'));
    const type = forceType || (isCombo ? 'combobox' : element.type || tagName);
    const name = element.name || element.id || '';
    const label = this.findLabel(element);
    const placeholder = element.placeholder || '';
    const ariaLabel = element.getAttribute('aria-label') || '';
    
    // Build flexible selector
    const selector = this.buildFlexibleSelector(element, docName);
    
    // Guess field mapping
    const mappedTo = this.guessFieldMapping(name, label, placeholder, ariaLabel, type);
    
    return {
      selector: selector,
      type: type,
      mappedTo: mappedTo,
      label: label,
      placeholder: placeholder,
      name: name,
      id: element.id || '',
      options: tagName === 'select' ? Array.from(element.options).map(opt => ({
        value: opt.value,
        text: opt.text
      })) : null
    };
  }
  
  /**
   * Build flexible selector that works even if IDs/classes change
   */
  buildFlexibleSelector(element, docName = 'main') {
    // Prefer ID
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Prefer name attribute
    if (element.name) {
      return `[name="${element.name}"]`;
    }
    
    // Build selector from attributes
    const attrs = [];
    if (element.getAttribute('data-testid')) {
      attrs.push(`[data-testid="${element.getAttribute('data-testid')}"]`);
    }
    if (element.getAttribute('aria-label')) {
      attrs.push(`[aria-label="${element.getAttribute('aria-label')}"]`);
    }
    if (element.placeholder) {
      attrs.push(`[placeholder="${element.placeholder}"]`);
    }
    
    if (attrs.length > 0) {
      return `${element.tagName.toLowerCase()}${attrs[0]}`;
    }
    
    // Use class names (but be careful - they might change)
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(c => c && !c.includes('ng-') && !c.includes('react-'));
      if (classes.length > 0) {
        return `.${classes[0]}`;
      }
    }
    
    // Last resort: use tag + nth-of-type
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(el => el.tagName === element.tagName);
      const index = siblings.indexOf(element);
      if (index >= 0) {
        return `${element.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
      }
    }
    
    return element.tagName.toLowerCase();
  }
  
  /**
   * Find element by selector (handles iframes and multiple documents)
   */
  findElementBySelector(selector) {
    if (!selector) return null;
    
    // Helper: safely query a document with escaping for invalid IDs/selectors
    const safeQuery = (doc, sel) => {
      if (!sel) return null;
      
      // If selector is an ID (#foo), use getElementById (no CSS escaping needed)
      if (sel.startsWith('#')) {
        const rawId = sel.slice(1);
        const byId = doc.getElementById(rawId);
        if (byId) return byId;
        
        // Try escaping the id and querySelector
        try {
          if (typeof CSS !== 'undefined' && CSS.escape) {
            const escaped = CSS.escape(rawId);
            const q = doc.querySelector(`#${escaped}`);
            if (q) return q;
          }
        } catch (e) {
          // ignore
        }
        
        // Fallback: attribute selector
        try {
          const q = doc.querySelector(`[id="${rawId}"]`);
          if (q) return q;
        } catch (e) {
          // ignore
        }
      }
      
      // General selector with try/catch to avoid SyntaxError
      try {
        const el = doc.querySelector(sel);
        if (el) return el;
      } catch (e) {
        // Attempt to escape any #id parts if CSS.escape is available
        try {
          if (typeof CSS !== 'undefined' && CSS.escape) {
            const escapedSel = sel.replace(/#([^\\s#.]+)/g, (_m, idPart) => `#${CSS.escape(idPart)}`);
            const el = doc.querySelector(escapedSel);
            if (el) return el;
          }
        } catch (e2) {
          // ignore
        }
      }
      
      return null;
    };
    
    // Try main document first
    let element = safeQuery(document, selector);
    if (element) return element;
    
    // Try iframes
    for (const iframeDoc of this.iframeDocuments.values()) {
      try {
        element = safeQuery(iframeDoc, selector);
        if (element) return element;
      } catch (e) {
        // Cross-origin or invalid selector in iframe - skip
      }
    }
    
    return null;
  }
  
  /**
   * Check if field is visible and fillable
   */
  isFieldVisible(element) {
    if (!element) return false;
    
    // Skip hidden inputs
    if (element.type === 'hidden') return false;
    
    // Check computed style
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    
    // Check offsetParent (more reliable)
    if (element.offsetParent === null && element.tagName !== 'BODY') {
      return false;
    }
    
    // Check if disabled
    if (element.disabled || element.readOnly) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Relaxed field detection - less strict visibility checks
   */
  getAllFieldsRelaxed() {
    const fields = [];
    const documents = [document, ...Array.from(this.iframeDocuments.values())];
    
    documents.forEach((doc, docIndex) => {
      const docName = docIndex === 0 ? 'main' : `iframe-${docIndex}`;
      
      // Get ALL inputs, even if they seem hidden
      const allInputs = doc.querySelectorAll('input:not([type="hidden"]), textarea, select, [contenteditable="true"], [role="textbox"]');
      
      allInputs.forEach(input => {
        // Only skip if explicitly disabled or readonly
        if (!input.disabled && !input.readOnly) {
          try {
            const field = this.createFieldObject(input, docName);
            if (field) fields.push(field);
          } catch (e) {
            console.warn('[FormFiller] Error creating field object:', e);
          }
        }
      });
    });
    
    return fields;
  }
  
  /**
   * Enhanced field mapping with placeholder and aria-label
   */
  guessFieldMapping(name, label, placeholder, ariaLabel, type) {
    const combined = `${name} ${label} ${placeholder} ${ariaLabel}`.toLowerCase();
    
    // Email
    if (type === 'email' || combined.includes('email')) return 'email';
    
    // Phone
    if (type === 'tel' || combined.includes('phone') || combined.includes('mobile')) return 'phone';
    if (combined.includes('phone type')) return 'phoneType';
    
    // Account login
    if (combined.includes('username') || combined.includes('login')) return 'login';
    if (combined.includes('password')) return combined.includes('confirm') ? 'passwordConfirm' : 'password';
    
    // Name fields
    if ((combined.includes('first') && combined.includes('name')) || combined.includes('fname')) return 'firstName';
    if ((combined.includes('last') && combined.includes('name')) || combined.includes('lname') || combined.includes('surname')) return 'lastName';
    if (combined.includes('full') && combined.includes('name')) return 'fullName';
    
    // Address fields
    if (combined.includes('address') || combined.includes('street')) return 'address';
    if (combined.includes('address type')) return 'addressType';
    if (combined.includes('city')) return 'city';
    if (combined.includes('state') || combined.includes('province')) return 'state';
    if (combined.includes('zip') || combined.includes('postal') || combined.includes('postcode')) return 'zip';
    if (combined.includes('country')) return 'country';
    
    // Resume/CV
    if (combined.includes('resume') || combined.includes('cv') || combined.includes('curriculum')) return 'resume';
    
    // Cover letter
    if (combined.includes('cover') || combined.includes('letter') || combined.includes('motivation')) return 'coverLetter';
    
    // Work experience
    if (combined.includes('work') || combined.includes('experience') || combined.includes('employment') || combined.includes('employment history')) return 'workHistory';
    
    // Education detailed mappings
    if (combined.includes('school') || combined.includes('university') || combined.includes('college')) return 'educationSchool';
    if (combined.includes('degree')) return 'educationDegree';
    if (combined.includes('major') || combined.includes('field of study')) return 'educationMajor';
    if (combined.includes('gpa')) return 'educationGpa';
    if (combined.includes('start') && combined.includes('date')) return 'educationStartDate';
    if (combined.includes('end') && combined.includes('date')) return 'educationEndDate';
    if (combined.includes('graduation') && combined.includes('date')) return 'educationGradDate';
    if (combined.includes('education') || combined.includes('qualification')) return 'education';
    
    // Skills
    if (combined.includes('skill')) return 'skills';
    
    // Projects
    if (combined.includes('project')) return 'projects';
    
    // Summary
    if (combined.includes('summary') || combined.includes('about') || combined.includes('bio')) return 'summary';
    
    return 'other';
  }

  /**
   * Wait for form elements to load (handle dynamic content)
   */
  async waitForFormElements() {
    const maxWait = 5000; // 5 seconds max
    const checkInterval = 200; // Check every 200ms
    let waited = 0;

    while (waited < maxWait) {
      // Check main document
      const forms = document.querySelectorAll('form');
      const inputs = document.querySelectorAll('input, textarea, select');
      
      // Also check iframes (some forms load in iframes)
      let iframeInputs = 0;
      try {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
              iframeInputs += iframeDoc.querySelectorAll('input, textarea, select').length;
            }
          } catch (e) {
            // Cross-origin iframe, can't access
            console.log('[FormFiller] Cannot access iframe (likely cross-origin):', e.message);
          }
        }
      } catch (e) {
        console.log('[FormFiller] Error checking iframes:', e.message);
      }
      
      if (forms.length > 0 || inputs.length > 0 || iframeInputs > 0) {
        console.log(`[FormFiller] Found form elements after ${waited}ms (${forms.length} forms, ${inputs.length} inputs, ${iframeInputs} iframe inputs)`);
        return;
      }
      
      await this.sleep(checkInterval);
      waited += checkInterval;
    }
    
    console.warn('[FormFiller] Waited 5 seconds but no form elements found');
    console.warn('[FormFiller] Page URL:', window.location.href);
    console.warn('[FormFiller] Page title:', document.title);
  }

  /**
   * Find form-like containers (divs, sections, etc. with form inputs)
   */
  findFormLikeContainers() {
    const containers = [];
    const formInputs = document.querySelectorAll('input, textarea, select');
    
    if (formInputs.length === 0) {
      return containers;
    }

    // Group inputs by their common ancestor
    const containerMap = new Map();
    
    formInputs.forEach(input => {
      // Find the closest container (form, div with form-like classes, section, etc.)
      let container = input.closest('form, [role="form"], .form, .application-form, .job-application, section, main, [class*="form"], [class*="application"]');
      
      if (!container) {
        // Look for parent divs with multiple inputs
        let parent = input.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          const inputCount = parent.querySelectorAll('input, textarea, select').length;
          if (inputCount >= 3) {
            container = parent;
            break;
          }
          parent = parent.parentElement;
          depth++;
        }
      }
      
      if (container) {
        const containerId = container.id || container.className || container.tagName;
        if (!containerMap.has(containerId)) {
          const inputCount = container.querySelectorAll('input, textarea, select').length;
          containerMap.set(containerId, {
            element: container,
            inputCount: inputCount
          });
        }
      }
    });

    // Sort by input count (descending)
    return Array.from(containerMap.values())
      .sort((a, b) => b.inputCount - a.inputCount);
  }

  /**
   * Detect fields from entire page (fallback when no form container found)
   */
  detectFieldsFromPage() {
    const fields = [];
    const inputs = document.querySelectorAll('input, textarea, select');

    inputs.forEach(input => {
      // Skip hidden inputs
      if (input.type === 'hidden' || input.style.display === 'none' || input.offsetParent === null) {
        return;
      }

      const type = input.type || 'text';
      const name = input.name || input.id || '';
      const label = this.findLabel(input);

      if (type === 'file') {
        fields.push({
          selector: this.getElementSelector(input),
          type: 'file',
          mappedTo: name.toLowerCase().includes('resume') || label.toLowerCase().includes('resume') ? 'resume' : 'other',
          label: label
        });
      } else {
        const placeholder = input.placeholder || '';
        const ariaLabel = input.getAttribute('aria-label') || '';
        fields.push({
          selector: this.getElementSelector(input),
          type: type,
          mappedTo: this.guessFieldMapping(name, label, placeholder, ariaLabel, type),
          label: label
        });
      }
    });

    console.log(`[FormFiller] Detected ${fields.length} fields from page`);

    return {
      fields: fields,
      steps: null,
      site_type: 'generic',
      file_uploads: Array.from(document.querySelectorAll('input[type="file"]'))
        .filter(input => input.offsetParent !== null)
        .map(input => ({
          selector: this.getElementSelector(input),
          type: 'resume'
        }))
    };
  }

  /**
   * Basic field detection (fallback)
   */
  detectFieldsBasic(form) {
    const fields = [];
    const inputs = form.querySelectorAll('input, textarea, select');

    inputs.forEach(input => {
      const type = input.type || 'text';
      const name = input.name || input.id || '';
      const id = input.id || '';
      const label = this.findLabel(input);

      if (type === 'file') {
        fields.push({
          selector: this.getElementSelector(input),
          type: 'file',
          mappedTo: name.toLowerCase().includes('resume') ? 'resume' : 'other'
        });
      } else {
        const placeholder = input.placeholder || '';
        const ariaLabel = input.getAttribute('aria-label') || '';
        fields.push({
          selector: this.getElementSelector(input),
          type: type,
          mappedTo: this.guessFieldMapping(name, label, placeholder, ariaLabel, type)
        });
      }
    });

    return {
      fields: fields,
      steps: null,
      site_type: 'generic',
      file_uploads: Array.from(form.querySelectorAll('input[type="file"]')).map(input => ({
        selector: this.getElementSelector(input),
        type: 'resume'
      }))
    };
  }

  /**
   * Find label for an input (enhanced with flexible matching)
   */
  findLabel(input) {
    // Try id-based label
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent.trim();
    }

    // Try parent label
    const parentLabel = input.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();

    // Try aria-label
    const ariaLabel = input.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    // Try aria-labelledby
    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelElement = document.getElementById(ariaLabelledBy);
      if (labelElement) return labelElement.textContent.trim();
    }

    // Try placeholder
    if (input.placeholder) return input.placeholder.trim();

    // Try data-label attribute
    const dataLabel = input.getAttribute('data-label');
    if (dataLabel) return dataLabel.trim();

    // Try finding nearby text (common in React/Vue forms)
    const parent = input.parentElement;
    if (parent) {
      // Look for label-like text before the input
      const textNodes = Array.from(parent.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
      for (const textNode of textNodes) {
        const text = textNode.textContent.trim();
        if (text && text.length < 50 && !text.includes('*')) {
          return text;
        }
      }
      
      // Look for span/div with label-like classes
      const labelElement = parent.querySelector('span, div, p, label');
      if (labelElement) {
        const text = labelElement.textContent.trim();
        if (text && text.length < 50) {
          return text;
        }
      }
    }

    return '';
  }

  /**
   * Get CSS selector for element
   */
  getElementSelector(element) {
    if (element.id) return `#${element.id}`;
    if (element.name) return `[name="${element.name}"]`;
    if (element.className) {
      const classes = Array.from(element.classList).join('.');
      if (classes) return `.${classes}`;
    }
    return element.tagName.toLowerCase();
  }


  /**
   * Fill multi-step form
   */
  async fillMultiStepForm(resumePdfBlob) {
    const steps = this.formAnalysis.steps;
    console.log(`[FormFiller] Filling multi-step form with ${steps.length} steps`);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`[FormFiller] Filling step ${i + 1}/${steps.length}: ${step.name}`);

      // Wait for step to be visible
      await this.waitForStep(step);

      // Fill fields in this step
      await this.fillFieldsInStep(step, resumePdfBlob);

      // Click next button if not last step
      if (!step.isLastStep && step.nextButton) {
        await this.clickNextButton(step.nextButton);
        // Wait for next step to load
        await this.sleep(1000);
      }
    }

    return { success: true, message: 'Form filled successfully' };
  }

  /**
   * Fill single page form
   */
  async fillSinglePageForm(resumePdfBlob) {
    console.log('[FormFiller] Filling single-page form');
    const fields = this.formAnalysis.fields;

    for (const field of fields) {
      try {
        await this.fillField(field, resumePdfBlob);
        this.filledFields.add(field.selector);
      } catch (error) {
        console.warn(`[FormFiller] Failed to fill field ${field.selector}:`, error);
      }
    }

    return { success: true, message: 'Form filled successfully' };
  }

  /**
   * Fill fields in a specific step
   */
  async fillFieldsInStep(step, resumePdfBlob) {
    const fieldSelectors = step.fields || [];
    
    for (const selector of fieldSelectors) {
      const field = this.formAnalysis.fields.find(f => f.selector === selector);
      if (field) {
        try {
          await this.fillField(field, resumePdfBlob);
          this.filledFields.add(selector);
        } catch (error) {
          console.warn(`[FormFiller] Failed to fill field ${selector}:`, error);
        }
      }
    }
  }

  /**
   * Fill a single field
   * Enhanced to handle contenteditable, role="textbox", and proper event triggering
   */
  async fillField(field, resumePdfBlob) {
    const element = this.findElementBySelector(field.selector);
    if (!element) {
      console.warn(`[FormFiller] Field not found: ${field.selector}`);
      return;
    }

    if (this.filledFields.has(field.selector)) {
      console.log(`[FormFiller] Field already filled: ${field.selector}`);
      return;
    }

    // Visual feedback in debug mode
    if (this.debugMode) {
      this.highlightField(element);
    }

    // Handle file uploads
    if (field.type === 'file') {
      await this.fillFileField(element, field, resumePdfBlob);
      this.filledFields.add(field.selector);
      return;
    }

    // Get value based on mapping
    const value = this.getValueForField(field);
    if (!value) {
      console.warn(`[FormFiller] No value for field: ${field.mappedTo}`);
      return;
    }

    // Fill based on field type
    try {
      switch (field.type) {
        case 'contenteditable':
          await this.fillContentEditable(element, value);
          break;
        case 'textbox':
          await this.fillRoleTextbox(element, value);
          break;
        case 'text':
        case 'email':
        case 'tel':
          await this.fillTextInput(element, value);
          break;
        case 'textarea':
          await this.fillTextarea(element, value);
          break;
        case 'select':
        case 'select-one':
          await this.fillSelect(element, value, field.options);
          break;
        case 'combobox':
          await this.fillCombobox(element, value);
          break;
        case 'checkbox':
          await this.fillCheckbox(element, value);
          break;
        case 'radio':
          await this.fillRadio(element, value, field.options);
          break;
        case 'date':
          await this.fillDateInput(element, value);
          break;
        default:
          // Try contenteditable first, then text input
          if (element.contentEditable === 'true') {
            await this.fillContentEditable(element, value);
          } else {
            await this.fillTextInput(element, value);
          }
      }
      
      this.filledFields.add(field.selector);
      console.log(`[FormFiller] ✓ Filled field: ${field.mappedTo} (${field.selector})`);
    } catch (error) {
      console.error(`[FormFiller] Error filling field ${field.selector}:`, error);
      // Don't throw - continue with other fields
    }
  }
  
  /**
   * Fill contenteditable element
   */
  async fillContentEditable(element, value) {
    // Focus first
    element.focus();
    await this.sleep(50);
    
    // Clear existing content
    element.textContent = '';
    element.innerText = '';
    
    // Set new content
    element.textContent = value;
    element.innerText = value;
    
    // Trigger events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    
    await this.sleep(100);
  }
  
  /**
   * Fill role="textbox" element
   */
  async fillRoleTextbox(element, value) {
    // Focus first
    element.focus();
    await this.sleep(50);
    
    // Try different methods depending on element type
    if (element.contentEditable === 'true') {
      element.textContent = value;
      element.innerText = value;
    } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = value;
    } else {
      // For div[role="textbox"], try setting textContent
      element.textContent = value;
    }
    
    // Trigger events
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
    
    await this.sleep(100);
  }
  
  /**
   * Highlight field visually (debug mode)
   */
  highlightField(element) {
    const originalOutline = element.style.outline;
    const originalOutlineOffset = element.style.outlineOffset;
    
    element.style.outline = '3px solid #28a745';
    element.style.outlineOffset = '2px';
    
    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.outlineOffset = originalOutlineOffset;
    }, 2000);
  }

  /**
   * Get value for a field based on mapping
   * Uses static personal info from JSON profile and dynamic work/education/skills from parsed resume
   */
  getValueForField(field) {
    const mapping = field.mappedTo;
    const profile = this.userProfile;

    switch (mapping) {
      // Personal info - from JSON profile (static)
      case 'firstName':
        return profile.personalInfo?.firstName || profile.personalInfo?.fullName?.split(' ')[0];
      case 'lastName':
        return profile.personalInfo?.lastName || profile.personalInfo?.fullName?.split(' ').slice(1).join(' ');
      case 'email':
        return profile.personalInfo?.email;
      case 'phone':
        return profile.personalInfo?.phone;
      case 'phoneType':
        return 'Mobile';
      case 'login':
        return profile.personalInfo?.email || 'N/A';
      case 'password':
      case 'passwordConfirm':
        return 'N/A';
      case 'address':
        return profile.personalInfo?.address?.street;
      case 'city':
        return profile.personalInfo?.address?.city;
      case 'state':
        return profile.personalInfo?.address?.state;
      case 'zip':
        return profile.personalInfo?.address?.zip;
      case 'country':
        return profile.personalInfo?.address?.country || 'United States';
      case 'addressType':
        return 'Home';
      
      // Dynamic content - from parsed resume (tailored per application)
      case 'workHistory':
      case 'workExperience':
      case 'experience':
        // Return formatted work history for textarea or multi-field sections
        if (profile.workHistory && profile.workHistory.length > 0) {
          return profile.workHistory.map(job => {
            const dates = job.endDate === 'present' || !job.endDate 
              ? `${job.startDate || ''} - Present`
              : `${job.startDate || ''} - ${job.endDate || ''}`;
            return `${job.title || 'Position'} at ${job.company || 'Company'} (${dates})\n${job.description || ''}`;
          }).join('\n\n');
        }
        return null;
      
      case 'education':
        // Return formatted education for textarea or multi-field sections
        if (profile.education && profile.education.length > 0) {
          return profile.education.map(edu => {
            const gpa = edu.gpa ? ` (GPA: ${edu.gpa})` : '';
            const dates = edu.endDate ? `${edu.startDate || ''} - ${edu.endDate || ''}` : edu.startDate || '';
            return `${edu.degree || 'Degree'} in ${edu.major || ''}${gpa} from ${edu.school || 'School'} (${dates})`;
          }).join('\n\n');
        }
        return null;
      case 'educationSchool':
        return profile.education?.[0]?.school || null;
      case 'educationDegree':
        return profile.education?.[0]?.degree || null;
      case 'educationMajor':
        return profile.education?.[0]?.major || null;
      case 'educationGpa':
        return profile.education?.[0]?.gpa || null;
      case 'educationStartDate':
        return profile.education?.[0]?.startDate || null;
      case 'educationEndDate':
        return profile.education?.[0]?.endDate || null;
      case 'educationGradDate':
        return profile.education?.[0]?.endDate || null;
      
      case 'skills':
        // Return skills as comma-separated string
        if (profile.skills && profile.skills.length > 0) {
          return profile.skills.join(', ');
        }
        return null;
      
      case 'projects':
        // Return formatted projects for textarea or multi-field sections
        if (profile.projects && profile.projects.length > 0) {
          return profile.projects.map(project => {
            const tech = project.technologies ? ` (${project.technologies.join(', ')})` : '';
            return `${project.name || 'Project'}${tech}\n${project.description || ''}`;
          }).join('\n\n');
        }
        return null;
      
      case 'coverLetter':
      case 'summary':
        return profile.summary || 'Please see attached resume for details.';
      
      default:
        // Fallback to a neutral value to satisfy required fields
        return 'N/A';
    }
  }

  /**
   * Fill text input with proper event triggering
   */
  async fillTextInput(element, value) {
    // Focus first (important for React/Vue)
    element.focus();
    await this.sleep(50);
    
    // Set value
    element.value = value;
    
    // Trigger input event (React/Vue listen to this)
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    
    // Trigger change event (traditional forms)
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    
    // Trigger React-specific events
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // Trigger Vue-specific events
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    
    await this.sleep(this.delays.input);
  }

  /**
   * Fill textarea with proper event triggering
   */
  async fillTextarea(element, value) {
    // Focus first
    element.focus();
    await this.sleep(50);
    
    // Set value
    element.value = value;
    
    // Trigger events
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    
    await this.sleep(this.delays.input);
  }

  /**
   * Fill select dropdown
   */
  async fillSelect(element, value, options) {
    // Try exact match first
    for (const option of Array.from(element.options)) {
      if (option.value === value || option.text === value) {
        element.value = option.value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        await this.sleep(this.delays.select);
        return;
      }
    }

    // Try partial match
    for (const option of Array.from(element.options)) {
      if (option.text.toLowerCase().includes(value.toLowerCase()) ||
          value.toLowerCase().includes(option.text.toLowerCase())) {
        element.value = option.value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        await this.sleep(this.delays.select);
        return;
      }
    }
  }

  /**
   * Fill custom dropdown / combobox
   * Strategy:
   * 1) Click to open
   * 2) Type value if it's an input-like element
   * 3) Select matching option from listbox/option elements
   */
  async fillCombobox(element, value) {
    // Open dropdown
    try { element.click(); } catch (e) {}
    element.dispatchEvent(new Event('focus', { bubbles: true, cancelable: true }));
    await this.sleep(this.delays.comboboxType);

    // If it's an input-like combobox, type the value
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.contentEditable === 'true') {
      element.value = value;
      element.textContent = value;
      element.innerText = value;
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      await this.sleep(this.delays.comboboxType);
    }

    // Look for listbox/options in the same document
    const doc = element.ownerDocument || document;
    const candidates = Array.from(
      doc.querySelectorAll('[role="option"], li, option, .select-option, .dropdown-item, [data-value], [aria-selected]')
    ).filter(opt => opt.offsetParent !== null);

    // Pick best match by text content
    const match = candidates.find(opt => (opt.innerText || opt.textContent || '').trim().toLowerCase() === value.toLowerCase()) ||
                  candidates.find(opt => (opt.innerText || opt.textContent || '').trim().toLowerCase().includes(value.toLowerCase()));

    if (match) {
      try { match.click(); } catch (e) {}
      match.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
      await this.sleep(100);
      return;
    }

    // If no option found, try pressing Enter to select the current value, then blur
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    await this.sleep(this.delays.comboboxSelect);
  }

  /**
   * Fill checkbox
   */
  async fillCheckbox(element, value) {
    if (value === true || value === 'true' || value === 'yes' || value === '1') {
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      await this.sleep(this.delays.checkbox);
    }
  }

  /**
   * Fill radio button
   */
  async fillRadio(element, value, options) {
    const name = element.name;
    const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
    
    for (const radio of radios) {
      if (radio.value === value || radio.nextSibling?.textContent?.includes(value)) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        await this.sleep(this.delays.radio);
        return;
      }
    }
  }

  /**
   * Fill date input
   */
  async fillDateInput(element, value) {
    // Convert date to YYYY-MM-DD format
    let dateStr = value;
    if (value.includes('/')) {
      const parts = value.split('/');
      if (parts.length === 3) {
        dateStr = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    }
    element.value = dateStr;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await this.sleep(this.delays.date);
  }

  /**
   * Fill file upload field
   */
  async fillFileField(element, field, resumePdfBlob) {
    if (!resumePdfBlob) {
      console.warn('[FormFiller] No resume PDF blob provided for file upload');
      return;
    }

    // Create File object from blob
    const file = new File([resumePdfBlob], 'resume.pdf', { type: 'application/pdf' });

    // Create DataTransfer object to simulate file drop
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Set files property
    element.files = dataTransfer.files;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));

    console.log('[FormFiller] File uploaded:', file.name);
    await this.sleep(500);
  }

  /**
   * Wait for step to be visible
   */
  async waitForStep(step, maxWait = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      const firstField = step.fields?.[0];
      if (firstField) {
        const element = document.querySelector(firstField);
        if (element && element.offsetParent !== null) {
          return;
        }
      }
      await this.sleep(100);
    }
  }

  /**
   * Click next button
   */
  async clickNextButton(selector) {
    const button = document.querySelector(selector);
    if (button) {
      button.click();
      await this.sleep(500);
    } else {
      // Try to find button by text
      const buttons = Array.from(document.querySelectorAll('button, a, input[type="submit"]'));
      const nextButton = buttons.find(btn => {
        const text = btn.textContent?.toLowerCase() || btn.value?.toLowerCase() || '';
        return text.includes('next') || text.includes('continue') || text.includes('submit');
      });
      if (nextButton) {
        nextButton.click();
        await this.sleep(500);
      }
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmartFormFiller;
}

// Make SmartFormFiller available globally
if (typeof window !== 'undefined') {
  window.SmartFormFiller = SmartFormFiller;
}
