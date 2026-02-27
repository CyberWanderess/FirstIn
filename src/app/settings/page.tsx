import { ensureInitialized } from '@/lib/init';
import { config } from '@/lib/config';
import { listSettings } from '@/lib/repositories/settings-repository';
import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  ensureInitialized();
  const settings = listSettings();

  return <SettingsClient initialSettings={settings} enableCrawler={config.enableCrawler} />;
}
