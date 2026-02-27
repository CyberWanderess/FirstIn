import { ensureInitialized } from '@/lib/init';
import { listRules } from '@/lib/repositories/rule-repository';
import { RulesClient } from './rules-client';

export const dynamic = 'force-dynamic';

export default function RulesPage() {
  ensureInitialized();
  const rules = listRules();

  return <RulesClient initialRules={rules} />;
}
