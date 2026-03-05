// PM2 Ecosystem Configuration
module.exports = {
    apps: [{
        name: 'credbusiness',
        script: 'server.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '512M',
        env: {
            NODE_ENV: 'production',
            PORT: 3001
        },
        error_file: '/var/www/credbusiness/logs/error.log',
        out_file: '/var/www/credbusiness/logs/out.log',
        log_file: '/var/www/credbusiness/logs/combined.log',
        time: true
    }]
};
