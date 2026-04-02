import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { processRawJobs, type RawExtractedJob } from '@/lib/scraper/hiring-cafe-crawler';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { jsonResponse, errorResponse } from '@/lib/api-utils';
import { cleanJdText } from '@/lib/jd-cleaner';

/** hiring.cafe API job structure */
interface ApiJob {
  id?: string;
  objectID?: string;
  apply_url?: string;
  job_information?: {
    title?: string;
    description?: string;
  };
  v5_processed_job_data?: {
    core_job_title?: string;
    salary_range_min?: number;
    salary_range_max?: number;
    workplace_type?: string;
    location?: string | string[];
    commitment_level?: string;
    employment_type?: string;
  };
  enriched_company_data?: {
    company_name?: string;
    name?: string;
  };
  company_name?: string;
}

function mapApiJobToExtracted(apiJob: ApiJob): RawExtractedJob | null {
  const viewJobId = apiJob.objectID || apiJob.id || '';
  if (!viewJobId) return null;

  const proc = apiJob.v5_processed_job_data;
  const info = apiJob.job_information;
  const company = apiJob.enriched_company_data;

  const title = proc?.core_job_title || info?.title || '';
  if (!title) return null;

  const companyName = company?.company_name || company?.name || apiJob.company_name || '';

  let location = '';
  if (proc?.location) {
    location = Array.isArray(proc.location) ? proc.location.join(', ') : proc.location;
  }

  let salary = '';
  if (proc?.salary_range_min || proc?.salary_range_max) {
    const min = proc.salary_range_min;
    const max = proc.salary_range_max;
    if (min && max) salary = `$${min.toLocaleString()} - $${max.toLocaleString()}`;
    else if (min) salary = `$${min.toLocaleString()}`;
    else if (max) salary = `$${max.toLocaleString()}`;
  }

  let workMode = '';
  if (proc?.workplace_type) {
    const wt = proc.workplace_type.toLowerCase();
    if (wt.includes('remote')) workMode = 'Remote';
    else if (wt.includes('hybrid')) workMode = 'Hybrid';
    else if (wt.includes('onsite') || wt.includes('on-site') || wt.includes('in-office')) workMode = 'Onsite';
    else workMode = proc.workplace_type;
  }

  let commitment = '';
  const empType = proc?.commitment_level || proc?.employment_type || '';
  if (empType) {
    const et = empType.toLowerCase();
    if (et.includes('full')) commitment = 'Full Time';
    else if (et.includes('part')) commitment = 'Part Time';
    else if (et.includes('contract')) commitment = 'Contract';
    else commitment = empType;
  }

  return {
    viewJobId,
    title,
    company: companyName,
    location,
    salary,
    workMode,
    commitment,
    jdText: info?.description ? cleanJdText(info.description) : null,
    applyUrl: apiJob.apply_url || null,
  };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://hiring.cafe',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    const body = await req.json() as { jobs: ApiJob[] };

    if (!body.jobs || !Array.isArray(body.jobs)) {
      return errorResponse('Missing or invalid "jobs" array', 400);
    }

    // Map API jobs to internal format
    const rawJobs: RawExtractedJob[] = [];
    for (const apiJob of body.jobs) {
      const mapped = mapApiJobToExtracted(apiJob);
      if (mapped) rawJobs.push(mapped);
    }

    const result = processRawJobs(rawJobs);

    logOperation({
      operation: 'crawl',
      entity_type: 'batch',
      trigger: 'import',
      details: {
        jobs_received: body.jobs.length,
        jobs_mapped: rawJobs.length,
        ...result,
      },
    });

    const resp = jsonResponse({
      received: body.jobs.length,
      mapped: rawJobs.length,
      ...result,
    });

    // Add CORS headers
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      resp.headers.set(key, value);
    }

    return resp;
  } catch (e) {
    const resp = errorResponse((e as Error).message, 500);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      resp.headers.set(key, value);
    }
    return resp;
  }
}
