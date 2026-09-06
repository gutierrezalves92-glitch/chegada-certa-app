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

// Horário-alvo fixo: 07:00 (horário de Brasília) do mesmo dia da chegada.
// Toda base/perna é cobrada pelo mesmo horário — o que passar disso é atraso.
const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000; // America/Sao_Paulo = UTC-3 (sem horário de verão desde 2019)
const TARGET_HOUR_LOCAL = 7;

function targetForArrival(arrivedAtIso) {
  const arrivedMs = new Date(arrivedAtIso).getTime();
  const localMs = arrivedMs - BRAZIL_OFFSET_MS; // instante equivalente representado em campos UTC
  const localDate = new Date(localMs);
  const targetLocalMs = Date.UTC(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth(),
    localDate.getUTCDate(),
    TARGET_HOUR_LOCAL,
    0,
    0,
    0
  );
  return new Date(targetLocalMs + BRAZIL_OFFSET_MS);
}

// deviation em minutos: horário-alvo (07:00) vs. chegada real. Calculado sempre,
// para todas as pernas — não depende mais de um horário agendado manualmente.
function computeStatus(arrivedAt) {
  if (!arrivedAt) return { scheduled_at: null, deviation_minutes: null, status: null };
  const target = targetForArrival(arrivedAt);
  const dev = Math.round((new Date(arrivedAt).getTime() - target.getTime()) / 60000);
  const status = dev > 0 ? 'late' : 'on_time';
  return { scheduled_at: target.toISOString(), deviation_minutes: dev, status };
}

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function dateKeyOf(iso) {
  return (iso || new Date().toISOString()).slice(0, 10);
}

module.exports = { sendJson, readJsonBody, computeStatus, nowSql, dateKeyOf };
