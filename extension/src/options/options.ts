import { getConfig, setConfig, isConfigured } from '../shared/storage';

const serverUrlEl = document.getElementById('serverUrl') as HTMLInputElement;
const apiTokenEl = document.getElementById('apiToken') as HTMLInputElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;
const testBtn = document.getElementById('test') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const loginBrowserBtn = document.getElementById('loginBrowser') as HTMLButtonElement;
const loginStatusEl = document.getElementById('loginStatus') as HTMLSpanElement;

// Load existing config
getConfig().then(config => {
  serverUrlEl.value = config.serverUrl;
  apiTokenEl.value = config.apiToken;
});

// Login with browser
loginBrowserBtn.addEventListener('click', () => {
  const url = serverUrlEl.value.trim().replace(/\/$/, '');
  if (!url) {
    loginStatusEl.textContent = 'Enter Server URL first';
    loginStatusEl.className = 'status status-err';
    return;
  }
  const extId = chrome.runtime.id;
  chrome.tabs.create({ url: `${url}/login/extension?ext=${extId}` });
  loginStatusEl.textContent = 'Login page opened...';
  loginStatusEl.className = 'status status-ok';
});

// Auto-update fields when config changes (e.g., after browser login)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.serverUrl?.newValue) serverUrlEl.value = changes.serverUrl.newValue;
  if (changes.apiToken?.newValue) {
    apiTokenEl.value = changes.apiToken.newValue;
    loginStatusEl.textContent = 'Connected!';
    loginStatusEl.className = 'status status-ok';
  }
});

saveBtn.addEventListener('click', async () => {
  await setConfig({
    serverUrl: serverUrlEl.value.trim().replace(/\/$/, ''),
    apiToken: apiTokenEl.value.trim(),
  });
  showStatus('Saved!', 'ok');
});

testBtn.addEventListener('click', async () => {
  const url = serverUrlEl.value.trim().replace(/\/$/, '');
  const token = apiTokenEl.value.trim();

  if (!url || !token) {
    showStatus('Fill in both fields first', 'err');
    return;
  }

  showStatus('Testing...', 'ok');

  try {
    const res = await fetch(`${url}/api/extension/stats`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const json = await res.json();

    if (json.success) {
      const total = Object.values(json.data.statusCounts as Record<string, number>).reduce((a, b) => a + b, 0);
      showStatus(`Connected! ${total} jobs in pipeline.`, 'ok');
    } else {
      showStatus(`Error: ${json.error}`, 'err');
    }
  } catch (e) {
    showStatus(`Connection failed: ${(e as Error).message}`, 'err');
  }
});

function showStatus(msg: string, type: 'ok' | 'err') {
  statusEl.textContent = msg;
  statusEl.className = `status status-${type}`;
}
