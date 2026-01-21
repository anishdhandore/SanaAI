// Panel script - manages the floating panel UI and state
// This file is injected into the page DOM

console.log('Panel.js script file loaded');

(function() {
  'use strict';
  
  console.log('Panel.js IIFE executing');
  
  const PANEL_ID = 'sanaai-panel';
  const PANEL_STORAGE_KEY = 'sanaaiPanelState';
  
  // Panel state
  let panelState = {
    isOpen: false,
    isMinimized: false,
    position: { x: null, y: null }, // null = use default (right side)
    resumeData: null,
    jobDescription: null,
    rewrittenResume: null,
    resumeFormat: 'text',
    isLaTeX: false
  };
  
  // Drag state
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panelElement = null;
  
  /**
   * Create and inject the floating panel HTML
   */
  function createPanel() {
    console.log('createPanel called');
    // Check if panel already exists
    const existingPanel = document.getElementById(PANEL_ID);
    if (existingPanel) {
      // Check if panel has the User Profile section (to detect old versions)
      const hasUserProfile = document.getElementById('sanaai-viewProfile');
      if (!hasUserProfile) {
        console.log('Panel exists but missing User Profile section - recreating...');
        // Remove old panel
        existingPanel.remove();
        panelElement = null;
        // Continue to create new panel below
      } else {
        console.log('Panel already exists and is up-to-date');
        panelElement = existingPanel;
        return existingPanel;
      }
    }
    
    console.log('Creating new panel element');
    // Create panel container
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="sanaai-header" id="sanaai-panel-header">
        <div class="sanaai-brand">
          <div class="sanaai-logo">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- Nerd Monkey Face -->
              <circle cx="20" cy="20" r="18" fill="#8B5A2B"/>
              <circle cx="20" cy="22" r="14" fill="#D2691E"/>
              <!-- Ears -->
              <circle cx="4" cy="16" r="5" fill="#8B5A2B"/>
              <circle cx="4" cy="16" r="3" fill="#FFCBA4"/>
              <circle cx="36" cy="16" r="5" fill="#8B5A2B"/>
              <circle cx="36" cy="16" r="3" fill="#FFCBA4"/>
              <!-- Face/Muzzle -->
              <ellipse cx="20" cy="26" rx="8" ry="6" fill="#FFCBA4"/>
              <!-- Glasses -->
              <rect x="8" y="14" width="10" height="8" rx="2" fill="none" stroke="#1a1a2e" stroke-width="2"/>
              <rect x="22" y="14" width="10" height="8" rx="2" fill="none" stroke="#1a1a2e" stroke-width="2"/>
              <line x1="18" y1="18" x2="22" y2="18" stroke="#1a1a2e" stroke-width="2"/>
              <!-- Eyes behind glasses -->
              <circle cx="13" cy="18" r="2" fill="#1a1a2e"/>
              <circle cx="27" cy="18" r="2" fill="#1a1a2e"/>
              <circle cx="13.5" cy="17.5" r="0.8" fill="white"/>
              <circle cx="27.5" cy="17.5" r="0.8" fill="white"/>
              <!-- Nose -->
              <ellipse cx="20" cy="25" rx="2" ry="1.5" fill="#8B4513"/>
              <!-- Smile -->
              <path d="M16 29 Q20 32 24 29" stroke="#8B4513" stroke-width="1.5" fill="none" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="sanaai-title">
            <span class="sanaai-name">SanaAI</span>
            <span class="sanaai-tagline">Job Application Assistant</span>
          </div>
        </div>
        <div class="sanaai-controls">
          <button class="sanaai-ctrl-btn" id="sanaai-minimize" title="Minimize">
            <svg width="12" height="12" viewBox="0 0 12 12"><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
          <button class="sanaai-ctrl-btn sanaai-close-btn" id="sanaai-close" title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      
      <div class="sanaai-body" id="sanaai-panel-body">
        <!-- Resume Card -->
        <div class="sanaai-card">
          <div class="sanaai-card-header">
            <div class="sanaai-card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <span class="sanaai-card-title">Your Resume</span>
            <button id="sanaai-reloadResume" class="sanaai-icon-btn" title="Reload">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </button>
          </div>
          <div id="sanaai-resumeStatus" class="sanaai-status"></div>
        </div>

        <!-- Workflow Steps -->
        <div class="sanaai-workflow">
          <div class="sanaai-step" data-step="1">
            <div class="sanaai-step-header">
              <div class="sanaai-step-num">1</div>
              <div class="sanaai-step-info">
                <span class="sanaai-step-title">Extract Job Description</span>
                <span class="sanaai-step-desc">Capture requirements from this page</span>
              </div>
            </div>
            <button id="sanaai-extractJD" class="sanaai-action-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Extract JD
            </button>
            <div id="sanaai-jdStatus" class="sanaai-status"></div>
          </div>

          <div class="sanaai-step" data-step="2">
            <div class="sanaai-step-header">
              <div class="sanaai-step-num">2</div>
              <div class="sanaai-step-info">
                <span class="sanaai-step-title">Optimize Resume</span>
                <span class="sanaai-step-desc">AI-powered ATS optimization</span>
              </div>
            </div>
            <button id="sanaai-processJob" class="sanaai-action-btn sanaai-btn-accent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              Optimize Resume
            </button>
            <div id="sanaai-processStatus" class="sanaai-status"></div>
          </div>

          <div class="sanaai-step" data-step="3">
            <div class="sanaai-step-header">
              <div class="sanaai-step-num">3</div>
              <div class="sanaai-step-info">
                <span class="sanaai-step-title">Check ATS Score</span>
                <span class="sanaai-step-desc">Calculate compatibility score</span>
              </div>
            </div>
            <button id="sanaai-calculateATS" class="sanaai-action-btn sanaai-btn-purple">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Calculate ATS Score
            </button>
            <div id="sanaai-atsStatus" class="sanaai-status"></div>
            <div id="sanaai-atsScoreDisplay" style="display: none; margin-top: 15px;">
              <div class="sanaai-ats-score-card">
                <div class="sanaai-ats-score-main">
                  <div class="sanaai-ats-score-value" id="sanaai-atsScoreValue">0</div>
                  <div class="sanaai-ats-score-label">ATS Score</div>
                </div>
                <div class="sanaai-ats-breakdown" id="sanaai-atsBreakdown"></div>
                <div class="sanaai-ats-details">
                  <div class="sanaai-ats-section">
                    <h4>Strengths</h4>
                    <ul id="sanaai-atsStrengths"></ul>
                  </div>
                  <div class="sanaai-ats-section">
                    <h4>Missing Keywords</h4>
                    <ul id="sanaai-atsMissingKeywords"></ul>
                  </div>
                  <div class="sanaai-ats-section">
                    <h4>Recommendations</h4>
                    <ul id="sanaai-atsRecommendations"></ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="sanaai-step" data-step="4">
            <div class="sanaai-step-header">
              <div class="sanaai-step-num">4</div>
              <div class="sanaai-step-info">
                <span class="sanaai-step-title">Autofill Application</span>
                <span class="sanaai-step-desc">Fill form fields automatically</span>
              </div>
            </div>
            <button id="sanaai-fillForm" class="sanaai-action-btn sanaai-btn-success">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Fill Form
            </button>
            <div id="sanaai-fillStatus" class="sanaai-status"></div>
          </div>
        </div>

        <!-- LaTeX Tools (hidden by default) -->
        <div class="sanaai-card sanaai-latex-tools" id="sanaai-latexSection" style="display: none;">
          <div class="sanaai-card-header">
            <div class="sanaai-card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
            </div>
            <span class="sanaai-card-title">LaTeX Tools</span>
          </div>
          <div class="sanaai-btn-group">
            <button id="sanaai-viewLaTeX" class="sanaai-sm-btn">View Code</button>
            <button id="sanaai-convertToPDF" class="sanaai-sm-btn">To PDF</button>
            <button id="sanaai-downloadLaTeX" class="sanaai-sm-btn sanaai-btn-dl">Download</button>
          </div>
          <div id="sanaai-pdfStatus" class="sanaai-status"></div>
        </div>

        <!-- Settings -->
        <div class="sanaai-footer">
          <button id="sanaai-viewProfile" class="sanaai-link-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Profile
          </button>
          <button id="sanaai-parseProfile" class="sanaai-link-btn" style="display:none;">Update Profile</button>
          <div class="sanaai-settings-row">
            <label>API:</label>
            <input type="text" id="sanaai-backendUrl" value="http://localhost:8000" spellcheck="false">
          </div>
          <div id="sanaai-profileStatus" class="sanaai-status"></div>
        </div>
      </div>
      
      <!-- LaTeX Preview Modal -->
      <div id="sanaai-latexModal" class="sanaai-modal">
        <div class="sanaai-modal-box">
          <div class="sanaai-modal-top">
            <h3>Optimized LaTeX</h3>
            <button id="sanaai-closeModal" class="sanaai-modal-close">×</button>
          </div>
          <textarea id="sanaai-latexPreview" readonly class="sanaai-code-preview"></textarea>
          <div class="sanaai-modal-btns">
            <button id="sanaai-copyLaTeX" class="sanaai-modal-btn">Copy</button>
            <button id="sanaai-downloadFromModal" class="sanaai-modal-btn sanaai-btn-dl">Download</button>
          </div>
        </div>
      </div>
      
      <!-- User Profile Modal -->
      <div id="sanaai-profileModal" class="sanaai-modal">
        <div class="sanaai-modal-box sanaai-profile-modal">
          <div class="sanaai-modal-top">
            <h3>Profile Data</h3>
            <button id="sanaai-closeProfileModal" class="sanaai-modal-close">×</button>
          </div>
          <div id="sanaai-profileContent" class="sanaai-profile-content"></div>
          <div class="sanaai-modal-btns">
            <button id="sanaai-saveProfile" class="sanaai-modal-btn">Save</button>
            <button id="sanaai-cancelProfile" class="sanaai-modal-btn sanaai-btn-cancel">Cancel</button>
          </div>
        </div>
      </div>
    `;
    
    // Inject CSS if not already injected
    if (!document.getElementById('sanaai-panel-styles')) {
      const style = document.createElement('style');
      style.id = 'sanaai-panel-styles';
      style.textContent = getPanelCSS();
      document.head.appendChild(style);
    }
    
    // Append to body
    document.body.appendChild(panel);
    panelElement = document.getElementById(PANEL_ID);
    console.log('Panel element created and appended, panelElement:', panelElement);
    
    // Initialize panel functionality
    initializePanel();
    
    return panelElement;
  }
  
  /**
   * Initialize panel event listeners and functionality
   */
  function initializePanel() {
    const panel = document.getElementById(PANEL_ID);
    const header = document.getElementById('sanaai-panel-header');
    const minimizeBtn = document.getElementById('sanaai-minimize');
    const closeBtn = document.getElementById('sanaai-close');
    const body = document.getElementById('sanaai-panel-body');
    
    // Minimize button
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMinimize();
    });
    
    // Close button
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePanel();
    });
    
    // Drag functionality
    header.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    
    // Initialize panel logic (load resume, set up buttons, etc.)
    initializePanelLogic();
    
    // Restore position
    restorePanelPosition();
  }
  
  /**
   * Message bridge to content script for chrome.storage access
   */
  function sendToContentScript(message, callback) {
    if (!message || typeof message !== 'object') {
      console.error('[PANEL.JS] sendToContentScript: invalid message');
      if (callback) callback({ error: 'Invalid message' });
      return;
    }

    // Always attach a requestId if missing
    const requestId = message.requestId || Date.now() + Math.random();
    const payload = { ...message, requestId };

    try {
      window.postMessage({
        type: 'SANAAI_PANEL_MESSAGE',
        payload
      }, '*');
      
      // Listen for response with timeout
    const TIMEOUT_MS = 60000; // allow longer for backend/LLM calls
      let timeoutId = setTimeout(() => {
        window.removeEventListener('message', listener);
        if (callback) {
          console.warn('[PANEL.JS] Storage request timed out');
          callback({ error: 'Request timed out. Extension may need reload.' });
        }
      }, TIMEOUT_MS);
      
      const listener = (event) => {
        if (event.data && event.data.type === 'SANAAI_PANEL_RESPONSE' && 
            event.data.requestId === payload.requestId) {
          clearTimeout(timeoutId);
          window.removeEventListener('message', listener);
          if (callback) {
            if (event.data.result && event.data.result.error) {
              console.warn('[PANEL.JS] Storage error:', event.data.result.error);
            }
            callback(event.data.result);
          }
        }
      };
      window.addEventListener('message', listener);
    } catch (error) {
      console.error('[PANEL.JS] Error sending message to content script:', error);
      if (callback) {
        callback({ error: error.message });
      }
    }
  }
  
  /**
   * Get storage value (via content script)
   */
  function getStorage(keys, callback) {
    sendToContentScript({
      action: 'getStorage',
      keys: Array.isArray(keys) ? keys : [keys]
    }, callback);
  }
  
  /**
   * Set storage value (via content script)
   */
  function setStorage(data, callback) {
    const storageType = data.storageType || 'local';
    delete data.storageType;
    
    sendToContentScript({
      action: 'setStorage',
      data: data,
      storageType: storageType
    }, callback);
  }

  /**
   * Proxy fetch via content script (bypasses page CSP)
   */
  function proxyFetch(url, fetchOptions = {}) {
    return new Promise((resolve, reject) => {
      sendToContentScript({
        action: 'proxyFetch',
        data: {
          url,
          fetchOptions
        }
      }, (res) => {
        if (!res) {
          reject(new Error('No response from proxyFetch'));
          return;
        }
        if (res.error) {
          reject(new Error(res.error));
          return;
        }
        resolve(res);
      });
    });
  }
  
  /**
   * Initialize panel business logic (buttons, API calls, etc.)
   */
  function initializePanelLogic() {
    // Load saved state with error handling
    getStorage([PANEL_STORAGE_KEY, 'backendUrl', 'savedResume', 'savedResumeFormat'], async (result) => {
      // Handle storage errors gracefully
      if (result && result.error) {
        console.warn('[PANEL.JS] Storage error (non-critical):', result.error);
        // Continue with defaults if storage fails
        result = {};
      }
      
      // Only restore position, NOT workflow state (fresh start each time)
      if (result && result[PANEL_STORAGE_KEY]) {
        const savedState = result[PANEL_STORAGE_KEY];
        // Only restore position and format settings, NOT jobDescription/rewrittenResume
        panelState.position = savedState.position || panelState.position;
        panelState.resumeFormat = savedState.resumeFormat || panelState.resumeFormat;
        panelState.isLaTeX = savedState.isLaTeX || panelState.isLaTeX;
        // Explicitly keep jobDescription and rewrittenResume as null for fresh start
        panelState.jobDescription = null;
        panelState.rewrittenResume = null;
      }
      
      const backendUrl = (result && result.backendUrl) || 'http://localhost:8000';
      const backendUrlInput = document.getElementById('sanaai-backendUrl');
      if (backendUrlInput) {
        backendUrlInput.value = backendUrl;
      }
      
      // Load resume (will handle errors gracefully)
      await loadResume(backendUrl, result && result.savedResume, result && result.savedResumeFormat);
    });
    
    // Backend URL change
    document.getElementById('sanaai-backendUrl').addEventListener('change', (e) => {
      setStorage({ backendUrl: e.target.value, storageType: 'sync' });
    });
    
    // Reload Resume button
    document.getElementById('sanaai-reloadResume').addEventListener('click', async () => {
      const backendUrl = document.getElementById('sanaai-backendUrl').value;
      await loadResume(backendUrl);
    });
    
    // Extract JD button
    document.getElementById('sanaai-extractJD').addEventListener('click', async () => {
      await extractJobDescription();
    });
    
    // Process Job button
    document.getElementById('sanaai-processJob').addEventListener('click', async () => {
      await processJob();
    });
    
    // Calculate ATS Score button
    document.getElementById('sanaai-calculateATS').addEventListener('click', async () => {
      await calculateATSScore();
    });
    
    // LaTeX buttons
    document.getElementById('sanaai-viewLaTeX').addEventListener('click', () => {
      if (!panelState.rewrittenResume || panelState.resumeFormat !== 'latex') {
        alert('No LaTeX resume available. Please process a LaTeX resume first.');
        return;
      }
      document.getElementById('sanaai-latexModal').style.display = 'block';
      document.getElementById('sanaai-latexPreview').value = panelState.rewrittenResume;
    });
    
    document.getElementById('sanaai-closeModal').addEventListener('click', () => {
      document.getElementById('sanaai-latexModal').style.display = 'none';
    });
    
    document.getElementById('sanaai-latexModal').addEventListener('click', (e) => {
      if (e.target.id === 'sanaai-latexModal') {
        document.getElementById('sanaai-latexModal').style.display = 'none';
      }
    });
    
    document.getElementById('sanaai-copyLaTeX').addEventListener('click', async () => {
      const preview = document.getElementById('sanaai-latexPreview');
      try {
        await navigator.clipboard.writeText(preview.value);
        const btn = document.getElementById('sanaai-copyLaTeX');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.background = '#28a745';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = '#007bff';
        }, 2000);
      } catch (error) {
        alert('Failed to copy. Please select and copy manually.');
      }
    });
    
    document.getElementById('sanaai-downloadFromModal').addEventListener('click', () => {
      const preview = document.getElementById('sanaai-latexPreview');
      downloadFile(preview.value, `resume_optimized_${new Date().toISOString().split('T')[0]}.tex`, 'text/plain');
    });
    
    document.getElementById('sanaai-downloadLaTeX').addEventListener('click', () => {
      if (!panelState.rewrittenResume || panelState.resumeFormat !== 'latex') {
        alert('No LaTeX resume available. Please process a LaTeX resume first.');
        return;
      }
      downloadFile(panelState.rewrittenResume, `resume_optimized_${new Date().toISOString().split('T')[0]}.tex`, 'text/plain');
    });
    
    document.getElementById('sanaai-convertToPDF').addEventListener('click', async () => {
      await convertToPDF();
    });
    
    document.getElementById('sanaai-fillForm').addEventListener('click', async () => {
      await fillForm();
    });
    
    // User Profile buttons
    document.getElementById('sanaai-viewProfile').addEventListener('click', () => {
      showProfileModal();
    });
    
    document.getElementById('sanaai-parseProfile').addEventListener('click', async () => {
      await parseAndUpdateProfile();
    });
    
    document.getElementById('sanaai-closeProfileModal').addEventListener('click', () => {
      document.getElementById('sanaai-profileModal').style.display = 'none';
    });
    
    document.getElementById('sanaai-profileModal').addEventListener('click', (e) => {
      if (e.target.id === 'sanaai-profileModal') {
        document.getElementById('sanaai-profileModal').style.display = 'none';
      }
    });
    
    document.getElementById('sanaai-saveProfile').addEventListener('click', async () => {
      await saveProfileFromModal();
    });
    
    document.getElementById('sanaai-cancelProfile').addEventListener('click', () => {
      document.getElementById('sanaai-profileModal').style.display = 'none';
    });
  }
  
  /**
   * Load resume from backend
   */
  async function loadResume(backendUrl, savedResume = null, savedFormat = null) {
    const statusEl = document.getElementById('sanaai-resumeStatus');
    statusEl.className = 'sanaai-status sanaai-status-info';
    statusEl.textContent = 'Loading original resume...';
    
    try {
      // Try to fetch from backend
      // Note: Some pages have CSP that blocks localhost connections
      const response = await fetch(`${backendUrl}/get-original-resume`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit'
      }).catch(error => {
        // Check if it's a CSP violation
        if (error.message && (error.message.includes('CSP') || error.message.includes('Content Security Policy'))) {
          throw new Error('Content Security Policy blocks connection to backend. Please use a page without strict CSP restrictions, or configure the backend to use HTTPS.');
        }
        throw error;
      });
      
      if (response.ok) {
        const data = await response.json();
        panelState.resumeData = data.resume;
        panelState.resumeFormat = data.format;
        panelState.isLaTeX = data.format === 'latex';
        
        setStorage({
          savedResume: panelState.resumeData,
          savedResumeFormat: panelState.resumeFormat
        });
        savePanelState();
        
        statusEl.className = 'sanaai-status sanaai-status-success';
        statusEl.textContent = `Original resume loaded: ${data.filename} (${panelState.resumeFormat.toUpperCase()})`;
        
        const latexSection = document.getElementById('sanaai-latexSection');
        if (panelState.isLaTeX) {
          latexSection.style.display = 'block';
        } else {
          latexSection.style.display = 'none';
        }
      } else {
        throw new Error('Failed to load resume from backend');
      }
    } catch (error) {
      // Fallback 1: try via content script fetch (bypasses page CSP)
      try {
        const fetchResult = await new Promise((resolve) => {
          sendToContentScript({ action: 'fetchOriginalResume', data: { backendUrl } }, (res) => resolve(res));
        });

        if (fetchResult && fetchResult.data) {
          const data = fetchResult.data;
          panelState.resumeData = data.resume;
          panelState.resumeFormat = data.format;
          panelState.isLaTeX = data.format === 'latex';
          
          setStorage({
            savedResume: panelState.resumeData,
            savedResumeFormat: panelState.resumeFormat
          });
          savePanelState();
          
          statusEl.className = 'sanaai-status sanaai-status-success';
          statusEl.textContent = `Original resume loaded: ${data.filename} (${panelState.resumeFormat.toUpperCase()})`;
          
          const latexSection = document.getElementById('sanaai-latexSection');
          if (panelState.isLaTeX) {
            latexSection.style.display = 'block';
          } else {
            latexSection.style.display = 'none';
          }
          return;
        }
      } catch (e) {
        // ignore and try saved resume
      }

      if (savedResume) {
        panelState.resumeData = savedResume;
        panelState.resumeFormat = savedFormat || 'text';
        panelState.isLaTeX = panelState.resumeFormat === 'latex';
        
        statusEl.className = 'sanaai-status sanaai-status-info';
        statusEl.textContent = `Using saved resume (${panelState.resumeFormat.toUpperCase()})`;
        
        const latexSection = document.getElementById('sanaai-latexSection');
        if (panelState.isLaTeX) {
          latexSection.style.display = 'block';
        }
      } else {
        statusEl.className = 'sanaai-status sanaai-status-error';
        statusEl.textContent = `Error: ${error.message}`;
      }
    }
  }
  
  /**
   * Extract job description from current page
   */
  async function extractJobDescription() {
    const statusEl = document.getElementById('sanaai-jdStatus');
    statusEl.className = 'sanaai-status sanaai-status-info';
    statusEl.textContent = 'Extracting job description...';
    
    try {
      // Use the extractJobDescription function from content.js
      const jdText = await extractJobDescriptionFromPage();
      panelState.jobDescription = jdText;
      savePanelState();
      
      statusEl.className = 'sanaai-status sanaai-status-success';
      statusEl.textContent = `Extracted ${jdText.length} characters`;
    } catch (error) {
      statusEl.className = 'sanaai-status sanaai-status-error';
      statusEl.textContent = `Error: ${error.message}`;
    }
  }
  
  /**
   * Extract JD from page (reuse content script logic)
   */
  async function extractJobDescriptionFromPage() {
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
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(el => {
          const text = el.innerText || el.textContent || '';
          if (text.length > jdText.length) {
            jdText = text;
          }
        });
      }
    }

    if (!jdText || jdText.length < 100) {
      const allTextElements = document.querySelectorAll('p, div, section, article');
      let maxLength = 0;
      allTextElements.forEach(el => {
        const text = el.innerText || el.textContent || '';
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
      throw new Error('Could not find job description on this page.');
    }

    // Filter boilerplate
    const boilerplatePatterns = [
      /Equal Employment Opportunity[^.]*/gi,
      /EEO[^.]*/gi,
      /THE LAW[^.]*/gi,
      /We are an equal opportunity employer[^.]*/gi,
      /All qualified applicants[^.]*/gi,
      /without regard to[^.]*/gi,
      /protected by law[^.]*/gi,
      /Affirmative Action[^.]*/gi,
      /reasonable accommodations?[^.]*/gi,
      /Contact.*EEO[^.]*/gi,
    ];
    
    let cleanedText = jdText.trim();
    boilerplatePatterns.forEach(pattern => {
      cleanedText = cleanedText.replace(pattern, '');
    });
    
    cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{3,}/g, ' ');
    
    if (cleanedText.length < 100) {
      cleanedText = jdText.trim();
    }

    return cleanedText;
  }
  
  /**
   * Process job and rewrite resume
   * Uses /fast-rewrite for speed (~5-10 seconds vs 1-2 minutes)
   */
  async function processJob() {
    if (!panelState.resumeData) {
      alert('Resume not loaded. Please click "Reload Resume" first.');
      return;
    }
    if (!panelState.jobDescription) {
      alert('Please extract job description first');
      return;
    }

    const statusEl = document.getElementById('sanaai-processStatus');
    statusEl.className = 'sanaai-status sanaai-status-info';
    statusEl.textContent = 'Optimizing resume...';

    const startTime = Date.now();
    
    try {
      const backendUrl = document.getElementById('sanaai-backendUrl').value;
      
      // Use FAST endpoint first (returns raw LaTeX, no JSON parsing)
      // Note: LLM calls can take 30-90s depending on model
      statusEl.textContent = 'Optimizing resume... (this may take 30-60s)';
      const fastResponse = await proxyFetch(`${backendUrl}/fast-rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_description: panelState.jobDescription,
          resume: panelState.resumeData,
          resume_format: panelState.resumeFormat
        }),
        credentials: 'omit',
        mode: 'cors'
      }, 120000); // 120s timeout - LLM calls can be slow
      
      if (fastResponse.ok && fastResponse.payload?.rewritten_resume) {
        // Fast endpoint succeeded!
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        panelState.rewrittenResume = fastResponse.payload.rewritten_resume;
        panelState.resumeFormat = fastResponse.payload.resume_format || panelState.resumeFormat;
        savePanelState();
        
        const latexSection = document.getElementById('sanaai-latexSection');
        if (panelState.resumeFormat === 'latex') {
          latexSection.style.display = 'block';
        }
        
        statusEl.className = 'sanaai-status sanaai-status-success';
        statusEl.textContent = `✓ Resume optimized in ${elapsed}s!`;
        return;
      }
      
      // Fallback to combined endpoint if fast fails
      console.warn('[PANEL.JS] Fast endpoint failed, falling back to combined:', fastResponse.status, fastResponse.payload?.detail);
      statusEl.textContent = 'Trying full processing (slower)...';
      
      const bodyData = {
        job_description: panelState.jobDescription,
        resume: panelState.resumeData,
        resume_format: panelState.resumeFormat,
        skip_validation: true  // Skip validation for speed
      };

      const combinedResponse = await proxyFetch(`${backendUrl}/process-and-rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
        credentials: 'omit',
        mode: 'cors'
      }, 60000); // 60s timeout for combined
      
      if (!combinedResponse.ok) {
        throw new Error(combinedResponse.payload?.detail || `Failed: ${combinedResponse.status}`);
      }
      
      const result = combinedResponse.payload;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      panelState.rewrittenResume = result.rewritten_resume;
      panelState.resumeFormat = result.resume_format || panelState.resumeFormat;
      savePanelState();
      
      const latexSection = document.getElementById('sanaai-latexSection');
      if (panelState.resumeFormat === 'latex') {
        latexSection.style.display = 'block';
      }
      
      statusEl.className = 'sanaai-status sanaai-status-success';
      statusEl.textContent = `✓ Resume rewritten in ${elapsed}s!`;
      
    } catch (error) {
      statusEl.className = 'sanaai-status sanaai-status-error';
      statusEl.textContent = `Error: ${error.message}`;
    }
  }
  
  /**
   * Calculate ATS Score
   */
  async function calculateATSScore() {
    if (!panelState.jobDescription) {
      alert('Please extract job description first');
      return;
    }
    
    // PRIORITY: Use optimized resume from step 2 if available, otherwise fall back to original
    const resumeToUse = panelState.rewrittenResume || panelState.resumeData;
    const isUsingOptimized = !!panelState.rewrittenResume;
    
    if (!resumeToUse) {
      alert('Resume not loaded. Please click "Reload Resume" first.');
      return;
    }
    
    if (!isUsingOptimized) {
      const confirmUse = confirm('No optimized resume found. Would you like to calculate ATS score for the original resume?\n\n(For best results, optimize your resume in Step 2 first)');
      if (!confirmUse) {
        return;
      }
    }

    const statusEl = document.getElementById('sanaai-atsStatus');
    const scoreDisplay = document.getElementById('sanaai-atsScoreDisplay');
    statusEl.className = 'sanaai-status sanaai-status-info';
    statusEl.textContent = isUsingOptimized 
      ? 'Calculating ATS score for optimized resume...' 
      : 'Calculating ATS score for original resume...';
    scoreDisplay.style.display = 'none';

    try {
      const backendUrl = document.getElementById('sanaai-backendUrl').value;
      
      statusEl.textContent = 'Calculating ATS score... (this may take 20-40s)';
      
      const response = await proxyFetch(`${backendUrl}/calculate-ats-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_description: panelState.jobDescription,
          resume: resumeToUse,
          resume_format: panelState.resumeFormat || 'latex'
        }),
        credentials: 'omit',
        mode: 'cors'
      }, 60000); // 60s timeout
      
      if (!response.ok) {
        throw new Error(response.payload?.detail || `Failed: ${response.status}`);
      }
      
      const scoreData = response.payload;
      
      // Display ATS score
      const scoreValue = Math.round(scoreData.ats_score);
      document.getElementById('sanaai-atsScoreValue').textContent = scoreValue;
      
      // Color code the score
      const scoreEl = document.getElementById('sanaai-atsScoreValue');
      if (scoreValue >= 95) {
        scoreEl.style.color = '#10b981'; // Green
      } else if (scoreValue >= 80) {
        scoreEl.style.color = '#f59e0b'; // Orange
      } else {
        scoreEl.style.color = '#ef4444'; // Red
      }
      
      // Display breakdown
      const breakdown = scoreData.breakdown;
      const breakdownEl = document.getElementById('sanaai-atsBreakdown');
      breakdownEl.innerHTML = `
        <div class="sanaai-breakdown-item">
          <span class="sanaai-breakdown-label">Keyword Matching</span>
          <span class="sanaai-breakdown-value">${Math.round(breakdown.keyword_matching)}%</span>
        </div>
        <div class="sanaai-breakdown-item">
          <span class="sanaai-breakdown-label">Keyword Placement</span>
          <span class="sanaai-breakdown-value">${Math.round(breakdown.keyword_placement)}%</span>
        </div>
        <div class="sanaai-breakdown-item">
          <span class="sanaai-breakdown-label">Keyword Density</span>
          <span class="sanaai-breakdown-value">${Math.round(breakdown.keyword_density)}%</span>
        </div>
        <div class="sanaai-breakdown-item">
          <span class="sanaai-breakdown-label">Relevance & Alignment</span>
          <span class="sanaai-breakdown-value">${Math.round(breakdown.relevance_alignment)}%</span>
        </div>
      `;
      
      // Display strengths
      const strengthsEl = document.getElementById('sanaai-atsStrengths');
      if (scoreData.strengths && scoreData.strengths.length > 0) {
        strengthsEl.innerHTML = scoreData.strengths.map(s => `<li>${s}</li>`).join('');
      } else {
        strengthsEl.innerHTML = '<li>No specific strengths identified</li>';
      }
      
      // Display missing keywords
      const missingEl = document.getElementById('sanaai-atsMissingKeywords');
      if (scoreData.missing_keywords && scoreData.missing_keywords.length > 0) {
        missingEl.innerHTML = scoreData.missing_keywords.map(k => `<li><code>${k}</code></li>`).join('');
      } else {
        missingEl.innerHTML = '<li>No missing keywords identified</li>';
      }
      
      // Display recommendations
      const recsEl = document.getElementById('sanaai-atsRecommendations');
      if (scoreData.recommendations && scoreData.recommendations.length > 0) {
        recsEl.innerHTML = scoreData.recommendations.map(r => `<li>${r}</li>`).join('');
      } else {
        recsEl.innerHTML = '<li>No recommendations</li>';
      }
      
      // Show the score display
      scoreDisplay.style.display = 'block';
      statusEl.className = 'sanaai-status sanaai-status-success';
      statusEl.textContent = `✓ ATS Score calculated: ${scoreValue}%`;
      
    } catch (error) {
      statusEl.className = 'sanaai-status sanaai-status-error';
      statusEl.textContent = `Error: ${error.message}`;
      scoreDisplay.style.display = 'none';
    }
  }
  
  /**
   * Convert LaTeX to PDF
   */
  async function convertToPDF() {
    if (!panelState.rewrittenResume || panelState.resumeFormat !== 'latex') {
      alert('No LaTeX resume available.');
      return;
    }

    const statusEl = document.getElementById('sanaai-pdfStatus');
    statusEl.className = 'sanaai-status sanaai-status-info';
    statusEl.textContent = 'Converting LaTeX to PDF...';

    try {
      const backendUrl = document.getElementById('sanaai-backendUrl').value;
      const pdfResponse = await fetch(`${backendUrl}/latex-to-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latex_code: panelState.rewrittenResume })
      });
      
      if (!pdfResponse.ok) {
        const errorData = await pdfResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || `PDF conversion failed`);
      }
      
      const blob = await pdfResponse.blob();
      downloadFile(blob, `resume_optimized_${new Date().toISOString().split('T')[0]}.pdf`, 'application/pdf');
      
      statusEl.className = 'sanaai-status sanaai-status-success';
      statusEl.textContent = 'PDF downloaded successfully!';
    } catch (error) {
      statusEl.className = 'sanaai-status sanaai-status-error';
      statusEl.textContent = `Error: ${error.message}`;
    }
  }
  
  /**
   * Load SmartFormFiller script
   * Content script should have already injected it, but we check and wait if needed
   */
  async function loadFormFiller() {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.SmartFormFiller) {
        resolve(window.SmartFormFiller);
        return;
      }

      // Form-filler should be injected by content script, but wait a bit if it's still loading
      let retries = 0;
      const maxRetries = 50; // 5 seconds max wait
      
      const checkForFormFiller = () => {
        if (window.SmartFormFiller) {
          resolve(window.SmartFormFiller);
        } else {
          retries++;
          if (retries < maxRetries) {
            setTimeout(checkForFormFiller, 100);
          } else {
            // Fallback: request URL from content script
            console.log('[Panel] Form filler not found, requesting URL from content script...');
            const requestId = Date.now() + Math.random();
            window.postMessage({
              type: 'SANAAI_PANEL_MESSAGE',
              payload: {
                action: 'getFormFillerUrl',
                requestId: requestId
              }
            }, '*');

            const listener = (event) => {
              if (event.data && event.data.type === 'SANAAI_PANEL_RESPONSE' && event.data.requestId === requestId) {
                window.removeEventListener('message', listener);
                
                if (event.data.result.error) {
                  reject(new Error(event.data.result.error));
                  return;
                }

                const formFillerUrl = event.data.result.url;
                if (!formFillerUrl) {
                  reject(new Error('Failed to get form-filler.js URL from content script'));
                  return;
                }

                // Now inject the script using the URL
                const script = document.createElement('script');
                script.src = formFillerUrl;
                script.onload = () => {
                  if (window.SmartFormFiller) {
                    resolve(window.SmartFormFiller);
                  } else {
                    reject(new Error('SmartFormFiller not found after script load'));
                  }
                };
                script.onerror = () => reject(new Error('Failed to load form-filler.js'));
                (document.head || document.documentElement).appendChild(script);
              }
            };
            
            window.addEventListener('message', listener);
            
            // Timeout after 5 seconds
            setTimeout(() => {
              window.removeEventListener('message', listener);
              reject(new Error('Timeout waiting for form-filler'));
            }, 5000);
          }
        }
      };
      
      checkForFormFiller();
    });
  }

  /**
   * Get PDF blob for resume (convert LaTeX to PDF if needed)
   */
  async function getResumePdfBlob() {
    const backendUrl = document.getElementById('sanaai-backendUrl').value;
    
    // Use rewritten resume if available, otherwise use original resume
    const resumeToConvert = panelState.rewrittenResume || panelState.resumeData;
    const resumeFormat = panelState.resumeFormat || 'text';
    
    // If we have LaTeX resume, convert to PDF
    if (resumeFormat === 'latex' && resumeToConvert) {
      try {
        const pdfResponse = await fetch(`${backendUrl}/latex-to-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latex_code: resumeToConvert })
        });
        
        if (pdfResponse.ok) {
          return await pdfResponse.blob();
        }
      } catch (error) {
        console.warn('[Panel] Failed to convert LaTeX to PDF:', error);
      }
    }
    
    // TODO: If we have original PDF, return it
    // For now, return null and let form filler handle it
    return null;
  }

  /**
   * Fill application form using SmartFormFiller
   */
  async function fillForm() {
    if (!panelState.resumeData) {
      alert('Please load your resume first by clicking "Reload Resume"');
      return;
    }
    
    // Use rewritten resume if available, otherwise use original resume
    const resumeToUse = panelState.rewrittenResume || panelState.resumeData;
    const resumeFormatToUse = panelState.resumeFormat || 'text';
    
    if (panelState.rewrittenResume) {
      console.log('[Panel] Using rewritten resume for form filling');
    } else {
      console.log('[Panel] Using original resume for form filling (no rewrite performed)');
    }

    const statusEl = document.getElementById('sanaai-fillStatus');
    statusEl.className = 'sanaai-status sanaai-status-info';
    statusEl.textContent = 'Loading form filler...';

    try {
      // Load SmartFormFiller
      const SmartFormFiller = await loadFormFiller();
      statusEl.textContent = 'Analyzing form structure...';

      // Get backend URL
      const backendUrl = document.getElementById('sanaai-backendUrl').value;
      
      // Get resume PDF blob
      statusEl.textContent = 'Preparing resume PDF...';
      const resumePdfBlob = await getResumePdfBlob();
      
      // Create form filler instance (will load profile from backend JSON)
      console.log('[Panel] Creating form filler instance...');
      const formFiller = new SmartFormFiller(backendUrl, null, 'AnishDhandore');
      
      // Fill form
      statusEl.textContent = 'Filling form fields...';
      const result = await formFiller.fillForm(
        resumeToUse,
        resumeFormatToUse,
        resumePdfBlob
      );
      
      statusEl.className = 'sanaai-status sanaai-status-success';
      statusEl.textContent = 'Form filled successfully! Please review all fields before submitting.';
      
      // Show confirmation
      const confirmed = confirm(
        'Form has been automatically filled!\n\n' +
        'IMPORTANT: Please review all information carefully before submitting.\n\n' +
        'Click OK to continue, or Cancel to review manually.'
      );
      
      if (!confirmed) {
        statusEl.textContent = 'Form filling completed. Please review manually.';
      }
    } catch (error) {
      statusEl.className = 'sanaai-status sanaai-status-error';
      statusEl.textContent = `Error: ${error.message}`;
      console.error('[Panel] Form filling error:', error);
    }
  }
  
  /**
   * Show user profile modal with editable fields
   */
  async function showProfileModal() {
    const modal = document.getElementById('sanaai-profileModal');
    const content = document.getElementById('sanaai-profileContent');
    
    // Load profile from backend JSON file
    const statusEl = document.getElementById('sanaai-profileStatus');
    statusEl.className = 'sanaai-status sanaai-status-info';
    statusEl.textContent = 'Loading profile...';
    
    try {
      const backendUrl = document.getElementById('sanaai-backendUrl').value;
      const response = await fetch(`${backendUrl}/get-user-profile?profile_name=AnishDhandore`);
      
      if (!response.ok) {
        throw new Error(`Failed to load profile: ${response.statusText}`);
      }
      
      const profile = await response.json();
      statusEl.textContent = '';
      statusEl.className = 'sanaai-status';
      
      // Render profile form
      renderProfileModal(modal, content, profile);
    } catch (error) {
      statusEl.className = 'sanaai-status sanaai-status-error';
      statusEl.textContent = `Error: ${error.message}`;
      content.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <p>Failed to load profile.</p>
          <p style="color: #666; font-size: 12px; margin-top: 10px;">
            Error: ${error.message}<br>
            Make sure backend/profiles/AnishDhandore.json exists and is valid JSON.
          </p>
        </div>
      `;
      modal.style.display = 'block';
    }
  }
  
  /**
   * Render profile modal content
   */
  function renderProfileModal(modal, content, profile) {
    if (!profile) {
      content.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <p>No profile data found.</p>
          <p style="color: #666; font-size: 12px; margin-top: 10px;">
            Profile is hardcoded in form-filler.js. Edit HARDCODED_USER_PROFILE to update your information.
          </p>
        </div>
      `;
      modal.style.display = 'block';
      return;
    }
      
      // Render profile form
      content.innerHTML = `
        <div style="padding: 10px;">
          <h4 style="margin-top: 0; margin-bottom: 15px; color: #333;">Personal Information</h4>
          <div style="margin-bottom: 15px;">
            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">First Name</label>
            <input type="text" id="profile-firstName" value="${(profile.personalInfo?.firstName || '').replace(/"/g, '&quot;')}" 
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Last Name</label>
            <input type="text" id="profile-lastName" value="${(profile.personalInfo?.lastName || '').replace(/"/g, '&quot;')}" 
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Email</label>
            <input type="email" id="profile-email" value="${(profile.personalInfo?.email || '').replace(/"/g, '&quot;')}" 
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Phone</label>
            <input type="tel" id="profile-phone" value="${(profile.personalInfo?.phone || '').replace(/"/g, '&quot;')}" 
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
          </div>
          
          <h4 style="margin-top: 20px; margin-bottom: 15px; color: #333;">Address</h4>
          <div style="margin-bottom: 15px;">
            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Street</label>
            <input type="text" id="profile-street" value="${(profile.personalInfo?.address?.street || '').replace(/"/g, '&quot;')}" 
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div>
              <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">City</label>
              <input type="text" id="profile-city" value="${(profile.personalInfo?.address?.city || '').replace(/"/g, '&quot;')}" 
                     style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">State</label>
              <input type="text" id="profile-state" value="${(profile.personalInfo?.address?.state || '').replace(/"/g, '&quot;')}" 
                     style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div>
              <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">ZIP Code</label>
              <input type="text" id="profile-zip" value="${(profile.personalInfo?.address?.zip || '').replace(/"/g, '&quot;')}" 
                     style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Country</label>
              <input type="text" id="profile-country" value="${(profile.personalInfo?.address?.country || 'United States').replace(/"/g, '&quot;')}" 
                     style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
            </div>
          </div>
          
          <h4 style="margin-top: 20px; margin-bottom: 15px; color: #333;">Skills</h4>
          <div style="margin-bottom: 15px;">
            <textarea id="profile-skills" rows="3" 
                      style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 12px;"
                      placeholder="Comma-separated skills">${(profile.skills || []).join(', ').replace(/"/g, '&quot;')}</textarea>
            <div style="font-size: 11px; color: #666; margin-top: 4px;">Enter skills separated by commas</div>
          </div>
          
          <h4 style="margin-top: 20px; margin-bottom: 15px; color: #333;">Summary</h4>
          <div style="margin-bottom: 15px;">
            <textarea id="profile-summary" rows="4" 
                      style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 12px;"
                      placeholder="Professional summary">${(profile.summary || '').replace(/"/g, '&quot;').replace(/\n/g, '&#10;')}</textarea>
          </div>
          
          <details style="margin-top: 20px;">
            <summary style="cursor: pointer; color: #666; font-size: 12px; margin-bottom: 10px;">Work History (${profile.workHistory?.length || 0} entries)</summary>
            <div id="profile-workHistory" style="max-height: 200px; overflow-y: auto; margin-top: 10px;">
              ${profile.workHistory?.map((job, idx) => `
                <div style="border: 1px solid #eee; padding: 10px; margin-bottom: 10px; border-radius: 4px;">
                  <strong>${job.company || 'Company'}</strong> - ${job.title || 'Title'}<br>
                  <small style="color: #666;">${job.startDate || ''} - ${job.endDate || 'Present'}</small>
                </div>
              `).join('') || '<p style="color: #666; font-size: 12px;">No work history</p>'}
            </div>
          </details>
          
          <details style="margin-top: 20px;">
            <summary style="cursor: pointer; color: #666; font-size: 12px; margin-bottom: 10px;">Education (${profile.education?.length || 0} entries)</summary>
            <div id="profile-education" style="max-height: 200px; overflow-y: auto; margin-top: 10px;">
              ${profile.education?.map((edu, idx) => `
                <div style="border: 1px solid #eee; padding: 10px; margin-bottom: 10px; border-radius: 4px;">
                  <strong>${edu.school || 'School'}</strong> - ${edu.degree || 'Degree'}<br>
                  <small style="color: #666;">${edu.major || ''} ${edu.gpa ? `(GPA: ${edu.gpa})` : ''}</small>
                </div>
              `).join('') || '<p style="color: #666; font-size: 12px;">No education</p>'}
            </div>
          </details>
        </div>
      `;
      
      modal.style.display = 'block';
  }
  
  /**
   * Save profile from modal
   * Note: This updates the profile in memory only. To persist, you need to update backend/profiles/AnishDhandore.json
   */
  async function saveProfileFromModal() {
    const statusEl = document.getElementById('sanaai-profileStatus');
    statusEl.className = 'sanaai-status sanaai-status-info';
    statusEl.textContent = 'Saving profile...';
    
    try {
      // Get current profile from backend
      const backendUrl = document.getElementById('sanaai-backendUrl').value;
      const response = await fetch(`${backendUrl}/get-user-profile?profile_name=AnishDhandore`);
      
      if (!response.ok) {
        throw new Error('Failed to load current profile');
      }
      
      const currentProfile = await response.json();
      
      // Update profile from form fields
      const updatedProfile = {
        ...currentProfile,
        personalInfo: {
          ...currentProfile.personalInfo,
          firstName: document.getElementById('profile-firstName').value,
          lastName: document.getElementById('profile-lastName').value,
          email: document.getElementById('profile-email').value,
          phone: document.getElementById('profile-phone').value,
          address: {
            street: document.getElementById('profile-street').value,
            city: document.getElementById('profile-city').value,
            state: document.getElementById('profile-state').value,
            zip: document.getElementById('profile-zip').value,
            country: document.getElementById('profile-country').value
          }
        },
        skills: document.getElementById('profile-skills').value.split(',').map(s => s.trim()).filter(s => s),
        summary: document.getElementById('profile-summary').value
      };
      
      // Update in memory (session only)
      if (window.HARDCODED_USER_PROFILE) {
        Object.assign(window.HARDCODED_USER_PROFILE, updatedProfile);
      }
      
      statusEl.className = 'sanaai-status sanaai-status-success';
      statusEl.textContent = 'Profile updated for this session! (Edit backend/profiles/AnishDhandore.json to make permanent)';
      document.getElementById('sanaai-profileModal').style.display = 'none';
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'sanaai-status';
      }, 5000);
    } catch (error) {
      statusEl.className = 'sanaai-status sanaai-status-error';
      statusEl.textContent = `Error: ${error.message}`;
    }
  }
  
  /**
   * Parse resume and update profile (session only)
   * Note: To make permanent, copy the parsed data to HARDCODED_USER_PROFILE in form-filler.js
   */
  async function parseAndUpdateProfile() {
    const statusEl = document.getElementById('sanaai-profileStatus');
    statusEl.className = 'sanaai-status sanaai-status-info';
    statusEl.textContent = 'Parsing resume...';
    
    try {
      const backendUrl = document.getElementById('sanaai-backendUrl').value;
      const resumeToParse = panelState.rewrittenResume || panelState.resumeData;
      
      if (!resumeToParse) {
        throw new Error('No resume available. Please load a resume first.');
      }
      
      const parseResponse = await fetch(`${backendUrl}/parse-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: resumeToParse,
          resume_format: panelState.resumeFormat || 'text'
        })
      });
      
      if (!parseResponse.ok) {
        throw new Error('Failed to parse resume');
      }
      
      const userProfile = await parseResponse.json();
      
      // Update profile in memory (session only)
      if (window.HARDCODED_USER_PROFILE) {
        Object.assign(window.HARDCODED_USER_PROFILE, userProfile);
      }
      
      statusEl.className = 'sanaai-status sanaai-status-success';
      statusEl.textContent = 'Profile updated from resume! (Session only - edit backend/profiles/AnishDhandore.json to make permanent)';
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'sanaai-status';
      }, 5000);
    } catch (error) {
      statusEl.className = 'sanaai-status sanaai-status-error';
      statusEl.textContent = `Error: ${error.message}`;
    }
  }
  
  /**
   * Download file helper
   */
  function downloadFile(content, filename, mimeType) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
  
  /**
   * Drag functionality
   */
  function startDrag(e) {
    if (e.target.closest('.sanaai-panel-controls')) return; // Don't drag when clicking buttons
    isDragging = true;
    dragStartX = e.clientX - panelElement.offsetLeft;
    dragStartY = e.clientY - panelElement.offsetTop;
    panelElement.style.cursor = 'grabbing';
  }
  
  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    const newX = e.clientX - dragStartX;
    const newY = e.clientY - dragStartY;
    
    // Keep panel within viewport
    const maxX = window.innerWidth - panelElement.offsetWidth;
    const maxY = window.innerHeight - panelElement.offsetHeight;
    
    const boundedX = Math.max(0, Math.min(newX, maxX));
    const boundedY = Math.max(0, Math.min(newY, maxY));
    
    panelElement.style.left = boundedX + 'px';
    panelElement.style.top = boundedY + 'px';
    panelElement.style.right = 'auto';
    
    panelState.position = { x: boundedX, y: boundedY };
    savePanelState();
  }
  
  function stopDrag() {
    if (isDragging) {
      isDragging = false;
      panelElement.style.cursor = '';
    }
  }
  
  /**
   * Toggle minimize
   */
  function toggleMinimize() {
    panelState.isMinimized = !panelState.isMinimized;
    const body = document.getElementById('sanaai-panel-body');
    if (panelState.isMinimized) {
      body.style.display = 'none';
    } else {
      body.style.display = 'block';
    }
    savePanelState();
  }
  
  /**
   * Close panel
   */
  function closePanel() {
    panelState.isOpen = false;
    
    // Reset workflow state for fresh start
    panelState.jobDescription = null;
    panelState.rewrittenResume = null;
    
    // Clear all status messages
    const statusElements = document.querySelectorAll('.sanaai-status');
    statusElements.forEach(el => {
      el.className = 'sanaai-status';
      el.textContent = '';
    });
    
    // Hide LaTeX section
    const latexSection = document.getElementById('sanaai-latexSection');
    if (latexSection) {
      latexSection.style.display = 'none';
    }
    
    if (panelElement) {
      panelElement.style.display = 'none';
    }
    
    // Save cleared state to storage (this ensures fresh start on reopen)
    savePanelState();
    
    // Also clear saved rewritten resume from storage
    setStorage({ savedRewrittenResume: null, savedRewrittenResumeFormat: null });
  }
  
  /**
   * Show panel
   */
  function showPanel() {
    console.log('showPanel called, panelElement:', panelElement);
    panelState.isOpen = true;
    
    // Check if panel exists and has latest features
    const existingPanel = document.getElementById(PANEL_ID);
    if (existingPanel) {
      const hasUserProfile = document.getElementById('sanaai-viewProfile');
      if (!hasUserProfile) {
        console.log('Panel exists but outdated - removing and recreating...');
        existingPanel.remove();
        panelElement = null;
      } else {
        panelElement = existingPanel;
      }
    }
    
    if (!panelElement) {
      console.log('Panel element not found, creating...');
      createPanel();
      panelElement = document.getElementById(PANEL_ID);
    }
    
    if (panelElement) {
      panelElement.style.display = 'flex'; // Use flex instead of block
      console.log('Panel displayed');
    } else {
      console.error('Failed to create panel element');
    }
    
    // Restore minimized state
    const body = document.getElementById('sanaai-panel-body');
    if (body) {
      if (panelState.isMinimized) {
        body.style.display = 'none';
      } else {
        body.style.display = 'block';
      }
    }
    
    savePanelState();
  }
  
  /**
   * Restore panel position
   */
  function restorePanelPosition() {
    if (panelState.position.x !== null && panelState.position.y !== null) {
      panelElement.style.left = panelState.position.x + 'px';
      panelElement.style.top = panelState.position.y + 'px';
      panelElement.style.right = 'auto';
    }
  }
  
  /**
   * Save panel state to storage
   */
  function savePanelState() {
    setStorage({
      [PANEL_STORAGE_KEY]: {
        isOpen: panelState.isOpen,
        isMinimized: panelState.isMinimized,
        position: panelState.position,
        resumeData: panelState.resumeData,
        jobDescription: panelState.jobDescription,
        rewrittenResume: panelState.rewrittenResume,
        resumeFormat: panelState.resumeFormat,
        isLaTeX: panelState.isLaTeX
      }
    });
  }
  
  /**
   * Get panel CSS
   */
  function getPanelCSS() {
    return `
      @keyframes sanaai-fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes sanaai-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
      @keyframes sanaai-spin {
        to { transform: rotate(360deg); }
      }
      
      #${PANEL_ID} {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 360px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 40px);
        background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.05);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        overflow: hidden;
        animation: sanaai-fadeIn 0.3s ease-out;
        color: #e4e4e7;
      }
      
      /* Header */
      .sanaai-header {
        background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: grab;
        user-select: none;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .sanaai-header:active { cursor: grabbing; }
      
      .sanaai-brand {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .sanaai-logo {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        overflow: hidden;
        background: linear-gradient(135deg, #ff9500 0%, #ff6b00 100%);
        padding: 2px;
        box-shadow: 0 4px 12px rgba(255, 149, 0, 0.3);
      }
      .sanaai-logo svg {
        width: 100%;
        height: 100%;
      }
      
      .sanaai-title {
        display: flex;
        flex-direction: column;
      }
      .sanaai-name {
        font-size: 16px;
        font-weight: 700;
        background: linear-gradient(135deg, #ff9500, #ffb347);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        letter-spacing: -0.3px;
      }
      .sanaai-tagline {
        font-size: 10px;
        color: #71717a;
        font-weight: 500;
        letter-spacing: 0.2px;
      }
      
      .sanaai-controls {
        display: flex;
        gap: 6px;
      }
      .sanaai-ctrl-btn {
        width: 26px;
        height: 26px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255,255,255,0.06);
        color: #a1a1aa;
        transition: all 0.2s;
      }
      .sanaai-ctrl-btn:hover {
        background: rgba(255,255,255,0.12);
        color: white;
      }
      .sanaai-close-btn:hover {
        background: #ef4444;
        color: white;
      }
      
      /* Body */
      .sanaai-body {
        overflow-y: auto;
        flex: 1;
        min-height: 0;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      
      /* Cards */
      .sanaai-card {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px;
        padding: 14px;
      }
      .sanaai-card-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }
      .sanaai-card-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
        display: flex;
        align-items: center;
        justify-content: center;
        color: #a78bfa;
      }
      .sanaai-card-title {
        font-size: 13px;
        font-weight: 600;
        color: #e4e4e7;
        flex: 1;
      }
      .sanaai-icon-btn {
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: rgba(255,255,255,0.05);
        color: #71717a;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .sanaai-icon-btn:hover {
        background: rgba(255,255,255,0.1);
        color: #a78bfa;
      }
      
      /* Workflow Steps */
      .sanaai-workflow {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .sanaai-step {
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 12px;
        padding: 14px;
        transition: all 0.2s;
      }
      .sanaai-step:hover {
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.08);
      }
      .sanaai-step-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .sanaai-step-num {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        font-weight: 700;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
      }
      .sanaai-step[data-step="2"] .sanaai-step-num {
        background: linear-gradient(135deg, #f59e0b, #d97706);
        box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
      }
      .sanaai-step[data-step="3"] .sanaai-step-num {
        background: linear-gradient(135deg, #10b981, #059669);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      }
      .sanaai-step-info {
        display: flex;
        flex-direction: column;
        flex: 1;
      }
      .sanaai-step-title {
        font-size: 13px;
        font-weight: 600;
        color: #f4f4f5;
      }
      .sanaai-step-desc {
        font-size: 11px;
        color: #71717a;
      }
      
      /* Action Buttons */
      .sanaai-action-btn {
        width: 100%;
        padding: 10px 16px;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s;
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
      }
      .sanaai-action-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(59, 130, 246, 0.35);
      }
      .sanaai-action-btn:active {
        transform: translateY(0);
      }
      .sanaai-btn-accent {
        background: linear-gradient(135deg, #f59e0b, #d97706);
        box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
      }
      .sanaai-btn-accent:hover {
        box-shadow: 0 6px 20px rgba(245, 158, 11, 0.35);
      }
      .sanaai-btn-success {
        background: linear-gradient(135deg, #10b981, #059669);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
      }
      .sanaai-btn-success:hover {
        box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35);
      }
      .sanaai-btn-purple {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.25);
      }
      .sanaai-btn-purple:hover {
        box-shadow: 0 6px 20px rgba(139, 92, 246, 0.35);
      }
      
      /* ATS Score Display */
      .sanaai-ats-score-card {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 16px;
        margin-top: 12px;
      }
      .sanaai-ats-score-main {
        text-align: center;
        margin-bottom: 16px;
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      .sanaai-ats-score-value {
        font-size: 48px;
        font-weight: 700;
        line-height: 1;
        margin-bottom: 4px;
        background: linear-gradient(135deg, #8b5cf6, #a78bfa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .sanaai-ats-score-label {
        font-size: 12px;
        color: #a1a1aa;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .sanaai-ats-breakdown {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }
      .sanaai-breakdown-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: rgba(255,255,255,0.02);
        border-radius: 6px;
        font-size: 12px;
      }
      .sanaai-breakdown-label {
        color: #a1a1aa;
        font-weight: 500;
      }
      .sanaai-breakdown-value {
        color: #e4e4e7;
        font-weight: 600;
      }
      .sanaai-ats-details {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .sanaai-ats-section {
        background: rgba(255,255,255,0.02);
        border-radius: 8px;
        padding: 12px;
      }
      .sanaai-ats-section h4 {
        font-size: 12px;
        font-weight: 600;
        color: #e4e4e7;
        margin: 0 0 8px 0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .sanaai-ats-section ul {
        margin: 0;
        padding-left: 20px;
        list-style-type: disc;
      }
      .sanaai-ats-section li {
        font-size: 11px;
        color: #d4d4d8;
        margin-bottom: 4px;
        line-height: 1.4;
      }
      .sanaai-ats-section li code {
        background: rgba(139, 92, 246, 0.2);
        color: #c4b5fd;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-family: 'SF Mono', Monaco, monospace;
      }
      
      /* Status Messages */
      .sanaai-status {
        margin-top: 10px;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 11px;
        display: none;
        font-weight: 500;
      }
      .sanaai-status.sanaai-status-success {
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.2);
        display: block;
      }
      .sanaai-status.sanaai-status-error {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
        border: 1px solid rgba(239, 68, 68, 0.2);
        display: block;
      }
      .sanaai-status.sanaai-status-info {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
        border: 1px solid rgba(59, 130, 246, 0.2);
        display: block;
        animation: sanaai-pulse 1.5s infinite;
      }
      
      /* LaTeX Tools */
      .sanaai-latex-tools {
        border-color: rgba(168, 85, 247, 0.2);
        background: rgba(168, 85, 247, 0.05);
      }
      .sanaai-btn-group {
        display: flex;
        gap: 6px;
      }
      .sanaai-sm-btn {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        background: rgba(255,255,255,0.05);
        color: #d4d4d8;
        transition: all 0.2s;
      }
      .sanaai-sm-btn:hover {
        background: rgba(255,255,255,0.1);
        color: white;
      }
      .sanaai-btn-dl {
        background: rgba(16, 185, 129, 0.15);
        border-color: rgba(16, 185, 129, 0.2);
        color: #34d399;
      }
      .sanaai-btn-dl:hover {
        background: rgba(16, 185, 129, 0.25);
      }
      
      /* Footer / Settings */
      .sanaai-footer {
        margin-top: auto;
        padding-top: 12px;
        border-top: 1px solid rgba(255,255,255,0.06);
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .sanaai-link-btn {
        background: none;
        border: none;
        color: #71717a;
        font-size: 11px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.2s;
      }
      .sanaai-link-btn:hover {
        color: #a78bfa;
        background: rgba(167, 139, 250, 0.1);
      }
      .sanaai-settings-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        justify-content: flex-end;
      }
      .sanaai-settings-row label {
        font-size: 10px;
        color: #52525b;
      }
      .sanaai-settings-row input {
        width: 140px;
        padding: 5px 8px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 4px;
        font-size: 10px;
        background: rgba(0,0,0,0.3);
        color: #a1a1aa;
        font-family: 'SF Mono', Monaco, monospace;
      }
      .sanaai-settings-row input:focus {
        outline: none;
        border-color: rgba(167, 139, 250, 0.4);
      }
      
      /* Modal */
      .sanaai-modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(4px);
        z-index: 2147483648;
        overflow: auto;
        padding: 40px 20px;
        box-sizing: border-box;
      }
      .sanaai-modal-box {
        background: linear-gradient(145deg, #1a1a2e, #16213e);
        margin: 0 auto;
        padding: 20px;
        max-width: 700px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 25px 80px rgba(0,0,0,0.5);
        animation: sanaai-fadeIn 0.2s ease-out;
      }
      .sanaai-profile-modal {
        max-width: 550px;
      }
      .sanaai-modal-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .sanaai-modal-top h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #f4f4f5;
      }
      .sanaai-modal-close {
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: rgba(255,255,255,0.06);
        color: #71717a;
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .sanaai-modal-close:hover {
        background: #ef4444;
        color: white;
      }
      .sanaai-code-preview {
        width: 100%;
        height: 60vh;
        font-family: 'SF Mono', 'Fira Code', Monaco, monospace;
        font-size: 11px;
        padding: 16px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        background: rgba(0,0,0,0.4);
        color: #a1a1aa;
        resize: none;
        box-sizing: border-box;
      }
      .sanaai-code-preview:focus {
        outline: none;
        border-color: rgba(167, 139, 250, 0.4);
      }
      .sanaai-profile-content {
        max-height: 60vh;
        overflow-y: auto;
        padding: 4px;
      }
      .sanaai-modal-btns {
        margin-top: 16px;
        display: flex;
        gap: 10px;
      }
      .sanaai-modal-btn {
        flex: 1;
        padding: 10px 16px;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        transition: all 0.2s;
      }
      .sanaai-modal-btn:hover {
        transform: translateY(-1px);
      }
      .sanaai-btn-cancel {
        background: rgba(255,255,255,0.06);
        color: #a1a1aa;
      }
      .sanaai-btn-cancel:hover {
        background: rgba(255,255,255,0.1);
        color: white;
      }
      
      /* Scrollbar */
      .sanaai-body::-webkit-scrollbar,
      .sanaai-profile-content::-webkit-scrollbar,
      .sanaai-code-preview::-webkit-scrollbar {
        width: 6px;
      }
      .sanaai-body::-webkit-scrollbar-track,
      .sanaai-profile-content::-webkit-scrollbar-track,
      .sanaai-code-preview::-webkit-scrollbar-track {
        background: transparent;
      }
      .sanaai-body::-webkit-scrollbar-thumb,
      .sanaai-profile-content::-webkit-scrollbar-thumb,
      .sanaai-code-preview::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.1);
        border-radius: 3px;
      }
      .sanaai-body::-webkit-scrollbar-thumb:hover,
      .sanaai-profile-content::-webkit-scrollbar-thumb:hover,
      .sanaai-code-preview::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.2);
      }
    `;
  }
  
  // Export functions for content script to use
  // IMPORTANT: Set this FIRST before any async operations
  console.log('[PANEL.JS] Setting up SanaAIPanel object');
  try {
    window.SanaAIPanel = {
      create: createPanel,
      show: showPanel,
      close: closePanel,
      toggleMinimize: toggleMinimize,
      isOpen: () => panelState.isOpen
    };
    console.log('[PANEL.JS] SanaAIPanel object created successfully');
    
    // Listen for messages from content script (fallback method)
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SANAAI_CONTENT_TO_PANEL') {
        const { action } = event.data;
        console.log('[PANEL.JS] Received message from content script:', action);
        
        if (action === 'showPanel') {
          showPanel();
        } else if (action === 'togglePanel') {
          if (panelState.isOpen) {
            const panel = document.getElementById(PANEL_ID);
            if (panel && panel.style.display !== 'none') {
              closePanel();
            } else {
              showPanel();
            }
          } else {
            showPanel();
          }
        } else if (action === 'createPanel') {
          createPanel();
        }
      }
    });
    
    // Notify content script that panel is ready
    window.postMessage({
      type: 'SANAAI_PANEL_READY',
      ready: true
    }, '*');
    console.log('[PANEL.JS] Sent ready message to content script');
    
  } catch (error) {
    console.error('[PANEL.JS] CRITICAL: Error creating SanaAIPanel object:', error);
  }
  
  // Verify it was set
  if (!window.SanaAIPanel) {
    console.error('[PANEL.JS] CRITICAL: window.SanaAIPanel was not set!');
  } else {
    console.log('[PANEL.JS] SUCCESS: window.SanaAIPanel is available');
  }
  
  // Auto-restore panel on page load if it was open (do this after setting window.SanaAIPanel)
  setTimeout(() => {
    try {
      getStorage([PANEL_STORAGE_KEY], (result) => {
        if (result && result[PANEL_STORAGE_KEY] && result[PANEL_STORAGE_KEY].isOpen) {
          const savedState = result[PANEL_STORAGE_KEY];
          panelState = { ...panelState, ...savedState };
          showPanel();
        }
      });
    } catch (error) {
      console.error('Error in auto-restore:', error);
    }
  }, 100);
  
  console.log('Panel.js IIFE completed');
})();
