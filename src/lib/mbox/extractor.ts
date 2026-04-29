/**
 * Extract company name and role title from classified emails.
 * Uses ATS platform identification and subject/body pattern matching.
 */

import type { ClassifiedEmail } from './classifier';

export interface ExtractedRejection {
  email: ClassifiedEmail;
  company: string;
  role: string;
  rejectionDate: string;
  atsPlatform: string | null;
}

export interface ExtractedConfirmation {
  email: ClassifiedEmail;
  company: string;
  role: string;
  confirmationDate: string;
}

// ATS platform detection by sender
const ATS_PATTERNS: { pattern: RegExp; platform: string }[] = [
  { pattern: /greenhouse-mail\.io$/i, platform: 'greenhouse' },
  { pattern: /ashbyhq\.com$/i, platform: 'ashby' },
  { pattern: /myworkday\.com$/i, platform: 'workday' },
  { pattern: /hire\.lever\.co$/i, platform: 'lever' },
  { pattern: /talent\.icims\.com$/i, platform: 'icims' },
  { pattern: /smartrecruiters\.com$/i, platform: 'smartrecruiters' },
  { pattern: /(appreview\.)?gem\.com$/i, platform: 'gem' },
  { pattern: /ats\.rippling\.com$/i, platform: 'rippling' },
  { pattern: /successfactors\.(eu|com)$/i, platform: 'successfactors' },
  { pattern: /brassring\.com$/i, platform: 'brassring' },
];

// Subject patterns for extracting company and role.
// Order matters: more specific patterns first.
const SUBJECT_PATTERNS: { pattern: RegExp; groups: { company?: number; role?: number } }[] = [
  // "Your application for {role} at {company}"
  { pattern: /your application for (.+?) at (.+)/i, groups: { role: 1, company: 2 } },
  // "Your application to {role} at {company}"
  { pattern: /your application to (.+?) at (.+)/i, groups: { role: 1, company: 2 } },
  // "Thank you for applying to {role} position at {company}"
  { pattern: /applying to (.+?) position at (.+)/i, groups: { role: 1, company: 2 } },
  // "You were not selected for {role} at {company}"
  { pattern: /not selected for (.+?) at (.+)/i, groups: { role: 1, company: 2 } },
  // "We've received your application for {role} at {company}"
  { pattern: /application for (.+?) at (.+)/i, groups: { role: 1, company: 2 } },
  // "Update on your {role} application with {company}"
  { pattern: /update on your (.+?) application (?:with|at) (.+)/i, groups: { role: 1, company: 2 } },
  // "Thank you for your interest in {company} - {role}" (Greenhouse style)
  { pattern: /interest in (.+?)\s*[-–]\s*(.+)/i, groups: { company: 1, role: 2 } },
  // "Thanks for your application - {company} {role}" (e.g. "CMT Principal TPM")
  { pattern: /thanks for your application\s*[-–]\s*(.+)/i, groups: { role: 1 } },
  // "{company}: Application Received - {role}"
  { pattern: /^(.+?):\s*(?:Application|Update)\s*[-–]\s*(.+)/i, groups: { company: 1, role: 2 } },
  // "{company} | {role}" or "{company} | Update..."
  { pattern: /^(.+?)\s*\|\s*(?:Update on Your Application)/i, groups: { company: 1 } },
  { pattern: /^(.+?)\s*\|\s*(.+)/i, groups: { company: 1, role: 2 } },
  // "{company} Application: {id} - {role}" (AMD style)
  { pattern: /^(.+?)\s+Application:\s*\S+\s*[-–]\s*(.+)/i, groups: { company: 1, role: 2 } },
  // "Your Application for {role} {id}" (SAP style)
  { pattern: /your application for (.+?)\s+\d{4,}/i, groups: { role: 1 } },
  // "Application Received - {role}" (company from sender)
  { pattern: /^Application\s*(?:Received|Update)\s*[-–]\s*(.+)/i, groups: { role: 1 } },
  // "{company} - Thank you for your application {name}!" (Guild style)
  { pattern: /^(.+?)\s*[-–]\s*[Tt]hank you for your application/i, groups: { company: 1 } },
  // "Thanks for your interest in {company}!" (Discord style)
  { pattern: /thanks for your interest in (.+?)!?\s*$/i, groups: { company: 1 } },
  // "Thank you for your interest in {company}" (generic, exclude "this role" etc.)
  { pattern: /thank you for your interest in (.+?)!?\s*$/i, groups: { company: 1 } },
  // "Thank you for applying to {company}" (role in body)
  { pattern: /thank you for (?:applying|your (?:application|interest)) (?:to|at|with) (.+?)!?\s*$/i, groups: { company: 1 } },
  // "Your application to {company}"
  { pattern: /your application (?:to|with) (.+?)!?\s*$/i, groups: { company: 1 } },
  // "Your Application To {company}" (Infosys/BrassRing style)
  { pattern: /your application to (.+)/i, groups: { company: 1 } },
  // "Thank you from {company}" (NVIDIA/Avicena style)
  { pattern: /thank you from (.+?)!?\s*$/i, groups: { company: 1 } },
  // "{name}, following up from {company}"
  { pattern: /following up from (.+?)!?\s*$/i, groups: { company: 1 } },
  // "{company} Disqualification Letter"
  { pattern: /^(.+?)\s+Disqualification/i, groups: { company: 1 } },
  // "Thanks for Applying" / "Thank you for applying!" (generic, no info)
  // These are last resort — company from sender
];

/**
 * Extract structured rejection data from classified rejection emails.
 */
export function extractRejections(rejections: ClassifiedEmail[]): ExtractedRejection[] {
  return rejections.map(email => extractOne(email));
}

function extractOne(email: ClassifiedEmail): ExtractedRejection {
  const atsPlatform = detectAts(email.fromEmail);
  let company = '';
  let role = '';

  // Clean subject of mojibake smart quotes before matching
  const cleanSubject = fixEncoding(email.subject);

  // Try subject patterns
  for (const { pattern, groups } of SUBJECT_PATTERNS) {
    const match = cleanSubject.match(pattern);
    if (match) {
      if (groups.company && match[groups.company]) {
        company = cleanName(match[groups.company]);
      }
      if (groups.role && match[groups.role]) {
        role = cleanName(match[groups.role]);
      }
      break;
    }
  }

  // Clean up bad company extractions
  company = cleanCompanyName(company);

  // For Workday ATS: extract company from email local part (adobe@myworkday.com → Adobe)
  if (!company && atsPlatform === 'workday') {
    company = extractCompanyFromWorkdayEmail(email.fromEmail);
  }

  // Fallback: company from sender display name
  if (!company && email.fromName) {
    company = extractCompanyFromSenderName(email.fromName, atsPlatform);
  }

  // Fallback: company from sender domain (skip for known ATS domains)
  if (!company && !atsPlatform) {
    company = extractCompanyFromDomain(email.fromEmail);
  }

  // Try to extract role from body if not found in subject
  const cleanBody = fixEncoding(email.bodyText);
  if (!role) {
    role = extractRoleFromBody(cleanBody) || 'Unknown';
  }

  // Clean up role: strip job IDs like "R160917", "JR116604", trailing IDs
  role = cleanRole(role);

  // Parse date
  const rejectionDate = parseEmailDate(email.date);

  return { email, company, role, rejectionDate, atsPlatform };
}

function detectAts(email: string): string | null {
  const domain = email.split('@')[1] || '';
  for (const { pattern, platform } of ATS_PATTERNS) {
    if (pattern.test(domain)) return platform;
  }
  return null;
}

/**
 * Fix common mojibake from UTF-8 decoded as Latin-1.
 */
function fixEncoding(s: string): string {
  return s
    .replace(/\u00e2\u0080\u009c/g, '"')   // left double quote
    .replace(/\u00e2\u0080\u009d/g, '"')   // right double quote
    .replace(/\u00e2\u0080\u0099/g, "'")   // right single quote
    .replace(/\u00e2\u0080\u0098/g, "'")   // left single quote
    .replace(/\u00e2\u0080\u0093/g, '–')   // en dash
    .replace(/\u00e2\u0080\u0094/g, '—')   // em dash
    .replace(/â/g, '"').replace(/â/g, '"')  // common mojibake variants
    .replace(/â/g, "'").replace(/â/g, "'")
    .replace(/â/g, '–').replace(/â/g, '—')
    .replace(/Â\s?/g, '')                    // stray Â from encoding
    .replace(/ï»¿/g, '')                     // BOM
    .replace(/[\u0080-\u009f]/g, '');        // C1 control chars
}

/**
 * Reject company names that are clearly not company names.
 */
function cleanCompanyName(name: string): string {
  if (!name) return '';
  const lower = name.toLowerCase().trim();
  // "this role", "this position", etc. — not a company
  if (/^this\s+(role|position|opportunity)/i.test(lower)) return '';
  // If it contains "role" or "position" as a word, it's probably a role leaked into company
  if (/\brole\b.*,/i.test(lower)) return '';
  // Too long to be a company name (>60 chars likely includes role/garbage)
  if (name.length > 60) return '';
  return name;
}

function cleanName(s: string): string {
  return s
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Remove trailing punctuation and names like "Rancy!" or "Yuedi,"
    .replace(/[,!.]+$/, '')
    .trim();
}

/**
 * Clean up extracted role: strip job requisition IDs, normalize.
 */
function cleanRole(role: string): string {
  if (role === 'Unknown') return role;
  let cleaned = role
    // Strip job req IDs: "R160917 Principal TPM" → "Principal TPM"
    .replace(/^[A-Z]{0,3}\d{5,}\s*[-–,]?\s*/i, '')
    // Strip trailing req ID: "TPM R2613377" → "TPM"
    .replace(/\s+[A-Z]{0,2}\d{5,}\s*$/, '')
    // Strip "(Job number: ...)" parentheticals
    .replace(/\s*\(Job number:.*$/i, '')
    // Strip garbage strings that leaked from bad parsing
    .replace(/^(newest|following|any other|needs of the|needs of)$/i, '')
    // Truncate at " position at " or " role at " if it leaked company info
    .replace(/\s+position\s+at\s+.*/i, '')
    .replace(/\s+role\s+at\s+.*/i, '')
    // Truncate if it contains sentence fragments (", we" / ". We" / "we're")
    .replace(/[,.]?\s+(?:we\b|were?\b|you\b|our\b|this\b|thank\b|the team\b|it was\b|meanwhile|in the meantime).*/i, '')
    .trim();

  // If still too long (>80 chars), likely grabbed garbage
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).replace(/\s+\S*$/, '').trim();

  return cleaned || 'Unknown';
}

/**
 * Extract company name from Workday email local part.
 * adobe@myworkday.com → "Adobe", geico@myworkday.com → "GEICO"
 */
function extractCompanyFromWorkdayEmail(email: string): string {
  const local = email.split('@')[0] || '';
  if (!local || local === 'do-not-reply' || local === 'noreply') return '';
  // Some Workday emails have company as local part
  // Skip generic names
  if (/^(workday|notification|jj|wsgr)$/i.test(local)) return '';
  return capitalize(local);
}

function extractCompanyFromSenderName(name: string, ats: string | null): string {
  let cleaned = name.trim();

  // Strip Workday prefixes: "Workday Notification", "Workday @ Intel Notification", "Workday: Wilson Sonsini"
  if (ats === 'workday') {
    cleaned = cleaned
      .replace(/^Workday\s*[@:]\s*/i, '')
      .replace(/^Workday\s+/i, '')
      .replace(/\s*Notification$/i, '')
      .replace(/\s*DO NOT REPLY$/i, '')
      .trim();
    if (!cleaned || /^workday$/i.test(cleaned)) return '';
  }

  // Strip common suffixes
  cleaned = cleaned
    .replace(/\s*(Hiring Team|Recruiting Team|Recruiting|Talent Team|Talent Acquisition|Talent|Careers|HR|Jobs|Health Hiring Team)$/i, '')
    .replace(/\s*DO NOT REPLY$/i, '')
    .replace(/\s*Notification$/i, '')
    .trim();

  // If what remains looks like a person name (two short words, no caps pattern of company),
  // it's probably a recruiter, not a company — but we still use it as fallback
  return cleaned;
}

function extractCompanyFromDomain(email: string): string {
  const domain = email.split('@')[1] || '';
  // Skip generic domains
  if (/^(gmail|yahoo|outlook|hotmail|noreply|no-reply)/.test(domain)) return '';
  // For subdomains like careers.cmtelematics.com or hiring.amat.com, use the main domain
  const parts = domain.split('.');
  if (parts.length >= 2) {
    return capitalize(parts[parts.length - 2]);
  }
  return '';
}

function capitalize(s: string): string {
  // If it's all-caps short string (like AMD, SAP), keep as-is
  if (s.length <= 5 && s === s.toUpperCase()) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractRoleFromBody(rawBody: string): string {
  // Normalize whitespace: collapse \n + spaces into single space for pattern matching
  // (email bodies often have hard-wrapped lines that break role names)
  const body = rawBody.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ');
  const patterns = [
    // "for the {role} role" / "for our {role} role"
    /(?:for the|for our|in the|in our)\s+(.+?)\s+role\b/i,
    // "applying to the {role} role at"
    /applying to the\s+(.+?)\s+role\b/i,
    // "interest in .* and the {role} role" (GitLab style)
    /interest in .{1,50}? and the\s+(.+?)\s+role\b/i,
    // "apply for the {id?} {role} role"
    /apply for the\s+(?:[A-Z]{0,3}\d{4,}\s+)?(.+?)\s+role\b/i,
    // "for the position of {role}" / "position of {role}"
    /(?:for the |the )?position of\s+(.+?)(?:\.\s|\s+at\b|\s+and\b|\n|$)/i,
    // "for the {role} position" / "applying to the {role} position" / "{role} opening"
    // Exclude "following position" which means "the position listed below"
    /(?:for the|regarding the|for our|in the|applying to the)\s+((?!following\b).+?)\s+(?:position|opening)\b/i,
    // "applied for|application for|apply for the {role} (position|role|at)" (with optional "the")
    /(?:applied for|application for|apply for)\s+(?:the\s+)?((?!following\b|the following\b).+?)\s+(?:position|role|at\b)/i,
    // "role of {role}" (Uniphore style: "role of Technical Program Manager")
    /role of\s+(.+?)(?:\.\s|\n|$)/i,
    // "{role} opening at" (Lam Research style)
    /the\s+(.+?)\s+opening\s+at\b/i,
    // "{role} recruitment" (Dexcom style)
    /the\s+(.+?)\s+recruitment\b/i,
    // "Position: {role}" (structured format — body is whitespace-normalized)
    // Handle double "position: Position: Role" by making prefix greedy
    /\bposition:\s+(?:position:\s+)?([A-Z][^.]+?)(?:\s+Job Number:|\s+Req|\s+ID:|\.\s|$)/i,
    /\brole:\s*([A-Z][^.]+?)(?:\s+Job Number:|\s+Req|\.\s|$)/i,
    /\bjob title:\s*([A-Z][^.]+?)(?:\s+Job Number:|\s+Req|\.\s|$)/i,
    // "submit your application for {role}" (stop at period or parenthesis)
    /submit your application for\s+(.+?)(?:\.\s|\s*\()/i,
    // "interest in the {role} role with {company}" (Qualys style)
    /interest in the\s+(.+?)\s+role\s+with\b/i,
    // "apply/applying to the {role} role/position" (Ashby style)
    /appl(?:y|ying) to the\s+(.+?)\s+(?:role|position)\b/i,
    // "applying to the {role}" with sentence boundary
    /appl(?:y|ying) to the\s+(.+?)(?:\.\s|!|$)/i,
    // "apply for the {id?} {role}" with sentence boundary
    /apply for the\s+(?:[A-Z]{0,3}\d{4,}\s*[-–]?\s*)?(.+?)(?:\.\s|$)/i,
    // "apply for {role}." without "the" (Nebius style)
    /apply for\s+([A-Z][^.]{5,80}?)(?:\.\s|$)/i,
    // "application for the {role}" without position/role suffix
    /application for (?:the\s+)?(.+?)(?:\.\s|$)/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      let role = cleanName(match[1]);
      // Strip job req IDs from extracted role
      role = role.replace(/^[A-Z]{0,3}\d{4,}\s*[-–]?\s*/i, '').trim();
      if (role.length > 3 && role.length < 100) return role;
    }
  }
  return '';
}

function parseEmailDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch {
    return '';
  }
}

/**
 * Extract structured confirmation data from classified confirmation emails.
 */
export function extractConfirmations(confirmations: ClassifiedEmail[]): ExtractedConfirmation[] {
  return confirmations.map(email => {
    const atsPlatform = detectAts(email.fromEmail);
    const cleanSubject = fixEncoding(email.subject);
    let company = '';
    let role = '';

    for (const { pattern, groups } of SUBJECT_PATTERNS) {
      const match = cleanSubject.match(pattern);
      if (match) {
        if (groups.company && match[groups.company]) {
          company = cleanName(match[groups.company]);
        }
        if (groups.role && match[groups.role]) {
          role = cleanName(match[groups.role]);
        }
        break;
      }
    }

    if (!company && atsPlatform === 'workday') {
      company = extractCompanyFromWorkdayEmail(email.fromEmail);
    }
    if (!company && email.fromName) {
      company = extractCompanyFromSenderName(email.fromName, atsPlatform);
    }
    if (!company && !atsPlatform) {
      company = extractCompanyFromDomain(email.fromEmail);
    }

    const cleanBody = fixEncoding(email.bodyText);
    if (!role) {
      role = extractRoleFromBody(cleanBody) || 'Unknown';
    }
    role = cleanRole(role);

    return { email, company, role, confirmationDate: parseEmailDate(email.date) };
  });
}
