// Background service worker for FirstIn extension
// Proxies API requests from content scripts to bypass CORS

import { getConfig, setConfig, isConfigured } from '../shared/storage';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// Listen for auth token from the extension login callback page
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'auth-token' && message.token && sender.url) {
    const serverUrl = new URL(sender.url).origin;
    setConfig({ serverUrl, apiToken: message.token }).then(() => {
      sendResponse({ ok: true });
    });
    return true; // async
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

  if (res.status === 401) {
    await setConfig({ apiToken: '' });
    return { success: false, error: 'Session expired. Please log in again.' };
  }

  return await res.json();
}
