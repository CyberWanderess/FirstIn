/**
 * Scan JD text for visa/H1B sponsorship signals.
 * Returns 'yes' if explicitly sponsors, 'no' if explicitly doesn't, null if unclear.
 */
export function scanVisaSponsorship(jdText: string): 'yes' | 'no' | null {
  const text = jdText.toLowerCase();

  // Positive signals: explicitly sponsors
  const sponsorPatterns = [
    /visa sponsorship\s+(is\s+)?available/,
    /will\s+sponsor\s+(h[- ]?1b|visa)/,
    /we\s+sponsor\s+(h[- ]?1b|visa)/,
    /h[- ]?1b\s+sponsorship\s+(is\s+)?(provided|available|offered)/,
    /sponsorship\s+(is\s+)?(provided|available|offered)\s+for\s+this/,
  ];

  // Negative signals: explicitly does not sponsor
  const noSponsorPatterns = [
    /does\s+not\s+sponsor/,
    /do\s+not\s+sponsor/,
    /cannot\s+sponsor/,
    /will\s+not\s+sponsor/,
    /unable\s+to\s+sponsor/,
    /not\s+able\s+to\s+sponsor/,
    /no\s+visa\s+sponsorship/,
    /without\s+(visa\s+)?sponsorship/,
    /not\s+offer\s+(visa\s+)?sponsorship/,
    /sponsorship\s+is\s+not\s+(available|offered|provided)/,
    /must\s+be\s+(legally\s+)?authorized\s+to\s+work/,
    /legally\s+authorized\s+to\s+work/,
    /authorization\s+to\s+work.*without\s+(company\s+)?sponsorship/,
    /work\s+authorization.*without\s+sponsorship/,
    /\bitar\b/,
    /\bexport\s+control(led)?\b/,
    /security\s+clearance\s+required/,
    /must\s+be\s+(a\s+)?(u\.?s\.?\s+citizen|united\s+states\s+citizen)/,
    /u\.?s\.?\s+(citizen(ship)?|permanent\s+resident)\s+(is\s+)?required/,
  ];

  // Check positive first (less common but more definitive)
  for (const pattern of sponsorPatterns) {
    if (pattern.test(text)) return 'yes';
  }

  // Check negative
  for (const pattern of noSponsorPatterns) {
    if (pattern.test(text)) return 'no';
  }

  return null;
}
