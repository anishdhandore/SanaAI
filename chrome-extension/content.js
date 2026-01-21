// Content script for extracting job descriptions and filling forms
// Also manages the floating panel injection

(function() {
  'use strict';
  
  // Check if we're in a valid context
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    console.error('Chrome extension APIs not available');
    return;
  }
  
  let panelScriptInjected = false;
  let formFillerScriptInjected = false;
  
  /**
   * Inject form-filler script into page context (proactively)
   */
  function injectFormFillerScript() {
    if (formFillerScriptInjected) {
      console.log('Form filler script already injected');
      return;
    }
    
    if (!window.SmartFormFiller) {
      console.log('Injecting form-filler script...');
      const formFillerUrl = chrome.runtime.getURL('form-filler.js');
      const script = document.createElement('script');
      script.src = formFillerUrl;
      script.onload = function() {
        console.log('Form filler script loaded successfully');
        formFillerScriptInjected = true;
      };
      script.onerror = function(error) {
        console.error('Failed to load form-filler.js:', error);
        formFillerScriptInjected = false;
      };
      (document.head || document.documentElement).appendChild(script);
    } else {
      formFillerScriptInjected = true;
      console.log('Form filler already available');
    }
  }
  
  /**
   * Inject panel script into page context
   */
  function injectPanelScript() {
    if (panelScriptInjected) {
      console.log('Panel script already injected');
      // Still ensure form-filler is injected
      injectFormFillerScript();
      return;
    }
    
    // Inject form-filler first (proactively)
    injectFormFillerScript();
    
    console.log('Injecting panel script...');
    const panelUrl = chrome.runtime.getURL('panel.js');
    console.log('Panel script URL:', panelUrl);
    
    // Inject panel.js as a script tag
    const script = document.createElement('script');
    script.src = panelUrl;
    script.onload = function() {
      console.log('Panel script loaded successfully');
      console.log('Script element:', this);
      console.log('Script src:', this.src);
      // Wait a bit for the script to execute
      // Don't remove script immediately - wait for it to fully execute
      // The script needs to stay in DOM for window.SanaAIPanel to be accessible
      setTimeout(() => {
        console.log('Checking for SanaAIPanel after load...');
        // Check in page context (where injected scripts run)
        const pageWindow = window;
        console.log('pageWindow.SanaAIPanel:', pageWindow.SanaAIPanel);
        if (pageWindow.SanaAIPanel) {
          console.log('✓ SanaAIPanel object found:', pageWindow.SanaAIPanel);
          // Only remove after confirming it's accessible
          setTimeout(() => this.remove(), 1000);
        } else {
          console.error('✗ SanaAIPanel object not found after script load');
          console.error('Keeping script tag for debugging - check page console');
          // Don't remove - keep for debugging
        }
      }, 500);
    };
    script.onerror = function(error) {
      console.error('Failed to load panel.js:', error);
      console.error('Script src was:', panelUrl);
      panelScriptInjected = false; // Allow retry
    };
    
    try {
      (document.head || document.documentElement).appendChild(script);
      panelScriptInjected = true;
      console.log('Script tag appended to DOM');
    } catch (error) {
      console.error('Error appending script:', error);
      panelScriptInjected = false;
    }
  }
  
  let panelReady = false;
  
  // Listen for panel ready message
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SANAAI_PANEL_READY') {
      console.log('Panel is ready!');
      panelReady = true;
    }
  });
  
  /**
   * Show or toggle the panel
   */
  function togglePanel() {
    console.log('togglePanel called');
    injectPanelScript();
    
    // Wait a bit for script to load, then show panel
    let retries = 0;
    const maxRetries = 30; // 3 seconds max wait
    
    const tryShowPanel = () => {
      console.log('Checking for panel, attempt:', retries + 1);
      
      // Try direct access first
      let panelAPI = null;
      try {
        panelAPI = window.SanaAIPanel;
      } catch (e) {
        // Ignore
      }
      
      if (panelAPI || panelReady) {
        console.log('Panel API found or ready');
        
        if (panelAPI) {
          // Use direct API
          try {
            if (panelAPI.isOpen && panelAPI.isOpen()) {
              const panel = document.getElementById('sanaai-panel');
              if (panel && panel.style.display !== 'none') {
                panelAPI.close();
              } else {
                panelAPI.show();
              }
            } else {
              panelAPI.create();
              panelAPI.show();
            }
            return; // Success!
          } catch (error) {
            console.error('Error using direct API:', error);
          }
        }
        
        // Fallback: use postMessage
        console.log('Using postMessage to communicate with panel');
        window.postMessage({
          type: 'SANAAI_CONTENT_TO_PANEL',
          action: 'togglePanel'
        }, '*');
        return; // Success!
      }
      
      // Not ready yet
      retries++;
      if (retries < maxRetries) {
        setTimeout(tryShowPanel, 100);
      } else {
        console.error('Failed to load panel after', maxRetries, 'retries');
        alert('Failed to load SanaAI panel. Please reload the extension and page.');
      }
    };
    
    setTimeout(tryShowPanel, 300);
  }
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request.action);
    
    if (request.action === 'togglePanel') {
      console.log('Toggle panel requested');
      togglePanel();
      sendResponse({ success: true });
      return true;
    }
    
    if (request.action === 'extractJD') {
      extractJobDescription()
        .then(jdText => {
          console.log('JD extracted:', jdText.length, 'characters');
          sendResponse({ success: true, jdText });
        })
        .catch(error => {
          console.error('JD extraction error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
    
    if (request.action === 'fillForm') {
      // Use SmartFormFiller for intelligent form filling
      fillFormWithSmartFiller(request.resume, request.resumeFormat, request.resumePdfBlob)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
    
    return true;
  });
  
  // Auto-restore panel on page load if it was previously open
  chrome.storage.local.get(['sanaaiPanelState'], (result) => {
    if (result.sanaaiPanelState && result.sanaaiPanelState.isOpen) {
      // Inject and show panel after a short delay to ensure DOM is ready
      setTimeout(() => {
        injectPanelScript();
        setTimeout(() => {
          if (window.SanaAIPanel) {
            window.SanaAIPanel.create();
            window.SanaAIPanel.show();
          }
        }, 100);
      }, 500);
    }
  });
  
  // Listen for messages from panel.js (page context)
  window.addEventListener('message', (event) => {
    // Only accept messages from our extension
    if (event.data && event.data.type === 'SANAAI_PANEL_MESSAGE') {
      console.log('Content script received panel message:', event.data.payload.action);
      const { action, keys, data, storageType, requestId } = event.data.payload;
      
      // Handle request for form-filler URL (before checking extension context)
      if (action === 'getFormFillerUrl') {
        try {
          const formFillerUrl = chrome.runtime.getURL('form-filler.js');
          window.postMessage({
            type: 'SANAAI_PANEL_RESPONSE',
            requestId: requestId,
            result: { url: formFillerUrl }
          }, '*');
        } catch (error) {
          window.postMessage({
            type: 'SANAAI_PANEL_RESPONSE',
            requestId: requestId,
            result: { error: error.message }
          }, '*');
        }
        return;
      }
      
      // Check if extension context is still valid
      try {
        if (typeof chrome === 'undefined' || !chrome.storage) {
          throw new Error('Extension context invalidated');
        }
      } catch (e) {
        console.warn('Extension context invalidated, cannot handle storage request');
        try {
          window.postMessage({
            type: 'SANAAI_PANEL_RESPONSE',
            requestId: requestId,
            result: { error: 'Extension context invalidated. Please reload the page.' }
          }, '*');
        } catch (e2) {
          // Can't even post error
        }
        return;
      }
      
      try {
        if (action === 'getStorage') {
          const storage = storageType === 'sync' ? chrome.storage.sync : chrome.storage.local;
          storage.get(keys, (result) => {
            try {
              window.postMessage({
                type: 'SANAAI_PANEL_RESPONSE',
                requestId: requestId,
                result: result
              }, '*');
            } catch (e) {
              console.error('Error posting response:', e);
            }
          });
        } else if (action === 'setStorage') {
          const storage = storageType === 'sync' ? chrome.storage.sync : chrome.storage.local;
          storage.set(data, () => {
            try {
              window.postMessage({
                type: 'SANAAI_PANEL_RESPONSE',
                requestId: requestId,
                result: { success: true }
              }, '*');
            } catch (e) {
              console.error('Error posting response:', e);
            }
          });
        } else if (action === 'proxyFetch') {
          // Generic fetch proxy to bypass page CSP, with optional timeout
          const { url, fetchOptions, timeoutMs } = data || {};
          (async () => {
            try {
              if (!url) throw new Error('Missing url for proxyFetch');
              const options = fetchOptions ? { ...fetchOptions } : {};
              const controller = new AbortController();
              const toMs = timeoutMs || 120000; // default 120s for LLM calls
              console.log('[CONTENT] proxyFetch starting:', url, 'timeout:', toMs/1000 + 's');
              const timer = setTimeout(() => {
                console.warn('[CONTENT] proxyFetch timeout reached:', toMs/1000 + 's');
                controller.abort();
              }, toMs);
              options.signal = controller.signal;
              const resp = await fetch(url, options);
              clearTimeout(timer);
              const contentType = resp.headers.get('content-type') || '';
              let payload = null;
              if (contentType.includes('application/json')) {
                payload = await resp.json();
              } else {
                payload = await resp.text();
              }
              console.log('[CONTENT] proxyFetch completed:', { url, status: resp.status, ok: resp.ok });
              window.postMessage({
                type: 'SANAAI_PANEL_RESPONSE',
                requestId: requestId,
                result: { ok: resp.ok, status: resp.status, payload }
              }, '*');
            } catch (e) {
              const errMsg = e?.name === 'AbortError' ? 'Request timed out (LLM may be slow)' : (e?.message || 'Fetch failed');
              console.warn('[CONTENT] proxyFetch error:', errMsg);
              window.postMessage({
                type: 'SANAAI_PANEL_RESPONSE',
                requestId: requestId,
                result: { error: errMsg }
              }, '*');
            }
          })();
        } else if (action === 'fetchOriginalResume') {
          // Fetch resume from backend via content script (bypasses page CSP)
          const backendUrl = data?.backendUrl || 'http://localhost:8000';
          (async () => {
            try {
              const resp = await fetch(`${backendUrl}/get-original-resume`, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit'
              });
              if (!resp.ok) {
                const text = await resp.text().catch(() => resp.statusText);
                throw new Error(text || resp.statusText || 'Failed to fetch resume');
              }
              const json = await resp.json();
              window.postMessage({
                type: 'SANAAI_PANEL_RESPONSE',
                requestId: requestId,
                result: { success: true, data: json }
              }, '*');
            } catch (e) {
              window.postMessage({
                type: 'SANAAI_PANEL_RESPONSE',
                requestId: requestId,
                result: { error: e.message || 'Failed to fetch resume' }
              }, '*');
            }
          })();
        }
      } catch (error) {
        console.error('Error handling panel message:', error);
        try {
          window.postMessage({
            type: 'SANAAI_PANEL_RESPONSE',
            requestId: requestId,
            result: { error: error.message }
          }, '*');
        } catch (e) {
          // Can't post error response
        }
      }
    }
  });
  
  console.log('Content script loaded and ready');
})();

// Extract job description from page
async function extractJobDescription() {
  // Common selectors for job description sections (prioritize specific ones)
  const selectors = [
    '[data-testid*="job-description"]',
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[id*="job-description"]',
    '[id*="jobDescription"]',
    '.job-description',
    '#job-description',
    '[data-testid*="description"]',
    '[class*="job-details"]',
    '[class*="jobDetails"]',
    '[class*="job-content"]',
    '[class*="jobContent"]',
    '[class*="position-description"]',
    '[class*="role-description"]',
  ];

  // EXCLUDE these sections (forms, footers, cookie banners, etc.)
  const excludeSelectors = [
    'form',
    '[role="form"]',
    '[class*="apply"]',
    '[class*="application"]',
    '[id*="apply"]',
    '[id*="application"]',
    '[class*="cookie"]',
    '[id*="cookie"]',
    '[class*="consent"]',
    '[id*="consent"]',
    '[class*="privacy"]',
    '[id*="privacy"]',
    '[class*="footer"]',
    '[id*="footer"]',
    '[role="contentinfo"]',
    '[class*="banner"]',
    '[id*="banner"]',
    '[class*="modal"]',
    '[id*="modal"]',
    '[class*="overlay"]',
    '[data-testid*="cookie"]',
    '[data-testid*="consent"]',
    '[data-testid*="apply"]',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="textbox"]',
    '[role="combobox"]',
  ];

  let jdText = '';
  
  // First, try specific JD selectors
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      elements.forEach(el => {
        // Skip if element is inside excluded sections
        let isExcluded = false;
        for (const excludeSel of excludeSelectors) {
          if (el.closest(excludeSel)) {
            isExcluded = true;
            break;
          }
        }
        if (isExcluded) return;
        
        const text = el.innerText || el.textContent || '';
        // Prefer longer, more detailed text
        if (text.length > jdText.length && text.length > 200) {
          jdText = text;
        }
      });
    }
  }

  // Fallback: try to find main content area, but exclude forms/footers
  if (!jdText || jdText.length < 200) {
    const mainContent = document.querySelector('main, [role="main"], article, [class*="content"]:not([class*="apply"]):not([class*="cookie"])');
    if (mainContent) {
      // Remove excluded sections from main content
      const excludedElements = mainContent.querySelectorAll(excludeSelectors.join(', '));
      excludedElements.forEach(el => el.style.display = 'none'); // Temporarily hide
      
      const text = mainContent.innerText || mainContent.textContent || '';
      
      // Restore excluded elements
      excludedElements.forEach(el => el.style.display = '');
      
      if (text.length > jdText.length && text.length > 200) {
        jdText = text;
      }
    }
  }

  // Last resort: find largest text block with job-related keywords
  if (!jdText || jdText.length < 200) {
    const allTextElements = document.querySelectorAll('p, div, section, article');
    let maxLength = 0;
    allTextElements.forEach(el => {
      // Skip excluded sections
      let isExcluded = false;
      for (const excludeSel of excludeSelectors) {
        if (el.closest(excludeSel) || el.matches(excludeSel)) {
          isExcluded = true;
          break;
        }
      }
      if (isExcluded) return;
      
      const text = el.innerText || el.textContent || '';
      const textLower = text.toLowerCase();
      
      // Look for job-related keywords and avoid form/cookie keywords
      const jobKeywords = ['requirements', 'qualifications', 'responsibilities', 'experience', 'skills', 'education', 'position', 'role', 'duties'];
      const excludeKeywords = ['cookie', 'consent', 'privacy policy', 'personal data', 'apply now', 'submit application', 'form', 'input', 'checkbox', 'radio'];
      
      const hasJobKeywords = jobKeywords.some(kw => textLower.includes(kw));
      const hasExcludeKeywords = excludeKeywords.some(kw => textLower.includes(kw));
      
      if (text.length > maxLength && hasJobKeywords && !hasExcludeKeywords && text.length > 200) {
        maxLength = text.length;
        jdText = text;
      }
    });
  }

  if (!jdText || jdText.length < 100) {
    throw new Error('Could not find job description on this page. Please ensure you are on a job posting page.');
  }

  // Enhanced filtering for boilerplate and irrelevant content
  const boilerplatePatterns = [
    // Legal/EEO
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
    
    // Cookie/Privacy/Data
    /cookie[^.]*/gi,
    /Cookie[^.]*/g,
    /privacy policy[^.]*/gi,
    /Privacy Policy[^.]*/g,
    /personal data[^.]*/gi,
    /Personal Data[^.]*/g,
    /data protection[^.]*/gi,
    /GDPR[^.]*/gi,
    /consent[^.]*/gi,
    /tracking[^.]*/gi,
    /analytics.*cookie[^.]*/gi,
    /performance.*cookie[^.]*/gi,
    /targeting.*cookie[^.]*/gi,
    /necessary.*cookie[^.]*/gi,
    /accept.*cookie[^.]*/gi,
    /manage.*preference[^.]*/gi,
    
    // Form/Application UI
    /apply now[^.]*/gi,
    /Apply Now[^.]*/g,
    /submit.*application[^.]*/gi,
    /upload.*resume[^.]*/gi,
    /upload.*file[^.]*/gi,
    /choose.*file[^.]*/gi,
    /browse[^.]*/gi,
    /required field[^.]*/gi,
    /this field is required[^.]*/gi,
    /please.*select[^.]*/gi,
    /please.*enter[^.]*/gi,
    /first name[^.]*/gi,
    /last name[^.]*/gi,
    /email address[^.]*/gi,
    /phone number[^.]*/gi,
    /address[^.]*/gi,
    /city[^.]*/gi,
    /state[^.]*/gi,
    /zip code[^.]*/gi,
    /postal code[^.]*/gi,
    /country[^.]*/gi,
    
    // Navigation/UI
    /click here[^.]*/gi,
    /learn more[^.]*/gi,
    /read more[^.]*/gi,
    /view.*job[^.]*/gi,
    /back to.*job[^.]*/gi,
    /share.*job[^.]*/gi,
    /save.*job[^.]*/gi,
    
    // Footer/Contact
    /follow us[^.]*/gi,
    /connect with us[^.]*/gi,
    /social media[^.]*/gi,
    /©.*copyright[^.]*/gi,
    /all rights reserved[^.]*/gi,
  ];
  
  let cleanedText = jdText.trim();
  
  // Remove boilerplate patterns
  boilerplatePatterns.forEach(pattern => {
    cleanedText = cleanedText.replace(pattern, '');
  });
  
  // Remove lines that are likely form labels or UI text
  const lines = cleanedText.split('\n');
  const filteredLines = lines.filter(line => {
    const lineLower = line.toLowerCase().trim();
    // Skip short lines that look like form labels or buttons
    if (line.length < 3) return false;
    if (line.match(/^[A-Z\s]{1,30}$/) && line.length < 30) return false; // Likely button text
    if (lineLower.match(/^(apply|submit|upload|browse|choose|select|enter|required|optional)$/)) return false;
    if (lineLower.includes('cookie') || lineLower.includes('consent') || lineLower.includes('privacy')) return false;
    if (lineLower.match(/^(first|last|email|phone|address|city|state|zip|country).*name?/i)) return false;
    return true;
  });
  
  cleanedText = filteredLines.join('\n');
  
  // Remove excessive whitespace
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{3,}/g, ' ');
  
  // Final check: if cleaned text is too short or contains too many form-related words, try to extract better content
  const formWordCount = (cleanedText.match(/\b(cookie|consent|privacy|apply|submit|upload|form|input|field|required)\b/gi) || []).length;
  const totalWords = cleanedText.split(/\s+/).length;
  const formWordRatio = formWordCount / totalWords;
  
  if (cleanedText.length < 200 || formWordRatio > 0.05) {
    // Too much form content, try to find better JD content
    console.warn('[JD Extraction] Detected form/cookie content, attempting better extraction...');
    // Use original jdText but with stricter filtering
    cleanedText = jdText.trim();
    // Remove entire paragraphs that contain form/cookie keywords
    const paragraphs = cleanedText.split(/\n\n+/);
    cleanedText = paragraphs
      .filter(p => {
        const pLower = p.toLowerCase();
        return !pLower.includes('cookie') && 
               !pLower.includes('consent') && 
               !pLower.includes('privacy policy') &&
               !pLower.includes('apply now') &&
               !pLower.includes('submit application') &&
               !pLower.match(/^(first|last|email|phone|address)/i);
      })
      .join('\n\n');
  }
  
  // If still too short, use original but warn
  if (cleanedText.length < 100) {
    console.warn('[JD Extraction] Cleaned text too short, using original with minimal filtering');
    cleanedText = jdText.trim();
  }

  return cleanedText.trim();
}

// Fill form using SmartFormFiller
async function fillFormWithSmartFiller(resumeText, resumeFormat = 'text', resumePdfBlob = null) {
  // Load SmartFormFiller script
  const formFillerUrl = chrome.runtime.getURL('form-filler.js');
  
  // Inject form-filler.js if not already loaded
  if (!window.SmartFormFiller) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = formFillerUrl;
      script.onload = () => {
        if (window.SmartFormFiller) {
          resolve();
        } else {
          reject(new Error('SmartFormFiller not found'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load form-filler.js'));
      (document.head || document.documentElement).appendChild(script);
    });
  }

  // Get backend URL from storage
  const backendUrl = await new Promise((resolve) => {
    chrome.storage.sync.get(['backendUrl'], (result) => {
      resolve(result.backendUrl || 'http://localhost:8000');
    });
  });

  // Create form filler and fill form (will load profile from backend JSON)
  console.log('[Content] Creating form filler instance...');
  const formFiller = new window.SmartFormFiller(backendUrl, null, 'AnishDhandore');
  return await formFiller.fillForm(resumeText, resumeFormat, resumePdfBlob);
}
