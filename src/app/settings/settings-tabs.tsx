'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TabNav } from '@/components/tab-nav';
import { SettingsClient } from './settings-client';
import { RulesClient } from '../rules/rules-client';

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'rules', label: 'Rules' },
];

function SettingsTabsContent({
  initialSettings,
  initialRules,
  enableCrawler,
}: {
  initialSettings: unknown[];
  initialRules: unknown[];
  enableCrawler: boolean;
}) {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'general';

  return (
    <div className="space-y-4">
      <TabNav tabs={TABS} defaultTab="general" />

      {tab === 'general' && (
        <SettingsClient
          initialSettings={initialSettings as never[]}
          enableCrawler={enableCrawler}
        />
      )}
      {tab === 'rules' && (
        <RulesClient initialRules={initialRules as never[]} />
      )}
    </div>
  );
}

export function SettingsPageTabs({
  initialSettings,
  initialRules,
  enableCrawler,
}: {
  initialSettings: unknown[];
  initialRules: unknown[];
  enableCrawler: boolean;
}) {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-400">Loading...</div>}>
      <SettingsTabsContent
        initialSettings={initialSettings}
        initialRules={initialRules}
        enableCrawler={enableCrawler}
      />
    </Suspense>
  );
}
