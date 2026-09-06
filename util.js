function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readJsonBody(req, { limitBytes = 25 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error('payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(Object.assign(new Error('invalid json'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// deviation em minutos: agenda vs. chegada real. status seguindo a mesma
// tolerância observada nos dados históricos originais (+-15 min = on_time).
function computeStatus(scheduledAt, arrivedAt) {
  if (!scheduledAt || !arrivedAt) return { deviation_minutes: null, status: null };
  const dev = Math.round((new Date(arrivedAt).getTime() - new Date(scheduledAt).getTime()) / 60000);
  let status = 'on_time';
  if (dev > 15) status = 'late';
  else if (dev < -15) status = 'early';
  return { deviation_minutes: dev, status };
}

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function dateKeyOf(iso) {
  return (iso || new Date().toISOString()).slice(0, 10);
}

module.exports = { sendJson, readJsonBody, computeStatus, nowSql, dateKeyOf };
