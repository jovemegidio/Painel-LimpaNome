// PM2 Ecosystem Configuration
module.exports = {
    apps: [{
        name: 'mi2',
        script: 'server.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '512M',
        env: {
            NODE_ENV: 'production',
            PORT: 3001
        },
        error_file: '/var/www/mi2/logs/error.log',
        out_file: '/var/www/mi2/logs/out.log',
        log_file: '/var/www/mi2/logs/combined.log',
        time: true
    }]
};
