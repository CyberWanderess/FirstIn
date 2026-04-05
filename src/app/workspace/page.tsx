'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TabNav } from '@/components/tab-nav';
import ImportContent from './import-content';
import { CompaniesTab, JobsTab, DeepAnalysisTab, RejectionsTab } from './evaluate-content';

const TABS = [
  { key: 'import', label: 'Import' },
  { key: 'companies', label: 'Companies' },
  { key: 'evaluation', label: 'Evaluation' },
  { key: 'deep', label: 'Deep Analysis' },
  { key: 'rejections', label: 'Rejections' },
];

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'import';

  return (
    <div className="space-y-4">
      <TabNav tabs={TABS} defaultTab="import" />

      {tab === 'import' && <ImportContent />}
      {tab === 'companies' && <CompaniesTab />}
      {tab === 'evaluation' && <JobsTab />}
      {tab === 'deep' && <DeepAnalysisTab />}
      {tab === 'rejections' && <RejectionsTab />}
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-400">Loading...</div>}>
      <WorkspaceContent />
    </Suspense>
  );
}
