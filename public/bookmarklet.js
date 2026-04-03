/**
 * FirstIn Bookmarklet — run on hiring.cafe to fetch jobs and import to local server.
 *
 * Usage: create a bookmark with URL:
 *   javascript:void(fetch('http://localhost:3000/bookmarklet.js').then(r=>r.text()).then(eval))
 *
 * Or paste this file's content directly in the browser console while on hiring.cafe.
 */
(async function firstInCrawl() {
  const SERVER = window.__FIRSTIN || 'http://localhost:3000';
  const SEARCH_PARAMS = { dateFetchedPastNDays: 2 };
  const PAGE_SIZE = 40;

  // UI overlay
  const overlay = document.createElement('div');
  overlay.id = 'firstin-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
  const box = document.createElement('div');
  box.style.cssText = 'background:#1a1a2e;color:#e0e0e0;padding:32px;border-radius:12px;max-width:420px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.5)';
  box.innerHTML = '<h2 style="margin:0 0 16px;color:#4fc3f7">FirstIn</h2><div id="firstin-status">Initializing...</div><div id="firstin-progress" style="margin-top:12px;font-size:13px;color:#888"></div>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const statusEl = document.getElementById('firstin-status');
  const progressEl = document.getElementById('firstin-progress');

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }
  function setProgress(msg) { if (progressEl) progressEl.textContent = msg; }

  function cleanup() {
    setTimeout(() => {
      const el = document.getElementById('firstin-overlay');
      if (el) el.remove();
    }, 5000);
  }

  try {
    // Step 1: Fetch search configs from server (to get user's query params)
    let searchParams = SEARCH_PARAMS;
    try {
      const configResp = await fetch(SERVER + '/api/search-configs?enabled=true');
      if (configResp.ok) {
        const configData = await configResp.json();
        if (configData.data && configData.data.length > 0) {
          // Merge all enabled configs' query params with dateFetchedPastNDays
          const firstConfig = configData.data[0];
          searchParams = { ...firstConfig.query_params, dateFetchedPastNDays: 2 };
          setProgress('Using search config: ' + firstConfig.name);
        }
      }
    } catch {
      setProgress('Using default search params');
    }

    // Step 2: Fetch jobs from hiring.cafe API
    setStatus('Fetching jobs...');
    const searchStateB64 = btoa(JSON.stringify(searchParams));
    const allJobs = [];
    let page = 0;
    let totalPages = 1;
    let totalResults = 0;

    while (page < totalPages && page < 50) {
      const url = '/api/search-jobs?s=' + encodeURIComponent(searchStateB64) + '&size=' + PAGE_SIZE + '&page=' + page;
      setProgress('Page ' + (page + 1) + '/' + totalPages + ' (' + allJobs.length + ' jobs)');

      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error('API returned ' + resp.status + '. Make sure you passed Cloudflare first.');
      }

      const data = await resp.json();
      const results = data.results || data.hits || [];
      allJobs.push(...results);

      if (page === 0) {
        totalResults = data.totalResults || data.nbHits || data.total || 0;
        totalPages = Math.ceil(totalResults / PAGE_SIZE);
        setProgress('Total: ' + totalResults + ' results, ' + totalPages + ' pages');
      }

      if (results.length === 0) break;
      page++;

      // Small delay between pages
      if (page < totalPages) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setStatus('Fetched ' + allJobs.length + ' jobs. Importing...');

    // Step 3: Send to local server
    const importResp = await fetch(SERVER + '/api/crawl/import-raw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs: allJobs }),
    });

    if (!importResp.ok) {
      const errText = await importResp.text();
      throw new Error('Import failed: ' + errText.substring(0, 200));
    }

    const importData = await importResp.json();
    const d = importData.data;

    setStatus('Done!');
    setProgress(
      'Received: ' + d.received +
      ' | New: ' + d.newAfterDedup +
      ' | Imported: ' + d.imported +
      ' | Filtered: ' + d.filtered +
      (d.failed > 0 ? ' | Failed: ' + d.failed : '')
    );
    box.innerHTML += '<div style="margin-top:16px;font-size:12px;color:#666">Window closes in 5s</div>';
    cleanup();
  } catch (err) {
    setStatus('Error');
    setProgress(err.message);
    box.innerHTML += '<button onclick="document.getElementById(\'firstin-overlay\').remove()" style="margin-top:16px;padding:8px 16px;background:#e74c3c;color:white;border:none;border-radius:6px;cursor:pointer">Close</button>';
  }
})();
