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

// ATS platform detection by sender
const ATS_PATTERNS: { pattern: RegExp; platform: string }[] = [
  { pattern: /greenhouse-mail\.io$/i, platform: 'greenhouse' },
  { pattern: /ashbyhq\.com$/i, platform: 'ashby' },
  { pattern: /myworkday\.com$/i, platform: 'workday' },
  { pattern: /hire\.lever\.co$/i, platform: 'lever' },
  { pattern: /talent\.icims\.com$/i, platform: 'icims' },
  { pattern: /smartrecruiters\.com$/i, platform: 'smartrecruiters' },
  { pattern: /(appreview\.)?gem\.com$/i, platform: 'gem' },
];

// Subject patterns for extracting company and role
const SUBJECT_PATTERNS: { pattern: RegExp; groups: { company?: number; role?: number } }[] = [
  // "Your application for {role} at {company}"
  { pattern: /your application for (.+?) at (.+)/i, groups: { role: 1, company: 2 } },
  // "Thank you for applying to {role} position at {company}"
  { pattern: /applying to (.+?) position at (.+)/i, groups: { role: 1, company: 2 } },
  // "We've received your application for {role} at {company}"
  { pattern: /application for (.+?) at (.+)/i, groups: { role: 1, company: 2 } },
  // "Update on your {role} application with {company}"
  { pattern: /update on your (.+?) application (?:with|at) (.+)/i, groups: { role: 1, company: 2 } },
  // "{company}: Application Received - {role}"
  { pattern: /^(.+?):\s*(?:Application|Update)\s*[-–]\s*(.+)/i, groups: { company: 1, role: 2 } },
  // "Application Received - {role}" (company from sender)
  { pattern: /^Application\s*(?:Received|Update)\s*[-–]\s*(.+)/i, groups: { role: 1 } },
  // "Thank you for applying to {company}" (role in body)
  { pattern: /thank you for (?:applying|your (?:application|interest)) (?:to|at|with) (.+)/i, groups: { company: 1 } },
  // "{company} Disqualification Letter"
  { pattern: /^(.+?)\s+Disqualification/i, groups: { company: 1 } },
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

  // Try subject patterns
  for (const { pattern, groups } of SUBJECT_PATTERNS) {
    const match = email.subject.match(pattern);
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

  // Fallback: company from sender display name
  if (!company && email.fromName) {
    company = extractCompanyFromSenderName(email.fromName);
  }

  // Fallback: company from sender domain
  if (!company) {
    company = extractCompanyFromDomain(email.fromEmail, atsPlatform);
  }

  // Try to extract role from body if not found in subject
  if (!role) {
    role = extractRoleFromBody(email.bodyText) || 'Unknown';
  }

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

function cleanName(s: string): string {
  return s.replace(/['"]/g, '').replace(/\s+/g, ' ').trim();
}

function extractCompanyFromSenderName(name: string): string {
  // "XXX Hiring Team" → "XXX"
  return name.replace(/\s*(Hiring Team|Recruiting|Careers|Talent|HR|Jobs)$/i, '').trim();
}

function extractCompanyFromDomain(email: string, ats: string | null): string {
  if (ats) return ''; // ATS domains don't reveal company
  const domain = email.split('@')[1] || '';
  // Skip generic domains
  if (/^(gmail|yahoo|outlook|hotmail|noreply|no-reply)/.test(domain)) return '';
  // Take first part of domain
  const parts = domain.split('.');
  if (parts.length >= 2) {
    return capitalize(parts[parts.length - 2]);
  }
  return '';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractRoleFromBody(body: string): string {
  // Common patterns in rejection body referencing the role
  const patterns = [
    /(?:for the|regarding the|for our)\s+(.+?)\s+(?:position|role|opening)/i,
    /(?:applied for|application for)\s+(?:the\s+)?(.+?)\s+(?:position|role|at\b)/i,
    /position:\s*(.+?)(?:\n|$)/i,
    /role:\s*(.+?)(?:\n|$)/i,
    /job title:\s*(.+?)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      const role = cleanName(match[1]);
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
