import { NextRequest, NextResponse } from 'next/server';
import type { ApiResponse } from '@/types';

export function jsonResponse<T>(data: T, status = 200): NextResponse {
  const body: ApiResponse<T> = { success: true, data };
  return NextResponse.json(body, { status });
}

export function errorResponse(error: string, status = 400): NextResponse {
  const body: ApiResponse<never> = { success: false, error };
  return NextResponse.json(body, { status });
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): NextResponse {
  const body: ApiResponse<T[]> = {
    success: true,
    data,
    meta: { total, page, limit },
  };
  return NextResponse.json(body);
}

export function parseSearchParams(req: NextRequest) {
  const url = req.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const offset = (page - 1) * limit;
  const sort = url.searchParams.get('sort') || 'created_at';
  const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
  const q = url.searchParams.get('q') || null;

  return { page, limit, offset, sort, order, q };
}

export async function parseJsonBody<T>(req: NextRequest): Promise<T> {
  try {
    return await req.json() as T;
  } catch {
    throw new Error('Invalid JSON body');
  }
}
