// Background service worker for SanaAI Job Assistant

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('SanaAI Job Assistant installed');
  
  // Set default backend URL
  chrome.storage.sync.get(['backendUrl'], (result) => {
    if (!result.backendUrl) {
      chrome.storage.sync.set({ backendUrl: 'http://localhost:8000' });
    }
  });
});

// Handle extension icon click - toggle floating panel
chrome.action.onClicked.addListener(async (tab) => {
  // Check if we can inject scripts on this page
  // Some pages like chrome://, chrome-extension://, or file:// might not allow injection
  const url = tab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || 
      url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('file://')) {
    console.warn('Cannot inject content script on this page type:', url);
    return;
  }
  
  // Send message to content script to toggle panel
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
  } catch (error) {
    // Content script might not be ready, try injecting it
    console.log('Content script not ready, injecting...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.log('Content script injected, waiting for it to initialize...');
      // Wait a bit longer for script to initialize
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
          console.log('Panel toggle message sent successfully');
        } catch (e) {
          console.error('Failed to toggle panel after injection:', e);
          // Try one more time after longer delay
          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
            } catch (e2) {
              console.error('Final attempt failed:', e2);
            }
          }, 500);
        }
      }, 200);
    } catch (injectError) {
      console.error('Failed to inject content script:', injectError);
      if (injectError.message && injectError.message.includes('Cannot access')) {
        console.error('This page does not allow script injection. Try a regular webpage.');
      }
    }
  }
});
