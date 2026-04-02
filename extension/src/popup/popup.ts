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
    contentEl.innerHTML = '<div class="error">Not configured.<br>Click Settings to set up.</div>';
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
