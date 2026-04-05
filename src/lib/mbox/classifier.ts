/**
 * Email classifier — categorizes emails as rejection, confirmation, interview, or noise.
 * Based on verified patterns from 343-email analysis.
 */

import type { ParsedEmail } from './parser';

export type EmailCategory = 'rejection' | 'confirmation' | 'interview' | 'noise';

export interface ClassifiedEmail extends ParsedEmail {
  category: EmailCategory;
  matchedKeyword?: string;
}

// Noise sender domains — skip entirely
const NOISE_SENDERS = [
  'hiring.cafe',
  'runpod.io',
  'runpod.com',
  'accounts.google.com',
  'em.linkedin.com',
  'jm.indeed.com',
  'match.indeed.com',
  'jobwizard.ai',
  'stripe.com',
  'email.claude.com',
  'google-gemini',
  'googleplay',
  'qemailserver.com',
];

// Noise subject patterns (case-insensitive)
const NOISE_SUBJECTS = [
  /security alert/i,
  /security code/i,
  /verify your/i,
  /one-time passcode/i,
  /reset your password/i,
  /low balance warning/i,
  /\breceipt\b/i,
  /^welcome to/i,
  /profile is incomplete/i,
  /profile needs attention/i,
  /latest job postings/i,
];

// Verified rejection body keywords (~95% hit rate)
const REJECTION_KEYWORDS = [
  'unfortunately',
  'decided not to move forward',
  'decided to move forward with other candidates',
  'not selected',
  'will not be moving forward',
  "won't be moving forward",
  'not able to move forward',
  'regret to inform',
  'not be progressing',
  "won't be progressing",
  'disqualification',
  'not a match',
  'position has been filled',
  'decided to pursue other applicants',
  'have decided not to',
  'decided not to advance',
  'we will not be',
  'not to move forward',
  'not to proceed',
  'decided to proceed with another candidate',
  'moved forward with another candidate',
  'after careful consideration',
  'not a fit for this role',
  'pass on your application',
  'move forward with a different candidate',
];

// False positive exclusion patterns — if these appear near the keyword, it's NOT a rejection
const EXCLUSION_PATTERNS = [
  /if you are not selected/i,
  /if you are not chosen/i,
  /while we're not able to respond/i,
  /please.*complete.*survey/i,
  /take.*seconds.*feedback/i,
];

// Interview indicators
const INTERVIEW_KEYWORDS = [
  /schedule.*interview/i,
  /interview.*invitation/i,
  /we'd like to.*interview/i,
  /phone screen/i,
  /technical assessment/i,
  /coding challenge/i,
  /next step.*process/i,
];

// Application confirmation indicators
const CONFIRMATION_KEYWORDS = [
  /thank you for (applying|your (application|interest))/i,
  /application (has been |was )?(received|submitted)/i,
  /we('ve| have) received your application/i,
  /successfully (applied|submitted)/i,
];

/**
 * Classify a list of parsed emails.
 */
export function classifyEmails(emails: ParsedEmail[]): ClassifiedEmail[] {
  return emails.map((email) => classifyOne(email));
}

function classifyOne(email: ParsedEmail): ClassifiedEmail {
  // Step 1: Noise by sender
  const senderDomain = email.fromEmail.split('@')[1] || '';
  if (NOISE_SENDERS.some(ns => senderDomain.includes(ns))) {
    return { ...email, category: 'noise' };
  }

  // Step 2: Noise by subject
  if (NOISE_SUBJECTS.some(pattern => pattern.test(email.subject))) {
    return { ...email, category: 'noise' };
  }

  // Normalize smart quotes before keyword matching
  const bodyLower = email.bodyText
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .toLowerCase();

  // Step 3: Check for rejection keywords in body
  for (const keyword of REJECTION_KEYWORDS) {
    if (bodyLower.includes(keyword.toLowerCase())) {
      // Step 4: Check exclusion patterns (false positives)
      const isExcluded = EXCLUSION_PATTERNS.some(pattern => {
        const match = pattern.exec(email.bodyText);
        if (!match) return false;
        // Check if the exclusion pattern encompasses the keyword
        // e.g., "if you are not selected" contains "not selected"
        return match[0].toLowerCase().includes(keyword.toLowerCase());
      });

      if (!isExcluded) {
        return { ...email, category: 'rejection', matchedKeyword: keyword };
      }
    }
  }

  // Step 5: Check for interview indicators
  if (INTERVIEW_KEYWORDS.some(pattern => pattern.test(email.bodyText))) {
    return { ...email, category: 'interview' };
  }

  // Step 6: Check for application confirmation
  if (CONFIRMATION_KEYWORDS.some(pattern => pattern.test(email.bodyText) || pattern.test(email.subject))) {
    return { ...email, category: 'confirmation' };
  }

  // Default: noise
  return { ...email, category: 'noise' };
}
