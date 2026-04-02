import { requireAuthPage } from '@/lib/auth';
import { runWithUser } from '@/lib/db';
import { ensureInitialized } from '@/lib/init';
import { listRules } from '@/lib/repositories/rule-repository';
import { RulesClient } from './rules-client';

export const dynamic = 'force-dynamic';

export default async function RulesPage() {
  const user = await requireAuthPage();

  return runWithUser(user.id, () => {
    ensureInitialized();
    const rules = listRules();

    return <RulesClient initialRules={rules} />;
  });
}
