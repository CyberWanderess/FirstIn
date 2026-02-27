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
  databasePath: required('DATABASE_PATH'),
  nodeEnv: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '3000'), 10),
  baseUrl: process.env.BASE_URL || null,
  get isDev() {
    return this.nodeEnv === 'development';
  },
  get isProd() {
    return this.nodeEnv === 'production';
  },
} as const;
