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

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // TODO: Add any background processing logic here
  // For now, most logic is in content script and popup
  return true;
});
