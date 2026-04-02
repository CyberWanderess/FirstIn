export default function LoginPage() {
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
            FirstIn
          </h1>
          <form method="POST" action="/api/auth/login-form" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Email</label>
              <input name="email" type="email" required style={{
                width: '100%', border: '1px solid #d4d4d8', borderRadius: 6, padding: '8px 12px', fontSize: 14,
                boxSizing: 'border-box',
              }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Password</label>
              <input name="password" type="password" required style={{
                width: '100%', border: '1px solid #d4d4d8', borderRadius: 6, padding: '8px 12px', fontSize: 14,
                boxSizing: 'border-box',
              }} />
            </div>
            <button type="submit" style={{
              width: '100%', padding: '8px 0', fontSize: 14, fontWeight: 500,
              background: '#18181b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer',
            }}>
              Sign In
            </button>
          </form>
          <p style={{ marginTop: 16, textAlign: 'center', fontSize: 14, color: '#71717a' }}>
            No account? <a href="/register" style={{ color: '#18181b', fontWeight: 500 }}>Register</a>
          </p>
        </div>
      </div>
    </div>
  );
}
