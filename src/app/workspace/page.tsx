'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TabNav } from '@/components/tab-nav';
import ImportContent from './import-content';
import { CompaniesTab, JobsTab, DeepAnalysisTab, RejectionsTab, RecheckTab, AutoEvalLogTab } from './evaluate-content';
import { PromptsTab } from './prompts-content';

const TABS = [
  { key: 'import', label: 'Import' },
  { key: 'companies', label: 'Companies' },
  { key: 'evaluation', label: 'Evaluation' },
  { key: 'recheck', label: 'Recheck' },
  { key: 'deep', label: 'Deep Analysis' },
  { key: 'rejections', label: 'Rejections' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'auto-eval', label: 'Auto Eval Log' },
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
      {tab === 'recheck' && <RecheckTab />}
      {tab === 'deep' && <DeepAnalysisTab />}
      {tab === 'rejections' && <RejectionsTab />}
      {tab === 'prompts' && <PromptsTab />}
      {tab === 'auto-eval' && <AutoEvalLogTab />}
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
