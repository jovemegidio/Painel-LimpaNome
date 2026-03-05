const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  const cmds = [
    // Test login
    `curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"credbusiness","password":"Service"}'`,
    // Test admin login
    `curl -s -X POST http://localhost:3001/api/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}'`,
    // Test public site via nginx
    `curl -s -o /dev/null -w '%{http_code}' http://mkt-credbusiness.vps-kinghost.net/login.html`,
    // Test API via nginx
    `curl -s http://mkt-credbusiness.vps-kinghost.net/api/content/settings | head -c 100`
  ];

  let i = 0;
  function next() {
    if (i >= cmds.length) { c.end(); return; }
    const label = ['LOGIN', 'ADMIN LOGIN', 'NGINX HTML', 'NGINX API'][i];
    console.log(`\n=== ${label} ===`);
    c.exec(cmds[i], (err, stream) => {
      let out = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
      stream.on('close', () => {
        console.log(out.toString().substring(0, 500));
        i++;
        next();
      });
    });
  }
  next();
}).connect({ host: '177.153.58.152', port: 22, username: 'root', password: 'Credbusiness2504A@' });
