import { getConfig, setConfig } from '../shared/storage';

const serverUrlEl = document.getElementById('serverUrl') as HTMLInputElement;
const apiTokenEl = document.getElementById('apiToken') as HTMLInputElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;
const testBtn = document.getElementById('test') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;

// Load existing config
getConfig().then(config => {
  serverUrlEl.value = config.serverUrl;
  apiTokenEl.value = config.apiToken;
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
