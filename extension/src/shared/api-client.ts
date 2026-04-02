import type { ApiResult, JobPayload, SaveResponse, CheckResponse, StatsResponse } from './types';

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'api-request',
      method,
      path,
      body,
    });
    return response as ApiResult<T>;
  } catch (e) {
    return { success: false, error: `Network error: ${(e as Error).message}` };
  }
}

export async function saveJob(payload: JobPayload): Promise<ApiResult<SaveResponse>> {
  return request<SaveResponse>('POST', '/api/extension/save', payload);
}

export async function saveBatch(items: JobPayload[]): Promise<ApiResult<{ imported: number; duplicates: number; filtered: number; results: Array<{ title: string; saved: boolean; duplicate: boolean; jobId?: number }> }>> {
  return request('POST', '/api/extension/save-batch', { items });
}

export async function checkJob(payload: { title: string; company_name: string; source: string; source_id?: string; location?: string[] }): Promise<ApiResult<CheckResponse>> {
  return request<CheckResponse>('POST', '/api/extension/check', payload);
}

export async function checkBatch(items: Array<{ title: string; company_name: string; source: string; source_id?: string; location?: string[] }>): Promise<ApiResult<{ results: Array<{ index: number; exists: boolean; jobId?: number; status?: string; statusLabel?: string }> }>> {
  return request('POST', '/api/extension/check-batch', { items });
}

export async function getStats(): Promise<ApiResult<StatsResponse>> {
  return request<StatsResponse>('GET', '/api/extension/stats');
}
