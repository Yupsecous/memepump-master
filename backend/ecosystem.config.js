module.exports = {
  apps : [
    {
      name: 'sol-sniper-pad',
      script: 'src/app.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      watch: '.',
      env_file: '.env'
    },
  ]
};
