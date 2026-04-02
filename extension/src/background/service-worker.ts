// Background service worker for FirstIn extension
// Proxies API requests from content scripts to bypass CORS

import { getConfig, isConfigured } from '../shared/storage';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// Handle API proxy requests from content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'api-request') {
    handleApiRequest(message.method, message.path, message.body)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: `Network error: ${err.message}` }));
    return true; // keep message channel open for async response
  }
});

async function handleApiRequest(method: string, path: string, body?: unknown) {
  const config = await getConfig();
  if (!isConfigured(config)) {
    return { success: false, error: 'Extension not configured. Set server URL and API token in options.' };
  }

  const baseUrl = config.serverUrl.replace(/\/$/, '').replace(/[^\x20-\x7E]/g, '');
  const token = config.apiToken.replace(/[^\x20-\x7E]/g, '');
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return await res.json();
}
