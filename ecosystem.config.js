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
      },
      out_file: '/home/ran/.pm2/logs/jobhq-dev-out.log',
      error_file: '/home/ran/.pm2/logs/jobhq-dev-error.log',
    },
  ],
};
