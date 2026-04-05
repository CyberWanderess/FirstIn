'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';

export interface Tab {
  key: string;
  label: string;
}

export function TabNav({
  tabs,
  defaultTab,
  activeTab: controlledTab,
  onTabChange,
}: {
  tabs: Tab[];
  defaultTab?: string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = controlledTab ?? searchParams.get('tab') ?? defaultTab ?? tabs[0]?.key;

  const handleClick = useCallback(
    (key: string) => {
      if (onTabChange) {
        onTabChange(key);
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      if (key === (defaultTab ?? tabs[0]?.key)) {
        params.delete('tab');
      } else {
        params.set('tab', key);
      }
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ''}`);
    },
    [onTabChange, searchParams, router, pathname, defaultTab, tabs],
  );

  return (
    <div className="flex gap-1 bg-white border border-zinc-200 rounded-lg p-1 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => handleClick(tab.key)}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === tab.key
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
