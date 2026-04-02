export default function RegisterPage() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#fafafa',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
    }}>
      <div style={{ width: '100%', maxWidth: 384, padding: '0 16px' }}>
        <div style={{
          background: 'white',
          border: '1px solid #e4e4e7',
          borderRadius: 8,
          padding: 32,
        }}>
          <h1 style={{ fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 }}>
            Create Account
          </h1>
          <form method="POST" action="/api/auth/register-form" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                Password <span style={{ color: '#a1a1aa' }}>(min 6 characters)</span>
              </label>
              <input name="password" type="password" required minLength={6} style={{
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
