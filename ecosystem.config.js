module.exports = {
  apps: [
    {
      name: 'jobhq-dev',
      cwd: '/home/ran/projects/jobhq-user-edition',
      script: 'bash',
      args: ['-c', 'exec npx next start -p 4001'],
      max_memory_restart: '1G',
      cron_restart: '0 */6 * * *',
      env: {
        TZ: 'America/Los_Angeles',
        // Enable Node inspector on localhost only.
        // SSH tunnel: ssh -N -L 9229:127.0.0.1:9229 <host>, then chrome://inspect
        NODE_OPTIONS: '--inspect=127.0.0.1:9229',
      },
      out_file: '/home/ran/.pm2/logs/jobhq-dev-out.log',
      error_file: '/home/ran/.pm2/logs/jobhq-dev-error.log',
    },
    {
      name: 'perf-pulse',
      cwd: '/home/ran/projects/jobhq-user-edition',
      script: 'bash',
      args: ['-c', 'while true; do bash scripts/perf-pulse.sh; sleep 60; done'],
      autorestart: true,
      max_memory_restart: '50M',
      out_file: '/home/ran/.pm2/logs/perf-pulse-out.log',
      error_file: '/home/ran/.pm2/logs/perf-pulse-error.log',
    },
  ],
};
