/**
 * Mbox file parser — splits mbox into individual emails and extracts headers + body text.
 * Handles multipart MIME (prefers text/plain, falls back to HTML with tag stripping).
 */

export interface ParsedEmail {
  index: number;
  from: string;       // raw From header
  fromEmail: string;  // extracted email address
  fromName: string;   // display name
  subject: string;
  date: string;
  bodyText: string;   // cleaned plain text body
  rawHeaders: string;
}

/**
 * Parse an mbox file buffer into individual emails.
 */
export function parseMbox(content: string): ParsedEmail[] {
  const emails: ParsedEmail[] = [];

  // Normalize line endings (Gmail exports use \r\n)
  content = content.replace(/\r\n/g, '\n');

  // Split by "From " at start of line (mbox format delimiter)
  // The pattern is: blank line + "From " at line start
  const rawMessages = content.split(/^From /m);

  for (let i = 0; i < rawMessages.length; i++) {
    const raw = rawMessages[i];
    if (!raw.trim()) continue;

    // Split headers from body (first blank line)
    const headerEnd = raw.indexOf('\n\n');
    if (headerEnd === -1) continue;

    const rawHeaders = raw.substring(0, headerEnd);
    const rawBody = raw.substring(headerEnd + 2);

    const from = extractHeader(rawHeaders, 'From');
    const subject = decodeHeader(extractHeader(rawHeaders, 'Subject'));
    const date = extractHeader(rawHeaders, 'Date');
    const contentType = extractHeader(rawHeaders, 'Content-Type');
    const transferEncoding = extractHeader(rawHeaders, 'Content-Transfer-Encoding');

    const { email: fromEmail, name: fromName } = parseFromHeader(from);
    const bodyText = extractBodyText(rawBody, contentType, transferEncoding);

    emails.push({
      index: emails.length,
      from,
      fromEmail,
      fromName,
      subject,
      date,
      bodyText,
      rawHeaders,
    });
  }

  return emails;
}

/**
 * Extract a header value, handling multi-line continuation.
 */
function extractHeader(headers: string, name: string): string {
  // Match the header value including any RFC 2822 folded continuation lines
  // (lines immediately following that begin with whitespace).
  // Pattern: header-name: <first-line-value> (\n <WSP> <continuation>)*
  // The `m` flag makes ^ match at line boundaries; no `s` needed because
  // we explicitly enumerate continuation lines rather than using `.` across newlines.
  const regex = new RegExp(`^${name}:\\s*(.*(?:\\n[ \\t]+.*)*)`, 'im');
  const match = headers.match(regex);
  if (!match) return '';
  // Unfold continuation lines (replace \n + leading whitespace with a single space)
  return match[1].replace(/\r?\n[ \t]+/g, ' ').trim();
}

/**
 * Decode MIME encoded-word headers (=?charset?encoding?text?=).
 */
function decodeHeader(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, charset, encoding, text) => {
    if (encoding.toUpperCase() === 'B') {
      return Buffer.from(text, 'base64').toString('utf-8');
    }
    if (encoding.toUpperCase() === 'Q') {
      const decoded = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      return decoded;
    }
    return text;
  });
}

/**
 * Parse "Display Name <email@example.com>" format.
 */
function parseFromHeader(from: string): { email: string; name: string } {
  const match = from.match(/^"?([^"<]*)"?\s*<([^>]+)>/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
  }
  // Just an email address
  const emailMatch = from.match(/[\w.+-]+@[\w.-]+/);
  return { name: '', email: emailMatch ? emailMatch[0].toLowerCase() : from };
}

/**
 * Extract plain text from email body, handling MIME multipart.
 */
function extractBodyText(rawBody: string, contentType: string, transferEncoding: string): string {
  // Check if multipart
  const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    return extractFromMultipart(rawBody, boundary);
  }

  // Single part — use the top-level Content-Transfer-Encoding
  if (contentType.toLowerCase().includes('text/html')) {
    return stripHtml(decodeBody(rawBody, transferEncoding));
  }
  return decodeBody(rawBody, transferEncoding);
}

/**
 * Extract text from multipart MIME body.
 * Prefers text/plain, falls back to text/html (stripped).
 */
function extractFromMultipart(body: string, boundary: string): string {
  const parts = body.split(`--${boundary}`);
  let plainText = '';
  let htmlText = '';

  for (const part of parts) {
    if (part.startsWith('--')) continue; // closing boundary

    const partHeaderEnd = part.indexOf('\n\n');
    if (partHeaderEnd === -1) continue;

    const partHeaders = part.substring(0, partHeaderEnd);
    const partBody = part.substring(partHeaderEnd + 2);
    const partContentType = extractHeader(partHeaders, 'Content-Type');
    const transferEncoding = extractHeader(partHeaders, 'Content-Transfer-Encoding');

    // Nested multipart
    const nestedBoundary = partContentType.match(/boundary="?([^";\s]+)"?/i);
    if (nestedBoundary) {
      const nested = extractFromMultipart(partBody, nestedBoundary[1]);
      if (nested) return nested;
      continue;
    }

    if (partContentType.toLowerCase().includes('text/plain')) {
      plainText = decodeBody(partBody, transferEncoding);
    } else if (partContentType.toLowerCase().includes('text/html')) {
      htmlText = decodeBody(partBody, transferEncoding);
    }
  }

  if (plainText) return plainText;
  if (htmlText) return stripHtml(htmlText);
  return '';
}

/**
 * Decode body based on Content-Transfer-Encoding.
 */
function decodeBody(body: string, encoding: string): string {
  const enc = encoding.toLowerCase().trim();
  if (enc === 'base64') {
    return Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8');
  }
  if (enc === 'quoted-printable') {
    return body
      .replace(/=\r?\n/g, '') // soft line breaks
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return body;
}

/**
 * Strip HTML tags, keeping text content. Skips <style> and <script> blocks.
 */
function stripHtml(html: string): string {
  // Remove style and script blocks entirely
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Replace <br> and block elements with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');
  text = text.replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
