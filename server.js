require('./lib/loadEnv')();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const { handleApi, resolvePhotoFile } = require('./lib/api');
const { seed } = require('./lib/seed');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

function servePhoto(req, res, key) {
  const filePath = resolvePhotoFile(key);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('foto não encontrada');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': ext === '.png' ? 'image/png' : 'image/jpeg',
    'Cache-Control': 'public, max-age=86400',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  if (url.pathname.startsWith('/api/')) {
    return handleApi(req, res, url);
  }

  if (url.pathname.startsWith('/photos/')) {
    const key = decodeURIComponent(url.pathname.replace('/photos/', ''));
    return servePhoto(req, res, key);
  }

  return serveStatic(req, res, url.pathname);
});

async function main() {
  try {
    await seed(); // importa o backup automaticamente na primeira execução (banco vazio)
  } catch (err) {
    console.error('[seed] falhou:', err.message);
    console.error('Verifique se a variável de ambiente DATABASE_URL está configurada corretamente.');
  }

  server.listen(PORT, () => {
    console.log(`\n  Chegada Certa rodando na porta ${PORT}`);
    console.log(`  Painel de gestão: /`);
    console.log(`  Fluxo do motorista: /driver.html\n`);
  });
}

main();
