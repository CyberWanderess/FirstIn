import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { validateSession, registerExtensionToken } from '@/lib/auth-db';
import { runWithUser } from '@/lib/db';
import { upsertSetting } from '@/lib/repositories/settings-repository';

export default async function ExtensionLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ ext?: string }>;
}) {
  const { ext } = await searchParams;

  if (!ext) {
    return (
      <div style={{ padding: 48, textAlign: 'center', fontFamily: 'system-ui' }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Missing Extension ID</h1>
        <p style={{ color: '#666' }}>This page should be opened from the FirstIn browser extension.</p>
      </div>
    );
  }

  // Check session
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) {
    redirect(`/login?redirect=${encodeURIComponent(`/login/extension?ext=${ext}`)}`);
  }

  const user = validateSession(sessionToken);
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/login/extension?ext=${ext}`)}`);
  }

  // Generate extension token
  const token = randomBytes(32).toString('hex');
  runWithUser(user.id, () => {
    upsertSetting('extension_api_token', token, 'API token for Chrome Extension');
  });
  registerExtensionToken(token, user.id);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#fafafa',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        background: 'white', border: '1px solid #e4e4e7', borderRadius: 8,
        padding: 32, maxWidth: 400, textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>FirstIn</h1>
        <p id="status" style={{ fontSize: 14, color: '#059669', marginBottom: 8 }}>
          Connecting to extension...
        </p>
        <p style={{ fontSize: 12, color: '#999' }}>
          If nothing happens, make sure the extension is installed and try again.
        </p>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          var extId = ${JSON.stringify(ext)};
          var token = ${JSON.stringify(token)};
          var statusEl = document.getElementById('status');

          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage(extId, { type: 'auth-token', token: token }, function(response) {
              if (chrome.runtime.lastError) {
                statusEl.textContent = 'Could not connect to extension. Make sure it is installed.';
                statusEl.style.color = '#dc2626';
                return;
              }
              if (response && response.ok) {
                statusEl.textContent = 'Connected! You can close this tab.';
                statusEl.style.color = '#059669';
                try { window.close(); } catch(e) {}
              } else {
                statusEl.textContent = 'Extension did not respond. Try again.';
                statusEl.style.color = '#dc2626';
              }
            });
          } else {
            statusEl.textContent = 'Chrome extension API not available.';
            statusEl.style.color = '#dc2626';
          }
        })();
      `}} />
    </div>
  );
}
