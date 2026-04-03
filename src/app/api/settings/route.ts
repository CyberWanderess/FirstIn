import { withAuth } from '@/lib/route-handler';
import { listSettings } from '@/lib/repositories/settings-repository';
import { jsonResponse } from '@/lib/api-utils';

export const GET = withAuth(async () => {
  const settings = listSettings();
  return jsonResponse(settings);
});
