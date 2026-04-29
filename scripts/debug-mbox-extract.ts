/**
 * Debug script: parse mbox, classify, extract rejections, and show results.
 * Usage: npx tsx scripts/debug-mbox-extract.ts
 */
import { readFileSync } from 'fs';
import { parseMbox } from '../src/lib/mbox/parser';
import { classifyEmails } from '../src/lib/mbox/classifier';
import { extractRejections } from '../src/lib/mbox/extractor';

const mboxPath = './data/mbox/1.mbox';
const content = readFileSync(mboxPath, 'utf-8');

console.log('Parsing mbox...');
const emails = parseMbox(content);
console.log(`Total emails: ${emails.length}`);

const classified = classifyEmails(emails);
const rejections = classified.filter(e => e.category === 'rejection');
const confirmations = classified.filter(e => e.category === 'confirmation');
const interviews = classified.filter(e => e.category === 'interview');

console.log(`Rejections: ${rejections.length}`);
console.log(`Confirmations: ${confirmations.length}`);
console.log(`Interviews: ${interviews.length}`);
console.log(`Noise: ${classified.filter(e => e.category === 'noise').length}`);
console.log('---');

const extracted = extractRejections(rejections);

console.log('\n=== EXTRACTED REJECTIONS ===\n');
for (const r of extracted) {
  console.log(`Company: "${r.company}" | Role: "${r.role}" | Date: ${r.rejectionDate} | ATS: ${r.atsPlatform || '-'}`);
  console.log(`  From: ${r.email.fromName} <${r.email.fromEmail}>`);
  console.log(`  Subject: ${r.email.subject}`);
  console.log('');
}

// Show ones with empty company
const noCompany = extracted.filter(r => !r.company);
if (noCompany.length > 0) {
  console.log(`\n=== ${noCompany.length} REJECTIONS WITH NO COMPANY ===\n`);
  for (const r of noCompany) {
    console.log(`  From: ${r.email.fromName} <${r.email.fromEmail}>`);
    console.log(`  Subject: ${r.email.subject}`);
    console.log(`  Body (first 200): ${r.email.bodyText.slice(0, 200)}`);
    console.log('');
  }
}

// Show ones with Unknown role
const noRole = extracted.filter(r => r.role === 'Unknown');
if (noRole.length > 0) {
  console.log(`\n=== ${noRole.length} REJECTIONS WITH UNKNOWN ROLE ===\n`);
  for (const r of noRole) {
    console.log(`  Company: "${r.company}" | From: ${r.email.fromName} <${r.email.fromEmail}>`);
    console.log(`  Subject: ${r.email.subject}`);
    console.log(`  Body (first 300): ${r.email.bodyText.slice(0, 300)}`);
    console.log('');
  }
}
