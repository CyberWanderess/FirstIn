export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const inspector = await import('node:inspector');
  const fs = await import('node:fs');
  const path = await import('node:path');

  let busy = false;
  process.on('SIGUSR2', () => {
    if (busy) {
      console.log('[sigusr2] profile already in progress, ignoring');
      return;
    }
    busy = true;
    const session = new inspector.Session();
    try {
      session.connect();
    } catch (err) {
      console.log(`[sigusr2] connect failed: ${err}`);
      busy = false;
      return;
    }
    session.post('Profiler.enable', (e1) => {
      if (e1) { console.log(`[sigusr2] enable failed: ${e1}`); session.disconnect(); busy = false; return; }
      session.post('Profiler.start', (e2) => {
        if (e2) { console.log(`[sigusr2] start failed: ${e2}`); session.disconnect(); busy = false; return; }
        console.log('[sigusr2] CPU profiling for 5s...');
        setTimeout(() => {
          session.post('Profiler.stop', (e3, r) => {
            try {
              if (e3 || !r) { console.log(`[sigusr2] stop failed: ${e3}`); return; }
              const file = path.join(process.cwd(), `cpu-profile-${Date.now()}.cpuprofile`);
              fs.writeFileSync(file, JSON.stringify(r.profile));
              console.log(`[sigusr2] CPU profile written: ${file}`);
            } finally {
              session.disconnect();
              busy = false;
            }
          });
        }, 5000);
      });
    });
  });
  console.log(`[instrumentation] SIGUSR2 → 5s CPU profile registered (pid=${process.pid})`);
}
