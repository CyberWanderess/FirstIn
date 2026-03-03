import { describe, it, expect } from 'vitest';
import { scanVisaSponsorship } from '@/lib/visa-scan';

describe('scanVisaSponsorship', () => {
  describe('positive matches → yes', () => {
    const cases = [
      'Visa sponsorship is available for this role',
      'We will sponsor H1B visa',
      'will sponsor visa for the right candidate',
      'We sponsor H-1B visas',
      'H1B sponsorship is provided',
      'Sponsorship is offered for this position',
    ];
    it.each(cases)('"%s" → yes', (text) => {
      expect(scanVisaSponsorship(text)).toBe('yes');
    });
  });

  describe('negative matches → no', () => {
    const cases = [
      'This company does not sponsor visas',
      'We do not sponsor H1B',
      'Cannot sponsor visa at this time',
      'Will not sponsor work visas',
      'Unable to sponsor visas',
      'There is no visa sponsorship for this position',
      'Offered without sponsorship',
      'Does not offer visa sponsorship',
      'Sponsorship is not available for this role',
      'Must be legally authorized to work in the US',
      'This role is ITAR restricted',
      'Export controlled environment',
      'Security clearance required',
      'Must be a U.S. citizen',
      'US citizenship required for this position',
      'U.S. permanent resident is required',
    ];
    it.each(cases)('"%s" → no', (text) => {
      expect(scanVisaSponsorship(text)).toBe('no');
    });
  });

  describe('no match → null', () => {
    const cases = [
      'Great engineering role at a fast-growing startup',
      'We offer competitive salary and benefits',
      '',
      'Looking for experienced software engineers',
    ];
    it.each(cases)('"%s" → null', (text) => {
      expect(scanVisaSponsorship(text)).toBeNull();
    });
  });

  it('is case-insensitive', () => {
    expect(scanVisaSponsorship('VISA SPONSORSHIP IS AVAILABLE')).toBe('yes');
    expect(scanVisaSponsorship('DOES NOT SPONSOR')).toBe('no');
  });

  it('positive wins over negative when positive comes first in text', () => {
    // positive patterns are checked first regardless of text position
    expect(scanVisaSponsorship('We will sponsor H1B. Must be authorized to work.')).toBe('yes');
  });
});
