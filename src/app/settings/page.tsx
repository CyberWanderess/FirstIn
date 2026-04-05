import { requireAuthPage } from '@/lib/auth';
import { runWithUser } from '@/lib/db';
import { ensureInitialized } from '@/lib/init';
import { config } from '@/lib/config';
import { listSettings } from '@/lib/repositories/settings-repository';
import { listRules } from '@/lib/repositories/rule-repository';
import { SettingsPageTabs } from './settings-tabs';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireAuthPage();

  return runWithUser(user.id, () => {
    ensureInitialized();
    const settings = listSettings();
    const rules = listRules();

    return (
      <SettingsPageTabs
        initialSettings={settings}
        initialRules={rules}
        enableCrawler={config.enableCrawler}
      />
    );
  });
}
