# Indeed Adapter — Dev Notes & Gotchas

Documented 2026-04-07. Reference if resuming Indeed work.

---

## DOM Structure

### Job cards (search results)
- Container: `[class*="tapItem"]` — NOT `li[data-jk]` (LinkedIn-style assumption was wrong)
- `data-jk` is on the **inner `a` link**, not the container div
  - Correct: `card.querySelector('a[data-jk]').getAttribute('data-jk')`
  - Wrong: `card.getAttribute('data-jk')` → always null
- Company: `[data-testid="company-name"]`
- Location: `[data-testid="text-location"]`
- Job results list: `[id*="jobResults"]`

### Job detail (right panel / viewjob)
- Title: `[data-testid="jobsearch-JobInfoHeader-title"]`
  - ⚠️ Has a child element with text " - job post" / " - job ad"
  - Use `firstChild.nodeValue` not `textContent` to avoid sub-element text
  - Or strip with regex: `/\s*-\s*(job post|job ad|job listing)\s*$/i`
- Company location: `[data-testid="inlineHeader-companyLocation"]`
  - NOT `[data-testid="job-location"]` — that doesn't exist
- Salary chips: `[data-testid="attribute_snippet_testid"]`
  - ⚠️ Returns MULTIPLE chips (e.g. "Holidays", salary, work schedule)
  - Must iterate ALL chips and try to parse each as salary — not just `querySelector` (first match)
  - `$80K` notation used (not `$80,000`) — parser must handle K/M suffixes
  - ⚠️ Hourly rates appear as salary chips too — add sanity check: if parsed min < 1000, treat as hourly and discard

### `window._initialData`
- Present on page load, contains first job's data
- ⚠️ **Static** — does NOT update when clicking different job cards in search SPA
- Key path for search: `autoOpenTwoPaneViewjobResponse.body.hostQueryExecutionResult.data.jobData.results[0].job`
  - `.job.key` = source_id (jobKey)
  - `.job.title`
  - `.job.sourceEmployerName`
  - `.job.datePublished` = Unix milliseconds
  - `.job.description.html` = full JD HTML
- Validate: check `_initialData.autoOpenJobAttributes.jobKey` against current URL `?vjk=` param before using; if mismatch, fall back to DOM

---

## SPA Navigation (search results page)

- URL param `vjk` changes (via pushState/replaceState) when clicking a job card
- `history.pushState` interception was unreliable — Indeed's router may bypass it
- ✅ Solution: `setInterval` polling every 300ms, compare `vjk` vs `currentJobKey`
- `waitForElement('#jobDescriptionText')` on search page returns STALE element immediately (old card's DOM still present)
  - ✅ Solution: use fixed `sleep(800)` instead, to let React swap the panel

---

## Anti-Bot / Rate Limiting

- Programmatically clicking multiple cards in sequence (`link.click()` in a loop) triggers Indeed's anti-bot ("We can't find this page" error)
- Manual user navigation (clicking cards normally) is fine — human timing, natural intervals
- ✅ Solution for batch save: do NOT enrich JDs by clicking cards
  - Batch save uses card-level data only (title, company, location, jobKey from card DOM)
  - No right-panel loading, no `link.click()` calls
  - Users who want full JD can open viewjob page and use the single-job save button
- Alternative (not implemented): `fetch('https://www.indeed.com/viewjob?jk=...')` for HTML parsing — avoids UI clicks but may still hit rate limits

---

## Dedup Behavior

- Indeed jobs may already exist in DB from LinkedIn import (same company/title, different source)
- Cross-source dedup works correctly via title+company matching — "already exists" is correct behavior, not a bug
- `job_source_ids` table tracks multiple source IDs per job after cross-source merges
