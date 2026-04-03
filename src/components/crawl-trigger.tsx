'use client';

import { useState } from 'react';

type CrawlState = 'idle' | 'copied';

// Inline crawl script that runs in hiring.cafe console.
// Fetches jobs from hiring.cafe API, then copies JSON to clipboard.
const CRAWL_SCRIPT = `(async()=>{
const P=40;
let s={dateFetchedPastNDays:2};
try{let u=new URL(location.href);let ss=u.searchParams.get('searchState');if(ss){s=JSON.parse(ss);console.log('[FirstIn] Using current search filters from URL (days='+s.dateFetchedPastNDays+')')}}catch{}
let w=window.open('','_blank');
if(!w){console.error('[FirstIn] Popup blocked! Allow popups for hiring.cafe and retry.');throw new Error('Popup blocked')}
w.document.title='FirstIn: Loading...';
w.document.body.innerHTML='<p style="font-family:system-ui;padding:20px">Fetching jobs...</p>';
console.log('[FirstIn] Fetching jobs...');
let all=[],pg=0;
while(pg<100){
let u='/api/search-jobs?s='+encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(s)))))+'&size='+P+'&page='+pg;
let r=await fetch(u);
if(!r.ok){console.error('[FirstIn] API error:',r.status);break}
let d=await r.json();
let h=d.results||[];
all.push(...h);
console.log('[FirstIn] Page',pg+':',h.length,'items (total so far:',all.length+')');
w.document.body.innerHTML='<p style="font-family:system-ui;padding:20px">Page '+(pg+1)+': '+all.length+' jobs so far...</p>';
if(h.length<P)break;
pg++;
await new Promise(r=>setTimeout(r,500));
}
let json=JSON.stringify({jobs:all});
console.log('[FirstIn] Fetched',all.length,'jobs.');
['Google','OpenAI'].forEach(c=>{let m=all.filter(j=>String(j.job_information?.company||j.board_token||'').toLowerCase().includes(c.toLowerCase()));console.log('[FirstIn]',c+':',m.length,'jobs',m.map(j=>j.job_information?.title))});
w.document.title='FirstIn: '+all.length+' jobs — Select All (Ctrl+A) then Copy';
w.document.body.innerHTML='';
let pre=w.document.createElement('pre');pre.style.cssText='word-wrap:break-word;white-space:pre-wrap';pre.textContent=json;w.document.body.appendChild(pre);
})()`;

export function CrawlTrigger() {
  const [state, setState] = useState<CrawlState>('idle');

  function handleCopy() {
    // clipboard API requires HTTPS; use textarea fallback for HTTP
    try {
      const ta = document.createElement('textarea');
      ta.value = CRAWL_SCRIPT;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setState('copied');
      setTimeout(() => setState('idle'), 4000);
    } catch {
      prompt('Copy this script, paste in hiring.cafe console:', CRAWL_SCRIPT);
    }
  }

  if (state === 'copied') {
    return (
      <span className="text-sm text-green-600 font-medium">
        Copied! Go to hiring.cafe → F12 → Console → Paste → Enter
      </span>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 transition-colors"
      title="Copy crawl script, then paste in hiring.cafe browser console"
    >
      Copy Crawl Script
    </button>
  );
}
