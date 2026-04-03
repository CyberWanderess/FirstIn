function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  legacyDatabasePath: optional('DATABASE_PATH', './data/jobhq.db'),
  nodeEnv: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '3000'), 10),
  baseUrl: process.env.BASE_URL || null,
  enableCrawler: optional('ENABLE_CRAWLER', 'true') === 'true',
  enableChineseAffinity: optional('ENABLE_CHINESE_AFFINITY', 'true') === 'true',
  get isDev() {
    return this.nodeEnv === 'development';
  },
  get isProd() {
    return this.nodeEnv === 'production';
  },
} as const;
