export interface ExtensionConfig {
  serverUrl: string;
  apiToken: string;
}

const DEFAULTS: ExtensionConfig = {
  serverUrl: '',
  apiToken: '',
};

export async function getConfig(): Promise<ExtensionConfig> {
  const result = await chrome.storage.sync.get(DEFAULTS);
  return result as ExtensionConfig;
}

/** Strip non-ASCII characters that break fetch headers (zero-width spaces, smart quotes, etc.) */
function sanitize(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x20-\x7E]/g, '');
}

export async function setConfig(config: Partial<ExtensionConfig>): Promise<void> {
  const cleaned: Partial<ExtensionConfig> = {};
  if (config.serverUrl !== undefined) cleaned.serverUrl = sanitize(config.serverUrl.trim());
  if (config.apiToken !== undefined) cleaned.apiToken = sanitize(config.apiToken.trim());
  await chrome.storage.sync.set(cleaned);
}

export function isConfigured(config: ExtensionConfig): boolean {
  return !!config.serverUrl && !!config.apiToken;
}
