#!/usr/bin/env npx tsx
/**
 * Email Job Alert Importer
 *
 * Connects to Gmail via IMAP, parses LinkedIn and Indeed job alert emails,
 * extracts job listings, and outputs JSON compatible with /api/import/json.
 *
 * Prerequisites:
 *   1. Set up LinkedIn/Indeed daily job alerts to your Gmail
 *   2. Generate a Google App Password: Google Account → Security → App Passwords
 *   3. Set env vars: GMAIL_USER, GMAIL_APP_PASSWORD
 *
 * Usage:
 *   npx tsx scripts/import-email-alerts.ts                    # parse unread alerts, output JSON
 *   npx tsx scripts/import-email-alerts.ts --days 7           # look back 7 days
 *   npx tsx scripts/import-email-alerts.ts --dry-run          # don't mark emails as read
 *   npx tsx scripts/import-email-alerts.ts --import           # POST to local import API
 *   npx tsx scripts/import-email-alerts.ts --include-read     # also process already-read emails
 */

import Imap from 'imap';
import { simpleParser, type ParsedMail } from 'mailparser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractedJob {
  title: string;
  company_name: string;
  location: string[];
  source: string;
  source_id: string;
  jd_url: string | null;
  apply_url: string | null;
  salary_min: number | null;
  salary_max: number | null;
  work_mode: string | null;
  commitment: string | null;
  jd_full_text: string | null;
  notes: string | null;
}

interface EmailMessage {
  uid: number;
  parsed: ParsedMail;
}

// ---------------------------------------------------------------------------
// Logging (stderr so JSON goes to stdout)
// ---------------------------------------------------------------------------

function log(msg: string) {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  let days = 3;
  let dryRun = false;
  let doImport = false;
  let includeRead = false;
  let importUrl = 'http://localhost:3000/api/import/json';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--days':
        days = parseInt(args[++i], 10) || 3;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--import':
        doImport = true;
        break;
      case '--include-read':
        includeRead = true;
        break;
      case '--import-url':
        importUrl = args[++i];
        break;
    }
  }

  return { days, dryRun, doImport, includeRead, importUrl };
}

// ---------------------------------------------------------------------------
// IMAP helpers
// ---------------------------------------------------------------------------

function connectImap(user: string, password: string): Promise<Imap> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user,
      password,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: true },
    });

    imap.once('ready', () => resolve(imap));
    imap.once('error', (err: Error) => reject(err));
    imap.connect();
  });
}

function openInbox(imap: Imap): Promise<Imap.Box> {
  return new Promise((resolve, reject) => {
    imap.openBox('INBOX', false, (err, box) => {
      if (err) reject(err);
      else resolve(box);
    });
  });
}

function imapSearch(imap: Imap, criteria: any[]): Promise<number[]> {
  return new Promise((resolve, reject) => {
    imap.search(criteria, (err, uids) => {
      if (err) reject(err);
      else resolve(uids || []);
    });
  });
}

function fetchMessages(imap: Imap, uids: number[]): Promise<EmailMessage[]> {
  if (uids.length === 0) return Promise.resolve([]);

  return new Promise((resolve, reject) => {
    const messages: EmailMessage[] = [];
    const fetch = imap.fetch(uids, { bodies: '', struct: true });

    fetch.on('message', (msg, seqno) => {
      let uid = 0;
      let buffer = '';

      msg.on('attributes', (attrs) => {
        uid = attrs.uid;
      });

      msg.on('body', (stream) => {
        stream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
        });
      });

      msg.once('end', () => {
        simpleParser(buffer)
          .then((parsed) => {
            messages.push({ uid, parsed });
          })
          .catch((err) => {
            log(`  Warning: failed to parse message #${seqno}: ${err.message}`);
          });
      });
    });

    fetch.once('error', reject);
    fetch.once('end', () => {
      // Wait a bit for async simpleParser calls to complete
      setTimeout(() => resolve(messages), 500);
    });
  });
}

function markAsRead(imap: Imap, uids: number[]): Promise<void> {
  if (uids.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    imap.addFlags(uids, ['\\Seen'], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// LinkedIn email parser
// ---------------------------------------------------------------------------

function parseLinkedInEmail(mail: ParsedMail): ExtractedJob[] {
  const jobs: ExtractedJob[] = [];

  // Use plain text body (more reliable than HTML for LinkedIn alerts)
  const text = mail.text || '';
  if (!text) return jobs;

  const lines = text.split('\n').map((l) => l.trim());

  // Find all LinkedIn job URLs and extract surrounding context
  const jobUrlPattern = /https:\/\/www\.linkedin\.com\/comm\/jobs\/view\/(\d+)/g;
  let match: RegExpExecArray | null;

  while ((match = jobUrlPattern.exec(text)) !== null) {
    const jobId = match[1];
    const urlIndex = match.index;

    // Find which line this URL is on
    let charCount = 0;
    let urlLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      // +1 for the \n
      charCount += lines[i].length + 1;
      if (charCount > urlIndex) {
        urlLineIdx = i;
        break;
      }
    }

    if (urlLineIdx < 0) continue;

    // LinkedIn plain text format:
    //   Job Title
    //   Company · Location
    //   https://www.linkedin.com/comm/jobs/view/...
    // OR sometimes:
    //   Job Title
    //   Company
    //   Location
    //   https://...

    // Look backwards from URL line for title and company info
    let title = '';
    let company = '';
    let location: string[] = [];

    // Try the 2-line format first (Title / Company · Location)
    if (urlLineIdx >= 2) {
      const companyLine = lines[urlLineIdx - 1];
      const titleLine = lines[urlLineIdx - 2];

      if (companyLine && titleLine && !titleLine.startsWith('http')) {
        // Check for "Company · Location" pattern
        if (companyLine.includes(' · ')) {
          const parts = companyLine.split(' · ');
          company = parts[0].trim();
          location = parts
            .slice(1)
            .map((l) => l.trim())
            .filter(Boolean);
          title = titleLine;
        } else if (companyLine && !companyLine.startsWith('http')) {
          // Might be just company name, try going back further
          company = companyLine;
          title = titleLine;
        }
      }
    }

    // Fallback: try 1 line before (sometimes title is on the URL line itself)
    if (!title && urlLineIdx >= 1) {
      const prevLine = lines[urlLineIdx - 1];
      if (prevLine && !prevLine.startsWith('http')) {
        title = prevLine;
      }
    }

    // Clean up title (remove common prefixes)
    title = title
      .replace(/^\d+\.\s*/, '')
      .replace(/^•\s*/, '')
      .trim();

    // Skip if no meaningful title
    if (!title || title.length < 3) continue;

    // Deduplicate by jobId (same job might appear multiple times in email)
    if (jobs.some((j) => j.source_id === `li-${jobId}`)) continue;

    jobs.push({
      title,
      company_name: company || 'Unknown',
      location,
      source: 'linkedin',
      source_id: `li-${jobId}`,
      jd_url: `https://www.linkedin.com/jobs/view/${jobId}`,
      apply_url: null,
      salary_min: null,
      salary_max: null,
      work_mode: null,
      commitment: null,
      jd_full_text: null,
      notes: null,
    });
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// Indeed email parser
// ---------------------------------------------------------------------------

function parseIndeedEmail(mail: ParsedMail): ExtractedJob[] {
  const jobs: ExtractedJob[] = [];

  // Indeed emails are better parsed from HTML
  const html = mail.html || '';
  const text = mail.text || '';

  if (!html && !text) return jobs;

  // Extract Indeed job URLs from HTML
  // Pattern: https://www.indeed.com/viewjob?jk=HEXID or /rc/clk?jk=HEXID
  const urlPatterns = [
    /https?:\/\/www\.indeed\.com\/viewjob\?jk=([a-f0-9]+)/gi,
    /https?:\/\/www\.indeed\.com\/rc\/clk\?jk=([a-f0-9]+)/gi,
    /https?:\/\/(?:[\w.]+\.)?indeed\.com\/[^\s"']*?jk=([a-f0-9]+)/gi,
  ];

  const seenIds = new Set<string>();
  const jobEntries: { id: string; url: string }[] = [];

  const source = html || text;
  for (const pattern of urlPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const jobId = match[1];
      if (!seenIds.has(jobId)) {
        seenIds.add(jobId);
        jobEntries.push({
          id: jobId,
          url: `https://www.indeed.com/viewjob?jk=${jobId}`,
        });
      }
    }
  }

  if (jobEntries.length === 0) return jobs;

  // Try to extract titles and companies from HTML structure
  // Indeed emails typically have job cards with title and company info
  // We'll use regex on HTML to extract text near job links
  for (const entry of jobEntries) {
    let title = '';
    let company = '';
    let location: string[] = [];

    // Try to find the job card context in HTML
    if (html) {
      // Look for text content near the job link
      const escapedId = entry.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cardPattern = new RegExp(
        `([^<]{3,80})<[^>]*href="[^"]*jk=${escapedId}[^"]*"[^>]*>([^<]*)<`,
        'i'
      );
      const cardMatch = cardPattern.exec(html);
      if (cardMatch) {
        // The link text is often the job title
        title = cardMatch[2].trim();
      }

      // Alternative: find title in a broader context
      if (!title) {
        const broadPattern = new RegExp(
          `jk=${escapedId}[^>]*>\\s*([^<]+)<`,
          'i'
        );
        const broadMatch = broadPattern.exec(html);
        if (broadMatch) {
          title = broadMatch[1].trim();
        }
      }
    }

    // Fallback: try plain text
    if (!title && text) {
      // Indeed plain text usually has: "Job Title\nCompany\nLocation"
      const lines = text.split('\n').map((l) => l.trim());
      const idIdx = lines.findIndex((l) => l.includes(entry.id));
      if (idIdx >= 1) {
        title = lines[idIdx - 1];
      }
    }

    // Clean up HTML entities
    title = title
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();

    if (!title || title.length < 3) {
      title = '(Unknown Title from Indeed)';
    }

    jobs.push({
      title,
      company_name: company || 'Unknown',
      location,
      source: 'indeed',
      source_id: `indeed-${entry.id}`,
      jd_url: entry.url,
      apply_url: null,
      salary_min: null,
      salary_max: null,
      work_mode: null,
      commitment: null,
      jd_full_text: null,
      notes: null,
    });
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// Email source detection
// ---------------------------------------------------------------------------

function detectSource(mail: ParsedMail): 'linkedin' | 'indeed' | 'unknown' {
  const from = (mail.from?.text || '').toLowerCase();

  if (from.includes('linkedin.com') || from.includes('jobs-noreply@linkedin')) {
    return 'linkedin';
  }
  if (from.includes('indeed.com') || from.includes('alert@indeed')) {
    return 'indeed';
  }

  // Check subject as fallback
  const subject = (mail.subject || '').toLowerCase();
  if (subject.includes('linkedin')) return 'linkedin';
  if (subject.includes('indeed')) return 'indeed';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { days, dryRun, doImport, includeRead, importUrl } = parseArgs();

  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPassword) {
    log('ERROR: Set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.');
    log('  Generate an App Password: Google Account → Security → App Passwords');
    process.exit(1);
  }

  log('=== Email Job Alert Importer ===');
  log(`Gmail user: ${gmailUser}`);
  log(`Look back: ${days} days`);
  log(`Dry run: ${dryRun}`);
  log(`Include read: ${includeRead}`);

  // Connect to Gmail
  log('Connecting to Gmail IMAP...');
  const imap = await connectImap(gmailUser, gmailPassword);

  try {
    await openInbox(imap);
    log('Inbox opened.');

    // Build date for SINCE criteria
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const dateStr = sinceDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // Search for LinkedIn alert emails
    const readFlag = includeRead ? [] : ['UNSEEN'];
    log('Searching for LinkedIn job alert emails...');
    const linkedinUids = await imapSearch(imap, [
      ...readFlag,
      ['SINCE', dateStr],
      ['FROM', 'jobs-noreply@linkedin.com'],
    ]);
    log(`  Found ${linkedinUids.length} LinkedIn alert email(s).`);

    // Search for Indeed alert emails
    log('Searching for Indeed job alert emails...');
    const indeedUids = await imapSearch(imap, [
      ...readFlag,
      ['SINCE', dateStr],
      ['FROM', 'alert@indeed.com'],
    ]);
    log(`  Found ${indeedUids.length} Indeed alert email(s).`);

    const allUids = [...linkedinUids, ...indeedUids];

    if (allUids.length === 0) {
      log('No new job alert emails found.');
      console.log(JSON.stringify({ jobs: [] }, null, 2));
      imap.end();
      return;
    }

    // Fetch and parse emails
    log(`Fetching ${allUids.length} email(s)...`);
    const messages = await fetchMessages(imap, allUids);
    log(`  Parsed ${messages.length} email(s).`);

    // Extract jobs from each email
    const allJobs: ExtractedJob[] = [];
    const seenSourceIds = new Set<string>();

    for (const msg of messages) {
      const source = detectSource(msg.parsed);
      const subject = msg.parsed.subject || '(no subject)';

      let emailJobs: ExtractedJob[] = [];
      if (source === 'linkedin') {
        emailJobs = parseLinkedInEmail(msg.parsed);
      } else if (source === 'indeed') {
        emailJobs = parseIndeedEmail(msg.parsed);
      } else {
        log(`  Skipping unknown source email: ${subject}`);
        continue;
      }

      // Deduplicate across emails
      let newCount = 0;
      for (const job of emailJobs) {
        if (!seenSourceIds.has(job.source_id)) {
          seenSourceIds.add(job.source_id);
          allJobs.push(job);
          newCount++;
        }
      }

      log(`  [${source}] "${subject}" → ${emailJobs.length} jobs (${newCount} new)`);
    }

    log('');
    log(`=== RESULTS ===`);
    log(`Total emails processed: ${messages.length}`);
    log(`LinkedIn emails: ${linkedinUids.length}`);
    log(`Indeed emails: ${indeedUids.length}`);
    log(`Total unique jobs extracted: ${allJobs.length}`);
    log(`  From LinkedIn: ${allJobs.filter((j) => j.source === 'linkedin').length}`);
    log(`  From Indeed: ${allJobs.filter((j) => j.source === 'indeed').length}`);

    // Output JSON
    const output = { jobs: allJobs };
    console.log(JSON.stringify(output, null, 2));

    // Mark emails as read (unless dry run)
    if (!dryRun && allUids.length > 0) {
      log('Marking emails as read...');
      await markAsRead(imap, allUids);
      log('  Done.');
    }

    // Optionally call import API
    if (doImport && allJobs.length > 0) {
      log(`Calling import API at ${importUrl}...`);
      try {
        const resp = await fetch(importUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(output),
        });
        const result = await resp.json();
        log(`  Import result: ${JSON.stringify(result)}`);
      } catch (err: any) {
        log(`  Import failed: ${err.message}`);
        log('  Make sure the Next.js dev server is running (npm run dev)');
      }
    }

    imap.end();
  } catch (err) {
    imap.end();
    throw err;
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  console.log(JSON.stringify({ jobs: [], error: err.message }));
  process.exit(1);
});
