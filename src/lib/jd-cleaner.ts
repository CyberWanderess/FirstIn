/**
 * Clean HTML from JD text, preserving paragraph structure.
 * Safe, deterministic — used at import time to store clean plaintext.
 */
export function cleanJdText(text: string): string {
  if (!text) return text;

  let result = text;

  // First decode HTML entities so entity-encoded HTML gets processed
  // (some JDs store <div> as &lt;div&gt;)
  if (!result.includes('<') && result.includes('&lt;')) {
    result = decodeHtmlEntities(result);
  }

  // If no HTML tags, just normalize whitespace
  if (!result.includes('<')) {
    return normalizeWhitespace(result);
  }

  // Convert block-level closing tags to newlines (preserve paragraph structure)
  result = result.replace(/<br\s*\/?>/gi, '\n');
  result = result.replace(/<\/p>/gi, '\n');
  result = result.replace(/<\/div>/gi, '\n');
  result = result.replace(/<\/h[1-6]>/gi, '\n');
  result = result.replace(/<\/tr>/gi, '\n');
  result = result.replace(/<\/li>/gi, '\n');

  // Convert list items to bullet points
  result = result.replace(/<li[^>]*>/gi, '\n• ');

  // Strip all remaining HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // Decode HTML entities (for any remaining after tag stripping)
  result = decodeHtmlEntities(result);

  return normalizeWhitespace(result);
}

/**
 * Split long lines into shorter ones for line-range based processing.
 * Targets single-paragraph JDs (common from hiring_cafe/jsearch) where
 * the entire JD is one long line after HTML cleaning.
 *
 * Only splits lines longer than 200 chars to avoid over-splitting already-structured text.
 */
export function splitLongLines(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    if (line.length <= 200) {
      result.push(line);
      continue;
    }

    // Split this long line into sentences/segments
    let remaining = line;
    const segments: string[] = [];

    // First: split before bullet markers
    remaining = remaining.replace(/(?<=[^\n])\s+(•\s)/g, '\n$1');

    // Split before ALL-CAPS section headers (2+ uppercase words)
    remaining = remaining.replace(/(?<=\S)\s{2,}(?=[A-Z][A-Z\s&]{5,}(?:[:\n]|$))/g, '\n');
    remaining = remaining.replace(/(?<=\S)\s+(?=(?:RESPONSIBILITIES|QUALIFICATIONS|REQUIREMENTS|MINIMUM|PREFERRED|NICE TO HAVE|MUST HAVE|ABOUT THE|WHAT YOU|WHO YOU|KEY SKILLS|JOB SUMMARY|OVERVIEW|DESCRIPTION|DUTIES|ESSENTIAL)\b)/g, '\n');

    // Split at sentence boundaries: ". " but protect abbreviations
    // Protected: U.S., Inc., Corp., Ltd., Sr., Jr., Dr., Mr., Ms., e.g., i.e., etc., vs., approx.
    const sentenceSplit = remaining.replace(
      /(?<!\b(?:U\.S|Inc|Corp|Ltd|Co|Sr|Jr|Dr|Mr|Ms|Mrs|e\.g|i\.e|etc|vs|approx|dept|mgmt|govt|assoc|est|\d))\.(\s+)(?=[A-Z•\-\*])/g,
      '.\n'
    );

    // Split at semicolons
    const semiSplit = sentenceSplit.replace(/;\s+/g, ';\n');

    result.push(semiSplit);
  }

  return normalizeWhitespace(result.join('\n'));
}

/**
 * Build a batch Haiku prompt for JD boilerplate detection.
 * Returns removal ranges with type tags (fail-safe: omitted JDs = no boilerplate).
 */
export function buildBatchJdCleanupPrompt(jobs: { id: number; numberedText: string }[]): string {
  const jobSections = jobs.map(
    (j) => `=== JOB #${j.id} ===\n${j.numberedText}\n=== END JOB #${j.id} ===`
  );

  return `You are a JD boilerplate detector. For each job below, identify line ranges that are boilerplate and should be REMOVED. Tag each range with its type.

Boilerplate types to detect and remove:
- "eeo": Equal opportunity / non-discrimination statements
- "benefits": Detailed benefits lists (health, dental, 401k, PTO, insurance details)
- "legal": Legal disclaimers, compliance notices, arbitration clauses
- "apply": Application instructions ("how to apply", "send resume")
- "about": Generic company "about us" paragraphs NOT about the specific role or team
- "ai_disclosure": AI interview/screening tool disclosures
- "salary_boilerplate": Salary transparency legal text (NOT the actual salary number — keep that)
- "accommodations": Reasonable accommodation notices
- "nav": Navigation artifacts, language selectors, UI remnants

Do NOT flag as boilerplate:
- Role/team description, responsibilities, duties
- Required AND preferred qualifications (even if labeled creatively like "what makes you stand out", "bonus points", "you'll thrive here if")
- Salary/compensation numbers
- Visa/work authorization requirements
- Work arrangement (remote/hybrid/onsite)

Output a JSON object: keys are job IDs, values are arrays of {"type": string, "lines": [start, end]}.
Only include jobs that HAVE boilerplate to remove. If a JD is clean, omit it.
Example: {"2": [{"type": "eeo", "lines": [45,52]}], "5": [{"type": "benefits", "lines": [30,44]}, {"type": "eeo", "lines": [50,55]}]}
No explanation, no markdown fences.

${jobSections.join('\n\n')}`;
}

/**
 * Add line numbers to text for Haiku line-range extraction.
 */
export function numberLines(text: string): string {
  return text.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n');
}

/**
 * Remove specified line ranges from text (deletion-based approach).
 */
export function removeLineRanges(text: string, ranges: { type: string; lines: [number, number] }[]): string {
  const lines = text.split('\n');
  const removeSet = new Set<number>();
  for (const r of ranges) {
    for (let i = r.lines[0] - 1; i < Math.min(r.lines[1], lines.length); i++) {
      removeSet.add(i);
    }
  }
  const kept = lines.filter((_, i) => !removeSet.has(i));
  return normalizeWhitespace(kept.join('\n'));
}

// Keep old functions for backward compatibility (single-JD mode)
export { buildBatchJdCleanupPrompt as buildJdCleanupPrompt };

/**
 * Apply Haiku's line ranges to extract kept content (legacy keep-based).
 */
export function applyLineRanges(text: string, ranges: [number, number][]): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  for (const [start, end] of ranges) {
    for (let i = start - 1; i < Math.min(end, lines.length); i++) {
      kept.push(lines[i]);
    }
  }
  return normalizeWhitespace(kept.join('\n'));
}

// ── Internal helpers ──

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function normalizeWhitespace(text: string): string {
  let result = text;
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/[^\S\n]+/g, ' ');
  result = result.replace(/\n +\n/g, '\n\n');
  return result.trim();
}
