import { ensureInitialized } from '@/lib/init';
import { listSettings } from '@/lib/repositories/settings-repository';
import { jsonResponse } from '@/lib/api-utils';

export async function GET() {
  ensureInitialized();
  const settings = listSettings();
  return jsonResponse(settings);
}
