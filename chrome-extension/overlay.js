// Overlay script for SanaAI Job Assistant - Persistent window version

let resumeData = null;
let jobDescription = null;
let rewrittenResume = null;
let resumeFormat = 'text'; // 'text' or 'latex'
let isLaTeX = false;
let isMinimized = false;

// Window controls
document.querySelector('.window-btn.minimize').addEventListener('click', () => {
  isMinimized = !isMinimized;
  document.body.classList.toggle('minimized', isMinimized);
  chrome.storage.local.set({ overlayMinimized: isMinimized });
});

document.querySelector('.window-btn.maximize').addEventListener('click', () => {
  // Toggle between normal and maximized size
  chrome.storage.local.get(['overlayWidth', 'overlayHeight'], (result) => {
    const currentWidth = result.overlayWidth || 400;
    const currentHeight = result.overlayHeight || 600;
    
    if (currentWidth === 400) {
      // Maximize
      chrome.storage.local.set({ overlayWidth: 600, overlayHeight: 800 });
      chrome.runtime.sendMessage({ action: 'resizeOverlay', width: 600, height: 800 });
    } else {
      // Restore
      chrome.storage.local.set({ overlayWidth: 400, overlayHeight: 600 });
      chrome.runtime.sendMessage({ action: 'resizeOverlay', width: 400, height: 600 });
    }
  });
});

document.querySelector('.window-btn.close').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'closeOverlay' });
});

// Save state periodically to preserve progress
function saveState() {
  chrome.storage.local.set({
    overlayResumeData: resumeData,
    overlayJobDescription: jobDescription,
    overlayRewrittenResume: rewrittenResume,
    overlayResumeFormat: resumeFormat,
    overlayIsLaTeX: isLaTeX
  });
}

// Load saved state on startup
chrome.storage.local.get([
  'backendUrl', 'savedResume', 'savedResumeFormat',
  'overlayResumeData', 'overlayJobDescription', 'overlayRewrittenResume',
  'overlayResumeFormat', 'overlayIsLaTeX', 'overlayMinimized'
], async (result) => {
  // Restore minimized state
  if (result.overlayMinimized) {
    isMinimized = true;
    document.body.classList.add('minimized');
  }
  
  // Restore data
  if (result.overlayResumeData) {
    resumeData = result.overlayResumeData;
    resumeFormat = result.overlayResumeFormat || 'text';
    isLaTeX = result.overlayIsLaTeX || false;
  }
  if (result.overlayJobDescription) {
    jobDescription = result.overlayJobDescription;
    document.getElementById('jdStatus').className = 'status success';
    document.getElementById('jdStatus').textContent = `Job description loaded (${jobDescription.length} chars)`;
  }
  if (result.overlayRewrittenResume) {
    rewrittenResume = result.overlayRewrittenResume;
  }
  
  const backendUrl = result.backendUrl || 'http://localhost:8000';
  if (result.backendUrl) {
    document.getElementById('backendUrl').value = result.backendUrl;
  }
  
  // Try to load original resume from backend first (if not already loaded)
  if (!resumeData) {
    const statusEl = document.getElementById('resumeStatus');
    statusEl.className = 'status info';
    statusEl.textContent = 'Loading original resume...';
    
    try {
      const response = await fetch(`${backendUrl}/get-original-resume`);
      if (response.ok) {
        const data = await response.json();
        resumeData = data.resume;
        resumeFormat = data.format;
        isLaTeX = resumeFormat === 'latex';
        
        // Save to storage
        chrome.storage.local.set({
          savedResume: resumeData,
          savedResumeFormat: resumeFormat
        });
        saveState();
        
        statusEl.className = 'status success';
        const folderInfo = data.folder ? ` from ${data.folder}/` : '';
        statusEl.textContent = `Original resume loaded: ${data.filename}${folderInfo} (${resumeFormat.toUpperCase()})`;
        
        // Show/hide LaTeX section
        const latexSection = document.getElementById('latexSection');
        if (isLaTeX) {
          latexSection.style.display = 'block';
        }
      } else {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        if (result.savedResume) {
          resumeData = result.savedResume;
          resumeFormat = result.savedResumeFormat || 'text';
          isLaTeX = resumeFormat === 'latex';
          
          statusEl.className = 'status info';
          statusEl.textContent = `Using saved resume (${resumeFormat.toUpperCase()})`;
          
          const latexSection = document.getElementById('latexSection');
          if (isLaTeX) {
            latexSection.style.display = 'block';
          }
        } else {
          statusEl.className = 'status error';
          statusEl.textContent = `Backend error: ${errorData.detail || response.statusText}`;
        }
      }
    } catch (error) {
      if (result.savedResume) {
        resumeData = result.savedResume;
        resumeFormat = result.savedResumeFormat || 'text';
        isLaTeX = resumeFormat === 'latex';
        
        const statusEl = document.getElementById('resumeStatus');
        statusEl.className = 'status info';
        statusEl.textContent = `Using saved resume (${resumeFormat.toUpperCase()})`;
        
        const latexSection = document.getElementById('latexSection');
        if (isLaTeX) {
          latexSection.style.display = 'block';
        }
      }
    }
  } else {
    // Resume already loaded from saved state
    const statusEl = document.getElementById('resumeStatus');
    statusEl.className = 'status success';
    statusEl.textContent = `Resume loaded (${resumeFormat.toUpperCase()})`;
    
    const latexSection = document.getElementById('latexSection');
    if (isLaTeX) {
      latexSection.style.display = 'block';
    }
  }
});

// Save backend URL on change
document.getElementById('backendUrl').addEventListener('change', (e) => {
  chrome.storage.sync.set({ backendUrl: e.target.value });
});

// Reload resume from backend
document.getElementById('reloadResume').addEventListener('click', async () => {
  const backendUrl = document.getElementById('backendUrl').value;
  const statusEl = document.getElementById('resumeStatus');
  statusEl.className = 'status info';
  statusEl.textContent = 'Reloading resume...';
  
  try {
    const response = await fetch(`${backendUrl}/get-original-resume`);
    if (response.ok) {
      const data = await response.json();
      resumeData = data.resume;
      resumeFormat = data.format;
      isLaTeX = resumeFormat === 'latex';
      
      chrome.storage.local.set({
        savedResume: resumeData,
        savedResumeFormat: resumeFormat
      });
      saveState();
      
      statusEl.className = 'status success';
      statusEl.textContent = `Resume reloaded: ${data.filename} (${resumeFormat.toUpperCase()})`;
      
      const latexSection = document.getElementById('latexSection');
      if (isLaTeX) {
        latexSection.style.display = 'block';
      } else {
        latexSection.style.display = 'none';
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to load resume');
    }
  } catch (error) {
    statusEl.className = 'status error';
    statusEl.textContent = `Error: ${error.message}`;
  }
});

// Extract job description from current page
document.getElementById('extractJD').addEventListener('click', async () => {
  const statusEl = document.getElementById('jdStatus');
  statusEl.className = 'status info';
  statusEl.textContent = 'Extracting job description...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      throw new Error('Cannot extract from this page. Please navigate to a job posting page.');
    }
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (injectError) {
      console.log('Script injection note:', injectError.message);
    }
    
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractJD' });
    
    if (response && response.success) {
      jobDescription = response.jdText;
      saveState();
      statusEl.className = 'status success';
      statusEl.textContent = `Extracted ${jobDescription.length} characters`;
    } else {
      throw new Error(response?.error || 'Failed to extract JD');
    }
  } catch (error) {
    statusEl.className = 'status error';
    if (error.message.includes('Receiving end does not exist')) {
      statusEl.textContent = 'Content script not ready. Try refreshing the page and clicking again.';
    } else {
      statusEl.textContent = `Error: ${error.message}`;
    }
    console.error('JD extraction error:', error);
  }
});

// Process job and rewrite resume
document.getElementById('processJob').addEventListener('click', async () => {
  if (!resumeData) {
    alert('Resume not loaded. Please place resume.tex in resumes/original/ directory and click "Reload Resume"');
    return;
  }
  if (!jobDescription) {
    alert('Please extract job description first');
    return;
  }

  const statusEl = document.getElementById('processStatus');
  statusEl.className = 'status info';
  statusEl.textContent = 'Processing...';

  try {
    const backendUrl = document.getElementById('backendUrl').value;
    
    statusEl.textContent = 'Processing job description and optimizing resume...';
    const combinedResponse = await fetch(`${backendUrl}/process-and-rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_description: jobDescription,
        resume: resumeData,
        resume_format: resumeFormat,
        skip_validation: false
      })
    });
    
    if (!combinedResponse.ok) {
      console.log('Combined endpoint failed, falling back to two-step process...');
      
      statusEl.textContent = 'Parsing job description...';
      const parseResponse = await fetch(`${backendUrl}/parse-jd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_description: jobDescription })
      });
      
      if (!parseResponse.ok) {
        const errorData = await parseResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || `Parse failed: ${parseResponse.statusText || parseResponse.status}`);
      }
      
      const parsedJD = await parseResponse.json();
      
      statusEl.textContent = 'Rewriting resume...';
      const rewriteResponse = await fetch(`${backendUrl}/rewrite-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: resumeData,
          parsed_jd: parsedJD,
          resume_format: resumeFormat
        })
      });
      
      if (!rewriteResponse.ok) {
        const errorData = await rewriteResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || `Rewrite failed: ${rewriteResponse.statusText}`);
      }
      
      var result = await rewriteResponse.json();
    } else {
      var result = await combinedResponse.json();
    }
    rewrittenResume = result.rewritten_resume;
    resumeFormat = result.resume_format || resumeFormat;
    
    saveState();
    
    chrome.storage.local.set({ 
      rewrittenResume: rewrittenResume,
      resumeFormat: resumeFormat
    });
    
    const latexSection = document.getElementById('latexSection');
    if (resumeFormat === 'latex') {
      latexSection.style.display = 'block';
    }
    
    statusEl.className = 'status success';
    
    let validationMsg = '';
    if (result.validation_passed) {
      validationMsg = '✓ Validation passed';
    } else {
      const changes = result.changes_made || [];
      const warnings = changes.filter(c => c.includes('WARNING'));
      const errors = changes.filter(c => c.includes('ERROR'));
      
      if (errors.length > 0) {
        validationMsg = `⚠ ${errors.length} error(s) detected`;
        console.warn('Validation errors:', errors);
      } else if (warnings.length > 0) {
        validationMsg = `⚠ ${warnings.length} warning(s)`;
        console.warn('Validation warnings:', warnings);
      } else {
        validationMsg = '⚠ Validation warnings';
      }
      
      console.log('Validation details:', {
        passed: result.validation_passed,
        changes: result.changes_made,
        warnings: warnings,
        errors: errors
      });
    }
    
    statusEl.textContent = `Resume rewritten successfully! ${validationMsg}. Ready for autofill.`;
    
    if (result.changes_made && result.changes_made.length > 0) {
      const details = result.changes_made.join('; ');
      statusEl.title = details;
      console.log('Validation details:', details);
    }
    
    chrome.storage.local.set({ 
      rewrittenResume: rewrittenResume,
      resumeFormat: resumeFormat,
      lastOptimizedResume: rewrittenResume,
      lastOptimizedFormat: resumeFormat
    });
  } catch (error) {
    statusEl.className = 'status error';
    statusEl.textContent = `Error: ${error.message}`;
    console.error('Process error:', error);
  }
});

// View LaTeX code in modal
document.getElementById('viewLaTeX').addEventListener('click', () => {
  if (!rewrittenResume || resumeFormat !== 'latex') {
    alert('No LaTeX resume available. Please process a LaTeX resume first.');
    return;
  }

  const modal = document.getElementById('latexModal');
  const preview = document.getElementById('latexPreview');
  preview.value = rewrittenResume;
  modal.style.display = 'block';
});

// Close modal
document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('latexModal').style.display = 'none';
});

document.getElementById('latexModal').addEventListener('click', (e) => {
  if (e.target.id === 'latexModal') {
    document.getElementById('latexModal').style.display = 'none';
  }
});

// Copy LaTeX to clipboard
document.getElementById('copyLaTeX').addEventListener('click', async () => {
  const preview = document.getElementById('latexPreview');
  try {
    await navigator.clipboard.writeText(preview.value);
    const btn = document.getElementById('copyLaTeX');
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

// Download from modal
document.getElementById('downloadFromModal').addEventListener('click', () => {
  const preview = document.getElementById('latexPreview');
  const blob = new Blob([preview.value], { type: 'text/plain' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resume_optimized_${new Date().toISOString().split('T')[0]}.tex`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
  
  const btn = document.getElementById('downloadFromModal');
  const originalText = btn.textContent;
  btn.textContent = 'Downloaded!';
  setTimeout(() => {
    btn.textContent = originalText;
  }, 2000);
});

// Download LaTeX code
document.getElementById('downloadLaTeX').addEventListener('click', () => {
  if (!rewrittenResume || resumeFormat !== 'latex') {
    alert('No LaTeX resume available. Please process a LaTeX resume first.');
    return;
  }

  const blob = new Blob([rewrittenResume], { type: 'text/plain' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resume_optimized_${new Date().toISOString().split('T')[0]}.tex`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
  
  const statusEl = document.getElementById('pdfStatus');
  statusEl.className = 'status success';
  statusEl.textContent = 'LaTeX code downloaded!';
});

// Convert LaTeX to PDF
document.getElementById('convertToPDF').addEventListener('click', async () => {
  if (!rewrittenResume || resumeFormat !== 'latex') {
    alert('No LaTeX resume available. Please process a LaTeX resume first.');
    return;
  }

  const statusEl = document.getElementById('pdfStatus');
  statusEl.className = 'status info';
  statusEl.textContent = 'Converting LaTeX to PDF...';

  try {
    const backendUrl = document.getElementById('backendUrl').value;
    const pdfResponse = await fetch(`${backendUrl}/latex-to-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex_code: rewrittenResume })
    });
    
    if (!pdfResponse.ok) {
      const errorData = await pdfResponse.json().catch(() => ({}));
      throw new Error(errorData.detail || `PDF conversion failed: ${pdfResponse.statusText}`);
    }
    
    const blob = await pdfResponse.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resume_optimized_${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    statusEl.className = 'status success';
    statusEl.textContent = 'PDF downloaded successfully!';
  } catch (error) {
    statusEl.className = 'status error';
    statusEl.textContent = `Error: ${error.message}`;
    console.error('PDF conversion error:', error);
  }
});

// Autofill application form
document.getElementById('fillForm').addEventListener('click', async () => {
  if (!rewrittenResume) {
    alert('Please process and rewrite resume first');
    return;
  }

  const statusEl = document.getElementById('fillStatus');
  statusEl.className = 'status info';
  statusEl.textContent = 'Filling form...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'fillForm',
      resume: rewrittenResume
    });
    
    if (response.success) {
      statusEl.className = 'status success';
      statusEl.textContent = 'Form filled! Please review and confirm submission.';
    } else {
      throw new Error(response.error || 'Failed to fill form');
    }
  } catch (error) {
    statusEl.className = 'status error';
    statusEl.textContent = `Error: ${error.message}`;
    console.error('Fill form error:', error);
  }
});
