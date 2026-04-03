/**
 * Clean HTML from JD text, preserving paragraph structure.
 */
export function cleanJdText(text: string): string {
  if (!text || !text.includes('<')) return text;

  let result = text;

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

  // Decode HTML entities
  result = result
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // Collapse multiple blank lines into at most two newlines
  result = result.replace(/\n{3,}/g, '\n\n');

  // Collapse multiple spaces (but not newlines) into single space
  result = result.replace(/[^\S\n]+/g, ' ');

  // Clean up lines that are just spaces
  result = result.replace(/\n +\n/g, '\n\n');

  return result.trim();
}
