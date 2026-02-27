import { ensureInitialized } from '@/lib/init';
import { listSettings } from '@/lib/repositories/settings-repository';
import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  ensureInitialized();
  const settings = listSettings();

  return <SettingsClient initialSettings={settings} />;
}
