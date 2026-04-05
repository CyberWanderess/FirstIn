import { getStats } from '../shared/api-client';
import { getConfig, isConfigured } from '../shared/storage';

const contentEl = document.getElementById('content')!;
const connEl = document.getElementById('connStatus')!;
const openAppEl = document.getElementById('openApp')!;
const openSettingsEl = document.getElementById('openSettings')!;

openSettingsEl.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

async function load() {
  const config = await getConfig();

  openAppEl.addEventListener('click', (e) => {
    e.preventDefault();
    if (config.serverUrl) {
      chrome.tabs.create({ url: config.serverUrl });
    }
  });

  if (!isConfigured(config)) {
    connEl.innerHTML = '<span class="dot dot-red"></span>';
    const savedUrl = config.serverUrl || '';
    contentEl.innerHTML = `
      <div class="login-form">
        <label for="loginUrl">Server URL</label>
        <input type="url" id="loginUrl" placeholder="http://140.82.50.93" value="${escapeHtml(savedUrl)}">
        <button class="login-btn" id="loginBtn">Login with Browser</button>
      </div>
      <div style="padding: 0 16px 12px; text-align: center;">
        <a href="#" id="manualSetup" style="font-size: 11px; color: #6b7280;">Manual token setup</a>
      </div>
    `;
    document.getElementById('loginBtn')!.addEventListener('click', () => {
      const url = (document.getElementById('loginUrl') as HTMLInputElement).value.trim().replace(/\/$/, '');
      if (!url) return;
      const extId = chrome.runtime.id;
      chrome.tabs.create({ url: `${url}/login/extension?ext=${extId}` });
    });
    document.getElementById('manualSetup')!.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    return;
  }

  const result = await getStats();

  if (!result.success) {
    connEl.innerHTML = '<span class="dot dot-red"></span>';
    contentEl.innerHTML = `<div class="error">${result.error}</div>`;
    return;
  }

  connEl.innerHTML = '<span class="dot dot-green"></span>';
  const data = result.data!;
  const counts = data.statusCounts;

  const totalActive = (counts['pending_eval'] || 0) + (counts['flagged'] || 0) +
    (counts['pending_deep_analysis'] || 0) + (counts['ready_to_apply'] || 0) +
    (counts['ready_to_apply_tailored'] || 0);

  contentEl.innerHTML = `
    <div class="stats">
      <div class="stat">
        <div class="stat-num">${totalActive}</div>
        <div class="stat-label">In Pipeline</div>
      </div>
      <div class="stat">
        <div class="stat-num">${counts['applied'] || 0}</div>
        <div class="stat-label">Applied</div>
      </div>
      <div class="stat">
        <div class="stat-num">${counts['interviewing'] || 0}</div>
        <div class="stat-label">Interviewing</div>
      </div>
      <div class="stat">
        <div class="stat-num">${counts['rejected'] || 0}</div>
        <div class="stat-label">Rejected</div>
      </div>
    </div>
    <div class="recent">
      <h3>Recently Saved</h3>
      ${data.recentJobs.map(j => `
        <div class="job">
          <div class="job-title">${escapeHtml(j.title)}</div>
          <div class="job-meta">${escapeHtml(j.company_name)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

load();
