// Popup script for SanaAI Job Assistant

let resumeData = null;
let jobDescription = null;
let rewrittenResume = null;
let resumeFormat = 'text'; // 'text' or 'latex'
let isLaTeX = false;

// Load saved backend URL and resume
chrome.storage.local.get(['backendUrl', 'savedResume', 'savedResumeFormat'], async (result) => {
  const backendUrl = result.backendUrl || 'http://localhost:8000';
  if (result.backendUrl) {
    document.getElementById('backendUrl').value = result.backendUrl;
  }
  
  // Try to load original resume from backend first
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
      
      statusEl.className = 'status success';
      const folderInfo = data.folder ? ` from ${data.folder}/` : '';
      statusEl.textContent = `Original resume loaded: ${data.filename}${folderInfo} (${resumeFormat.toUpperCase()})`;
      
      // Show/hide LaTeX section
      const latexSection = document.getElementById('latexSection');
      if (isLaTeX) {
        latexSection.style.display = 'block';
      }
    } else {
      // Fallback to saved resume if original not found
      if (result.savedResume) {
        resumeData = result.savedResume;
        resumeFormat = result.savedResumeFormat || 'text';
        isLaTeX = resumeFormat === 'latex';
        
        statusEl.className = 'status info';
        statusEl.textContent = `Using saved resume (${resumeFormat.toUpperCase()}). Place resume in resumes/original/ for auto-load.`;
        
        const latexSection = document.getElementById('latexSection');
        if (isLaTeX) {
          latexSection.style.display = 'block';
        }
      } else {
        statusEl.className = 'status error';
        statusEl.textContent = 'No resume found. Please place resume.tex in resumes/original/ directory.';
      }
    }
  } catch (error) {
    // Fallback to saved resume
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
      statusEl.textContent = 'Could not load resume. Check backend connection and resumes/original/ directory.';
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

// Resume is automatically loaded from resumes/original/ directory via backend
// Removed file upload - resume is auto-loaded on extension open
/*
document.getElementById('resumeFile').addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const statusEl = document.getElementById('resumeStatus');
  statusEl.className = 'status info';
  statusEl.textContent = 'Reading resume...';

  try {
    // Find the main .tex file (prioritize files named resume.tex, main.tex, or the first .tex file)
    let mainTexFile = null;
    const texFiles = Array.from(files).filter(f => f.name.endsWith('.tex'));
    
    if (texFiles.length === 0) {
      // If no .tex files, try to read the first file
      mainTexFile = files[0];
    } else {
      // Prefer resume.tex or main.tex, otherwise use first .tex file
      mainTexFile = texFiles.find(f => 
        f.name.toLowerCase() === 'resume.tex' || 
        f.name.toLowerCase() === 'main.tex'
      ) || texFiles[0];
    }

    if (!mainTexFile) {
      throw new Error('No .tex file found. Please select a folder containing your LaTeX resume.');
    }

    const text = await mainTexFile.text();
    resumeData = text;
    
    // Detect LaTeX format
    isLaTeX = mainTexFile.name.endsWith('.tex') || 
              text.includes('\\documentclass') || 
              text.includes('\\begin{document}');
    
    resumeFormat = isLaTeX ? 'latex' : 'text';
    
    // Show/hide LaTeX to PDF button
    const latexSection = document.getElementById('latexSection');
    if (isLaTeX) {
      latexSection.style.display = 'block';
    } else {
      latexSection.style.display = 'none';
    }
    
    // Save resume to Chrome storage for future use
    chrome.storage.local.set({
      savedResume: resumeData,
      savedResumeFormat: resumeFormat,
      mainTexFileName: mainTexFile.name
    });
    
    const fileCount = files.length > 1 ? ` (${files.length} files in folder)` : '';
    statusEl.className = 'status success';
    statusEl.textContent = `Resume loaded: ${mainTexFile.name}${fileCount} (${resumeFormat.toUpperCase()})`;
    
    if (files.length > 1) {
      statusEl.textContent += `\nNote: Only ${mainTexFile.name} will be optimized. Copy optimized file back to your folder structure.`;
    }
  } catch (error) {
    statusEl.className = 'status error';
    statusEl.textContent = `Error: ${error.message}`;
    console.error('Resume read error:', error);
  }
});
*/

// Extract job description from current page
document.getElementById('extractJD').addEventListener('click', async () => {
  const statusEl = document.getElementById('jdStatus');
  statusEl.className = 'status info';
  statusEl.textContent = 'Extracting job description...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractJD' });
    
    if (response.success) {
      jobDescription = response.jdText;
      statusEl.className = 'status success';
      statusEl.textContent = `Extracted ${jobDescription.length} characters`;
    } else {
      throw new Error(response.error || 'Failed to extract JD');
    }
  } catch (error) {
    statusEl.className = 'status error';
    statusEl.textContent = `Error: ${error.message}`;
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
    
    // Step 1: Parse JD
    statusEl.textContent = 'Parsing job description...';
    const parseResponse = await fetch(`${backendUrl}/parse-jd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_description: jobDescription })
    });
    
    if (!parseResponse.ok) {
      throw new Error(`Parse failed: ${parseResponse.statusText}`);
    }
    
    const parsedJD = await parseResponse.json();
    
    // Step 2: Rewrite resume
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
    
    const result = await rewriteResponse.json();
    rewrittenResume = result.rewritten_resume;
    resumeFormat = result.resume_format || resumeFormat;
    
    // Store in background for form filling
    chrome.storage.local.set({ 
      rewrittenResume: rewrittenResume,
      resumeFormat: resumeFormat
    });
    
    // Show/hide LaTeX to PDF button based on output format
    const latexSection = document.getElementById('latexSection');
    if (resumeFormat === 'latex') {
      latexSection.style.display = 'block';
    }
    
    statusEl.className = 'status success';
    const validationMsg = result.validation_passed ? '✓ Validation passed' : '⚠ Validation warnings';
    statusEl.textContent = `Resume rewritten successfully! ${validationMsg}. Ready for autofill.`;
    
    // Store rewritten resume for download
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
    
    // Download the PDF
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
