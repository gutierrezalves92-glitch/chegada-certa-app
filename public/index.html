const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { sendJson, readJsonBody, computeStatus, dateKeyOf } = require('./util');

const PHOTOS_DIR = process.env.PHOTOS_DIR
  ? path.resolve(process.env.PHOTOS_DIR)
  : path.join(__dirname, '..', 'uploads', 'photos');
const INTERNAL_UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'photos');
try { fs.mkdirSync(INTERNAL_UPLOADS_DIR, { recursive: true }); } catch (e) { /* filesystem pode ser somente leitura em produção */ }

function qp(url) {
  return Object.fromEntries(url.searchParams.entries());
}

function buildWhere(conditions) {
  const clauses = [];
  const params = [];
  for (const [sql, val] of conditions) {
    if (val === undefined || val === null || val === '') continue;
    clauses.push(sql);
    params.push(val);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// ---------------------------------------------------------------- bases / drivers / stats

async function listBases() {
  const rows = await db.all(
    `SELECT DISTINCT base AS name FROM arrivals WHERE base IS NOT NULL
     UNION SELECT DISTINCT origin_base AS name FROM journeys WHERE origin_base IS NOT NULL
     ORDER BY name`
  );
  return rows.map((r) => r.name);
}

async function listDrivers() {
  return db.all(
    `SELECT driver_name, plate, COUNT(*) AS routes, MAX(started_at) AS last_route_at
     FROM routes GROUP BY driver_name, plate ORDER BY last_route_at DESC`
  );
}

async function statsOverview(from, to) {
  const where = buildWhere([
    ['date(arrived_at) >= date(?)', from],
    ['date(arrived_at) <= date(?)', to],
  ]);
  const totals = await db.all(
    `SELECT status, COUNT(*) AS n, AVG(deviation_minutes) AS avg_dev
     FROM arrivals ${where.sql} GROUP BY status`,
    where.params
  );
  const byBase = await db.all(
    `SELECT base, COUNT(*) AS n,
            SUM(CASE WHEN status='late' THEN 1 ELSE 0 END) AS late_n,
            AVG(deviation_minutes) AS avg_dev
     FROM arrivals ${where.sql} GROUP BY base ORDER BY late_n DESC, n DESC LIMIT 15`,
    where.params
  );
  const totalArrivals = totals.reduce((s, r) => s + Number(r.n), 0);
  const openRoutes = Number((await db.get('SELECT COUNT(*) n FROM routes WHERE completed_at IS NULL')).n);
  const photosCount = Number((await db.get('SELECT COUNT(*) n FROM arrivals WHERE delivery_photo_key IS NOT NULL')).n);
  return {
    totalArrivals,
    byStatus: totals.map((r) => ({ ...r, n: Number(r.n), avg_dev: r.avg_dev == null ? null : Number(r.avg_dev) })),
    byBase: byBase.map((r) => ({ ...r, n: Number(r.n), late_n: Number(r.late_n), avg_dev: r.avg_dev == null ? null : Number(r.avg_dev) })),
    openRoutes,
    photosCount,
  };
}

// ---------------------------------------------------------------- routes

async function listRoutes(q) {
  const where = buildWhere([
    ['date(r.started_at) = date(?)', q.date],
    ['r.driver_name ILIKE ?', q.driver ? `%${q.driver}%` : undefined],
    ['r.plate ILIKE ?', q.plate ? `%${q.plate}%` : undefined],
    ...(q.status === 'open' ? [['r.completed_at IS NULL', 1]] : []),
    ...(q.status === 'completed' ? [['r.completed_at IS NOT NULL', 1]] : []),
    ...(q.status === 'management_closed' ? [['r.management_closed_at IS NOT NULL', 1]] : []),
    ...(q.status === 'pending_review' ? [['r.completed_at IS NOT NULL AND r.management_closed_at IS NULL', 1]] : []),
  ]);
  const limit = Math.min(parseInt(q.limit || '100', 10) || 100, 500);
  const offset = parseInt(q.offset || '0', 10) || 0;
  const rows = await db.all(
    `SELECT r.*,
      (SELECT COUNT(*) FROM journeys j WHERE j.route_id = r.id) AS legs,
      (SELECT COUNT(*) FROM arrivals a WHERE a.route_id = r.id) AS arrivals_count,
      (SELECT COUNT(*) FROM arrivals a WHERE a.route_id = r.id AND a.status='late') AS late_count
     FROM routes r ${where.sql}
     ORDER BY r.started_at DESC NULLS LAST LIMIT ? OFFSET ?`,
    [...where.params, limit, offset]
  );
  const total = Number((await db.get(`SELECT COUNT(*) n FROM routes r ${where.sql}`, where.params)).n);
  return { rows: rows.map(normalizeCounts), total };
}
function normalizeCounts(r) {
  return { ...r, legs: Number(r.legs), arrivals_count: Number(r.arrivals_count), late_count: Number(r.late_count) };
}

async function getRoute(id) {
  const route = await db.get('SELECT * FROM routes WHERE id = ?', [id]);
  if (!route) return null;
  const journeys = await db.all('SELECT * FROM journeys WHERE route_id = ? ORDER BY leg_number, started_at', [id]);
  const arrivals = await db.all('SELECT * FROM arrivals WHERE route_id = ? ORDER BY leg_number, arrived_at', [id]);
  const stops = await db.all('SELECT * FROM route_stops WHERE route_id = ? ORDER BY seq_number', [id]);
  return { ...route, journeys, arrivals, stops };
}

async function getRouteByToken(token) {
  const route = await db.get('SELECT * FROM routes WHERE update_token = ?', [token]);
  if (!route) return null;
  return getRoute(route.id);
}

async function getRouteByPlate(plate) {
  // Como agora dá pra pré-lançar a rota de um dia futuro com antecedência, pode existir mais
  // de uma rota (de dias diferentes) pra mesma placa ao mesmo tempo. Por isso, primeiro tenta
  // achar a rota cujo dia de validade é HOJE — é essa que o motorista deve ver. Só se não
  // houver nenhuma de hoje é que cai pra "a mais recente" (ex: comprovante de uma rota
  // concluída mais cedo, ou uma rota futura pré-lançada antes da hora).
  const todayRoute = await db.get(
    `SELECT * FROM routes WHERE UPPER(plate) = UPPER(?) AND date(started_at) = date(?) ORDER BY started_at DESC LIMIT 1`,
    [plate, new Date().toISOString()]
  );
  const route = todayRoute || await db.get(
    `SELECT * FROM routes WHERE UPPER(plate) = UPPER(?) ORDER BY started_at DESC NULLS LAST LIMIT 1`,
    [plate]
  );
  if (!route) return null;
  if (route.completed_at) {
    const sameDay = await db.get('SELECT (date(?) = date(?)) AS same_day', [route.started_at, new Date().toISOString()]);
    if (!sameDay || !sameDay.same_day) return null;
  }
  return getRoute(route.id);
}

async function createRoute(body) {
  const token = crypto.randomUUID();
  const startedAt = body.started_at || new Date().toISOString();
  // uma mesma placa não pode ter duas rotas no mesmo dia (o dia de validade da programação,
  // escolhido no lançamento) — evita duplicidade de informação.
  const dup = await db.get(
    'SELECT id FROM routes WHERE UPPER(plate) = UPPER(?) AND date(started_at) = date(?) LIMIT 1',
    [body.plate, startedAt]
  );
  if (dup) {
    const [y, m, d] = startedAt.slice(0, 10).split('-');
    const dateLabel = y && m && d ? `${d}/${m}/${y}` : startedAt;
    const err = new Error(
      `A placa ${body.plate} já tem uma rota lançada para o dia ${dateLabel} (rota #${dup.id}). Cada placa só pode ter uma rota por dia.`
    );
    err.statusCode = 409;
    throw err;
  }
  const row = await db.get(
    `INSERT INTO routes (id, driver_name, plate, notes, started_at, update_token)
     VALUES (nextval('routes_id_seq'), ?, ?, ?, ?, ?) RETURNING id`,
    [body.driver_name, body.plate, body.notes || '', startedAt, token]
  );
  const routeId = Number(row.id);
  const bases = Array.isArray(body.bases)
    ? body.bases.map((b) => String(b).trim()).filter(Boolean)
    : [];
  for (let i = 0; i < bases.length; i++) {
    await db.run(
      `INSERT INTO route_stops (id, route_id, seq_number, base) VALUES (nextval('route_stops_id_seq'), ?, ?, ?)`,
      [routeId, i + 1, bases[i]]
    );
  }
  return getRoute(routeId);
}

async function completeRoute(id) {
  await db.run('UPDATE routes SET completed_at = ? WHERE id = ?', [new Date().toISOString(), id]);
  return getRoute(id);
}

async function managementCloseRoute(id, email, close) {
  if (close) {
    await db.run(
      'UPDATE routes SET management_closed_at = ?, management_closed_by_email = ? WHERE id = ?',
      [new Date().toISOString(), email || null, id]
    );
  } else {
    await db.run('UPDATE routes SET management_closed_at = NULL, management_closed_by_email = NULL WHERE id = ?', [id]);
  }
  return getRoute(id);
}

// ---------------------------------------------------------------- journeys

async function listJourneys(q) {
  const where = buildWhere([
    ['route_id = ?', q.route_id],
    ['base = ?', q.base],
  ]);
  return db.all(`SELECT * FROM journeys ${where.sql} ORDER BY started_at DESC LIMIT 500`, where.params);
}

async function startJourney(body) {
  const startedAt = body.started_at || new Date().toISOString();
  const row = await db.get(
    `INSERT INTO journeys
      (id, route_id, driver_name, plate, base, origin_base, leg_number, notes, started_at,
       start_latitude, start_longitude, start_accuracy_meters, start_location_captured_at,
       driver_update_token)
     VALUES (nextval('journeys_id_seq'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      body.route_id,
      body.driver_name || null,
      body.plate || null,
      body.base,
      body.origin_base || 'HUB PRINCIPAL',
      body.leg_number || 1,
      body.notes || '',
      startedAt,
      body.start_latitude ?? null,
      body.start_longitude ?? null,
      body.start_accuracy_meters ?? null,
      body.start_latitude != null ? startedAt : null,
      body.driver_update_token || null,
    ]
  );
  return db.get('SELECT * FROM journeys WHERE id = ?', [row.id]);
}

async function completeJourney(id, arrivalId) {
  await db.run('UPDATE journeys SET completed_at = ?, arrival_id = COALESCE(?, arrival_id) WHERE id = ?', [
    new Date().toISOString(),
    arrivalId || null,
    id,
  ]);
  return db.get('SELECT * FROM journeys WHERE id = ?', [id]);
}

// ---------------------------------------------------------------- arrivals

async function listArrivals(q) {
  const where = buildWhere([
    ['base = ?', q.base],
    ['status = ?', q.status],
    ['driver_name ILIKE ?', q.driver ? `%${q.driver}%` : undefined],
    ['plate = ?', q.plate],
    ['route_id = ?', q.route_id],
    ['date(arrived_at) >= date(?)', q.date_from],
    ['date(arrived_at) <= date(?)', q.date_to],
  ]);
  const limit = Math.min(parseInt(q.limit || '100', 10) || 100, 1000);
  const offset = parseInt(q.offset || '0', 10) || 0;
  const rows = await db.all(
    `SELECT * FROM arrivals ${where.sql} ORDER BY arrived_at DESC NULLS LAST LIMIT ? OFFSET ?`,
    [...where.params, limit, offset]
  );
  const total = Number((await db.get(`SELECT COUNT(*) n FROM arrivals ${where.sql}`, where.params)).n);
  return { rows, total };
}

async function getArrival(id) {
  return db.get('SELECT * FROM arrivals WHERE id = ?', [id]);
}

async function createArrival(body) {
  const arrivedAt = body.arrived_at || new Date().toISOString();
  const { scheduled_at, deviation_minutes, status } = computeStatus(arrivedAt);
  // tempo da perna: sempre calculado a partir da saída do HUB/base anterior até a chegada.
  const travelMinutes = body.hub_departed_at
    ? Math.round((new Date(arrivedAt).getTime() - new Date(body.hub_departed_at).getTime()) / 60000)
    : null;
  const row = await db.get(
    `INSERT INTO arrivals
      (id, route_id, journey_id, driver_name, plate, base, origin_base, leg_number,
       scheduled_at, arrived_at, deviation_minutes, status, notes,
       latitude, longitude, accuracy_meters, location_captured_at, driver_update_token,
       base_open_on_arrival, base_status_recorded_at, base_opened_at,
       unloading_delay_reason, unloading_delay_details,
       hub_departed_at, travel_minutes, hub_latitude, hub_longitude, hub_accuracy_meters,
       hub_location_captured_at, collected_bags, delivery_photo_required)
     VALUES (nextval('arrivals_id_seq'), ?,?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?, ?,?, ?,?,?,?,?, ?,?,?)
     RETURNING id`,
    [
      body.route_id ?? null,
      body.journey_id ?? null,
      body.driver_name || null,
      body.plate || null,
      body.base,
      body.origin_base || 'HUB PRINCIPAL',
      body.leg_number || 1,
      scheduled_at,
      arrivedAt,
      deviation_minutes,
      status,
      body.notes || '',
      body.latitude ?? null,
      body.longitude ?? null,
      body.accuracy_meters ?? null,
      body.latitude != null ? arrivedAt : null,
      body.driver_update_token || null,
      body.base_open_on_arrival ?? null,
      body.base_open_on_arrival != null ? new Date().toISOString() : null,
      body.base_open_on_arrival === 1 ? arrivedAt : null,
      body.unloading_delay_reason || null,
      body.unloading_delay_details || null,
      body.hub_departed_at || null,
      travelMinutes,
      body.hub_latitude ?? null,
      body.hub_longitude ?? null,
      body.hub_accuracy_meters ?? null,
      body.hub_departed_at ? new Date().toISOString() : null,
      body.collected_bags ?? null,
      body.delivery_photo_required ? 1 : 0,
    ]
  );
  const id = Number(row.id);
  if (body.journey_id) await completeJourney(body.journey_id, id);
  if (body.route_id) await advanceRoute(body.route_id, body.leg_number || 1, body.base);
  return getArrival(id);
}

// Se a rota tem um roteiro pré-definido (route_stops), avança automaticamente para a
// próxima base assim que uma chegada é registrada — o motorista não digita destino.
// Se não houver mais bases no roteiro, a rota é concluída sozinha. Rotas sem roteiro
// (fluxo antigo, sem route_stops) não são afetadas por esta função.
async function advanceRoute(routeId, currentLegNumber, arrivedBase) {
  const totalStops = await db.get('SELECT COUNT(*) n FROM route_stops WHERE route_id = ?', [routeId]);
  if (Number(totalStops.n) === 0) return; // rota sem roteiro pré-definido — nada a fazer
  const nextStop = await db.get(
    'SELECT * FROM route_stops WHERE route_id = ? AND seq_number = ?',
    [routeId, currentLegNumber + 1]
  );
  if (nextStop) {
    const route = await db.get('SELECT * FROM routes WHERE id = ?', [routeId]);
    if (!route) return;
    await db.run(
      `INSERT INTO journeys (id, route_id, driver_name, plate, base, origin_base, leg_number, started_at)
       VALUES (nextval('journeys_id_seq'), ?, ?, ?, ?, ?, ?, ?)`,
      [routeId, route.driver_name, route.plate, nextStop.base, arrivedBase, currentLegNumber + 1, new Date().toISOString()]
    );
  } else {
    await completeRoute(routeId);
  }
}

async function updateArrival(id, body) {
  const current = await getArrival(id);
  if (!current) return null;
  const fields = [
    'notes', 'base_open_on_arrival', 'base_opened_at', 'unloading_delay_reason',
    'unloading_delay_details', 'collected_bags',
  ];
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`);
      params.push(body[f]);
    }
  }
  if (body.base_open_on_arrival !== undefined) {
    sets.push('base_status_recorded_at = ?');
    params.push(new Date().toISOString());
  }
  if (sets.length === 0) return current;
  params.push(id);
  await db.run(`UPDATE arrivals SET ${sets.join(', ')} WHERE id = ?`, params);
  return getArrival(id);
}

async function savePhoto(id, { data_base64, name, type }) {
  const arrival = await getArrival(id);
  if (!arrival) return null;
  const buf = Buffer.from(data_base64, 'base64');
  const ext = (type && type.split('/')[1]) || (name && name.split('.').pop()) || 'jpg';
  const filename = `${crypto.randomUUID()}.${ext}`;
  const dir = path.join(INTERNAL_UPLOADS_DIR, 'arrivals', String(id));
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buf);
  } catch (e) {
    const err = new Error('Este servidor não tem armazenamento de arquivos permanente — a foto não pôde ser salva.');
    err.statusCode = 501;
    throw err;
  }
  const key = `arrivals/${id}/${filename}`;
  await db.run(
    `UPDATE arrivals SET delivery_photo_key = ?, delivery_photo_name = ?, delivery_photo_type = ?,
       delivery_photo_bytes = ?, delivery_photo_uploaded_at = ? WHERE id = ?`,
    [key, name || filename, type || 'image/jpeg', buf.length, new Date().toISOString(), id]
  );
  return getArrival(id);
}

function resolvePhotoFile(key) {
  const candidates = [path.join(PHOTOS_DIR, key), path.join(INTERNAL_UPLOADS_DIR, key)];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ---------------------------------------------------------------- bag loads / events / closures / fleet

async function listBagLoads(q) {
  const where = buildWhere([
    ['date_key = ?', q.date_key],
    ['base = ?', q.base],
  ]);
  return db.all(`SELECT * FROM bag_loads ${where.sql} ORDER BY date_key DESC, base`, where.params);
}

async function upsertBagLoad(body) {
  const dateKey = body.date_key || dateKeyOf();
  const updatedAt = new Date().toISOString();
  await db.run(
    `INSERT INTO bag_loads (id, date_key, base, loaded_bags, operator_email, updated_at)
     VALUES (nextval('bag_loads_id_seq'), ?, ?, ?, ?, ?)
     ON CONFLICT (date_key, base) DO UPDATE SET
       loaded_bags = excluded.loaded_bags,
       operator_email = excluded.operator_email,
       updated_at = excluded.updated_at`,
    [dateKey, body.base, body.loaded_bags || 0, body.operator_email || null, updatedAt]
  );
  const row = await db.get('SELECT * FROM bag_loads WHERE date_key = ? AND base = ?', [dateKey, body.base]);
  await db.run(
    `INSERT INTO bag_events (id, date_key, base, event_type, previous_bags, new_bags, operator_email, occurred_at)
     VALUES (nextval('bag_events_id_seq'), ?, ?, 'load_updated', ?, ?, ?, ?)`,
    [dateKey, body.base, body.previous_bags ?? null, body.loaded_bags || 0, body.operator_email || null, updatedAt]
  );
  return row;
}

async function listBagEvents(q) {
  const where = buildWhere([
    ['date_key = ?', q.date_key],
    ['base = ?', q.base],
  ]);
  return db.all(`SELECT * FROM bag_events ${where.sql} ORDER BY occurred_at DESC NULLS LAST LIMIT 500`, where.params);
}

async function listClosures(q) {
  const where = buildWhere([['date_key = ?', q.date_key]]);
  return db.all(`SELECT * FROM bag_cycle_closures ${where.sql} ORDER BY date_key DESC`, where.params);
}

async function setClosure(body) {
  const dateKey = body.date_key || dateKeyOf();
  const phase = body.phase || 'reconciliation';
  const now = new Date().toISOString();
  const existing = await db.get('SELECT * FROM bag_cycle_closures WHERE date_key = ? AND phase = ?', [dateKey, phase]);
  if (body.action === 'close') {
    if (existing) {
      await db.run(
        'UPDATE bag_cycle_closures SET closed_at = ?, closed_by_email = ?, reopened_at = NULL, reopened_by_email = NULL, updated_at = ? WHERE id = ?',
        [now, body.email || null, now, existing.id]
      );
    } else {
      await db.run(
        `INSERT INTO bag_cycle_closures (id, date_key, phase, closed_at, closed_by_email, updated_at)
         VALUES (nextval('bag_cycle_closures_id_seq'), ?, ?, ?, ?, ?)`,
        [dateKey, phase, now, body.email || null, now]
      );
    }
    await db.run(
      `INSERT INTO bag_events (id, date_key, base, event_type, operator_email, occurred_at)
       VALUES (nextval('bag_events_id_seq'), ?, NULL, 'reconciliation_closed', ?, ?)`,
      [dateKey, body.email || null, now]
    );
  } else if (body.action === 'reopen' && existing) {
    await db.run(
      'UPDATE bag_cycle_closures SET reopened_at = ?, reopened_by_email = ?, updated_at = ? WHERE id = ?',
      [now, body.email || null, now, existing.id]
    );
    await db.run(
      `INSERT INTO bag_events (id, date_key, base, event_type, operator_email, occurred_at)
       VALUES (nextval('bag_events_id_seq'), ?, NULL, 'reconciliation_reopened', ?, ?)`,
      [dateKey, body.email || null, now]
    );
  }
  return db.get('SELECT * FROM bag_cycle_closures WHERE date_key = ? AND phase = ?', [dateKey, phase]);
}

async function listFleetSchedules(q) {
  const where = buildWhere([
    ['date_key = ?', q.date_key],
    ['plate = ?', q.plate],
  ]);
  return db.all(`SELECT * FROM fleet_schedules ${where.sql} ORDER BY date_key DESC, plate`, where.params);
}

async function upsertFleetSchedule(body) {
  const dateKey = body.date_key || dateKeyOf();
  const updatedAt = new Date().toISOString();
  await db.run(
    `INSERT INTO fleet_schedules (id, date_key, plate, operator_email, updated_at)
     VALUES (nextval('fleet_schedules_id_seq'), ?, ?, ?, ?)
     ON CONFLICT (date_key, plate) DO UPDATE SET
       operator_email = excluded.operator_email, updated_at = excluded.updated_at`,
    [dateKey, body.plate, body.operator_email || null, updatedAt]
  );
  return db.get('SELECT * FROM fleet_schedules WHERE date_key = ? AND plate = ?', [dateKey, body.plate]);
}

// ---------------------------------------------------------------- dispatcher

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const seg = parts.slice(1); // drop 'api'
  const method = req.method;
  const q = qp(url);

  try {
    if (seg[0] === 'bases' && method === 'GET') return sendJson(res, 200, await listBases());
    if (seg[0] === 'drivers' && method === 'GET') return sendJson(res, 200, await listDrivers());
    if (seg[0] === 'stats' && seg[1] === 'overview' && method === 'GET') {
      return sendJson(res, 200, await statsOverview(q.from, q.to));
    }

    if (seg[0] === 'routes') {
      if (seg.length === 1 && method === 'GET') return sendJson(res, 200, await listRoutes(q));
      if (seg.length === 1 && method === 'POST') {
        const body = await readJsonBody(req);
        if (!body.driver_name || !body.plate) return sendJson(res, 400, { error: 'driver_name e plate são obrigatórios' });
        return sendJson(res, 201, await createRoute(body));
      }
      if (seg[1] === 'token' && seg[2] && method === 'GET') {
        const r = await getRouteByToken(seg[2]);
        return r ? sendJson(res, 200, r) : sendJson(res, 404, { error: 'not found' });
      }
      if (seg[1] === 'by-plate' && seg[2] && method === 'GET') {
        const r = await getRouteByPlate(decodeURIComponent(seg[2]));
        return r ? sendJson(res, 200, r) : sendJson(res, 404, { error: 'Nenhuma rota em aberto para esta placa.' });
      }
      if (seg.length === 2 && method === 'GET') {
        const r = await getRoute(Number(seg[1]));
        return r ? sendJson(res, 200, r) : sendJson(res, 404, { error: 'not found' });
      }
      if (seg[2] === 'complete' && method === 'PATCH') return sendJson(res, 200, await completeRoute(Number(seg[1])));
      if (seg[2] === 'management-close' && method === 'PATCH') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, await managementCloseRoute(Number(seg[1]), body.email, true));
      }
      if (seg[2] === 'management-reopen' && method === 'PATCH') {
        return sendJson(res, 200, await managementCloseRoute(Number(seg[1]), null, false));
      }
    }

    if (seg[0] === 'journeys') {
      if (seg.length === 1 && method === 'GET') return sendJson(res, 200, await listJourneys(q));
      if (seg.length === 1 && method === 'POST') {
        const body = await readJsonBody(req);
        if (!body.route_id || !body.base) return sendJson(res, 400, { error: 'route_id e base são obrigatórios' });
        return sendJson(res, 201, await startJourney(body));
      }
      if (seg[2] === 'complete' && method === 'PATCH') {
        const body = await readJsonBody(req).catch(() => ({}));
        return sendJson(res, 200, await completeJourney(Number(seg[1]), body.arrival_id));
      }
    }

    if (seg[0] === 'arrivals') {
      if (seg.length === 1 && method === 'GET') return sendJson(res, 200, await listArrivals(q));
      if (seg.length === 1 && method === 'POST') {
        const body = await readJsonBody(req);
        if (!body.base) return sendJson(res, 400, { error: 'base é obrigatória' });
        return sendJson(res, 201, await createArrival(body));
      }
      if (seg.length === 2 && method === 'GET') {
        const r = await getArrival(Number(seg[1]));
        return r ? sendJson(res, 200, r) : sendJson(res, 404, { error: 'not found' });
      }
      if (seg.length === 2 && method === 'PATCH') {
        const body = await readJsonBody(req);
        const r = await updateArrival(Number(seg[1]), body);
        return r ? sendJson(res, 200, r) : sendJson(res, 404, { error: 'not found' });
      }
      if (seg[2] === 'photo' && method === 'POST') {
        const body = await readJsonBody(req, { limitBytes: 30 * 1024 * 1024 });
        if (!body.data_base64) return sendJson(res, 400, { error: 'data_base64 é obrigatório' });
        const r = await savePhoto(Number(seg[1]), body);
        return r ? sendJson(res, 200, r) : sendJson(res, 404, { error: 'not found' });
      }
    }

    if (seg[0] === 'bag-loads') {
      if (method === 'GET') return sendJson(res, 200, await listBagLoads(q));
      if (method === 'POST') {
        const body = await readJsonBody(req);
        if (!body.base) return sendJson(res, 400, { error: 'base é obrigatória' });
        return sendJson(res, 200, await upsertBagLoad(body));
      }
    }

    if (seg[0] === 'bag-events' && method === 'GET') return sendJson(res, 200, await listBagEvents(q));

    if (seg[0] === 'bag-cycle-closures') {
      if (method === 'GET') return sendJson(res, 200, await listClosures(q));
      if (method === 'POST') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, await setClosure(body));
      }
    }

    if (seg[0] === 'fleet-schedules') {
      if (method === 'GET') return sendJson(res, 200, await listFleetSchedules(q));
      if (method === 'POST') {
        const body = await readJsonBody(req);
        if (!body.plate) return sendJson(res, 400, { error: 'plate é obrigatória' });
        return sendJson(res, 200, await upsertFleetSchedule(body));
      }
    }

    return sendJson(res, 404, { error: 'endpoint não encontrado' });
  } catch (err) {
    console.error(err);
    const status = err.statusCode || 500;
    return sendJson(res, status, { error: err.message });
  }
}

module.exports = { handleApi, resolvePhotoFile, PHOTOS_DIR };
