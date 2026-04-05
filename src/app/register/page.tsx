import { getUserCount, validateInviteCode } from '@/lib/auth-db';

const ERROR_MESSAGES: Record<string, string> = {
  missing: 'Please fill in all fields',
  short_password: 'Password must be at least 8 characters',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  invite_required: 'Registration requires an invitation',
  invalid_invite: 'Invalid or expired invite code',
  failed: 'Registration failed, please try again',
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; invite?: string }> }) {
  const { error, invite } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  const userCount = getUserCount();
  const needsInvite = userCount > 0;

  // If registration requires invite but none provided
  if (needsInvite && !invite) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#fafafa',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
      }}>
        <div style={{ width: '100%', maxWidth: 384, padding: '0 16px' }}>
          <div style={{
            background: 'white', border: '1px solid #e4e4e7',
            borderRadius: 8, padding: 32, textAlign: 'center',
          }}>
            <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>FirstIn</h1>
            <p style={{ color: '#71717a', fontSize: 14, marginBottom: 16 }}>
              Registration is by invitation only.
            </p>
            <p style={{ color: '#71717a', fontSize: 14 }}>
              Please ask an administrator for an invite link.
            </p>
            <p style={{ marginTop: 24, fontSize: 14, color: '#71717a' }}>
              Already have an account? <a href="/login" style={{ color: '#18181b', fontWeight: 500 }}>Sign In</a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // If invite provided, validate it
  if (needsInvite && invite) {
    const valid = validateInviteCode(invite);
    if (!valid) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: '#fafafa',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{ width: '100%', maxWidth: 384, padding: '0 16px' }}>
            <div style={{
              background: 'white', border: '1px solid #e4e4e7',
              borderRadius: 8, padding: 32, textAlign: 'center',
            }}>
              <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>FirstIn</h1>
              <p style={{ color: '#dc2626', fontSize: 14, marginBottom: 16 }}>
                This invite link is invalid or has expired.
              </p>
              <p style={{ color: '#71717a', fontSize: 14 }}>
                Please ask an administrator for a new invite link.
              </p>
              <p style={{ marginTop: 24, fontSize: 14, color: '#71717a' }}>
                Already have an account? <a href="/login" style={{ color: '#18181b', fontWeight: 500 }}>Sign In</a>
              </p>
            </div>
          </div>
        </div>
      );
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#fafafa',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <div style={{ width: '100%', maxWidth: 384, padding: '0 16px' }}>
        <div style={{
          background: 'white', border: '1px solid #e4e4e7',
          borderRadius: 8, padding: 32,
        }}>
          <h1 style={{ fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 }}>
            {needsInvite ? 'You\'re Invited!' : 'Create Account'}
          </h1>
          {errorMessage && (
            <p style={{ color: '#dc2626', fontSize: 14, textAlign: 'center', marginBottom: 16 }}>
              {errorMessage}
            </p>
          )}
          <form method="POST" action="/api/auth/register-form" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {invite && <input type="hidden" name="invite" value={invite} />}
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                Display Name <span style={{ color: '#a1a1aa' }}>(optional)</span>
              </label>
              <input name="display_name" type="text" style={{
                width: '100%', border: '1px solid #d4d4d8', borderRadius: 6, padding: '8px 12px', fontSize: 14,
                boxSizing: 'border-box',
              }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Email</label>
              <input name="email" type="email" required style={{
                width: '100%', border: '1px solid #d4d4d8', borderRadius: 6, padding: '8px 12px', fontSize: 14,
                boxSizing: 'border-box',
              }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                Password <span style={{ color: '#a1a1aa' }}>(min 8 characters)</span>
              </label>
              <input name="password" type="password" required minLength={8} style={{
                width: '100%', border: '1px solid #d4d4d8', borderRadius: 6, padding: '8px 12px', fontSize: 14,
                boxSizing: 'border-box',
              }} />
            </div>
            <button type="submit" style={{
              width: '100%', padding: '8px 0', fontSize: 14, fontWeight: 500,
              background: '#18181b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer',
            }}>
              Create Account
            </button>
          </form>
          <p style={{ marginTop: 16, textAlign: 'center', fontSize: 14, color: '#71717a' }}>
            Already have an account? <a href="/login" style={{ color: '#18181b', fontWeight: 500 }}>Sign In</a>
          </p>
        </div>
      </div>
    </div>
  );
}
