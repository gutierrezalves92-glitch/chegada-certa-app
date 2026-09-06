// Importa o backup original (data-export/*.json, formato chegada-certa-backup-v1)
// para dentro do Postgres. Idempotente: roda de novo sem duplicar nada.
const fs = require('fs');
const path = require('path');
const db = require('./db');

const EXPORT_DIR = path.join(__dirname, '..', 'data-export');

function loadTable(tableName) {
  const files = fs
    .readdirSync(EXPORT_DIR)
    .filter((f) => f.startsWith(`${tableName}-page-`) && f.endsWith('.json'))
    .sort();
  let rows = [];
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, f), 'utf8'));
    if (raw.table !== tableName) continue;
    rows = rows.concat(raw.rows || []);
  }
  return rows;
}

async function insertAll(tx, table, rows, columns) {
  if (rows.length === 0) return 0;
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;
  let count = 0;
  for (const row of rows) {
    const values = columns.map((c) => {
      const v = row[c];
      if (v === undefined) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      return v;
    });
    await tx.run(sql, values);
    count++;
  }
  // avança a sequência do id para além do maior id importado, para que
  // registros novos (criados pelo app) nunca colidam com o histórico.
  await tx.run(`SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 1))`);
  return count;
}

async function alreadySeeded() {
  const row = await db.get('SELECT COUNT(*) AS n FROM routes');
  return Number(row.n) > 0;
}

async function seed({ force = false } = {}) {
  await db.ensureSchema();

  if (!force && (await alreadySeeded())) {
    console.log('[seed] banco já contém dados — nada a importar (use --force para reimportar).');
    return;
  }

  if (force) {
    console.log('[seed] --force: limpando tabelas antes de reimportar...');
    await db.exec(`
      DELETE FROM journeys;
      DELETE FROM arrivals;
      DELETE FROM routes;
      DELETE FROM bag_loads;
      DELETE FROM bag_events;
      DELETE FROM bag_cycle_closures;
      DELETE FROM fleet_schedules;
    `);
  }

  await db.transaction(async (tx) => {
    const routes = loadTable('routes');
    const nRoutes = await insertAll(tx, 'routes', routes, [
      'id', 'driver_name', 'plate', 'notes', 'started_at', 'completed_at',
      'update_token', 'management_closed_at', 'management_closed_by_email', 'created_at',
    ]);
    console.log(`[seed] routes: ${nRoutes}/${routes.length}`);

    const arrivals = loadTable('arrivals');
    const nArrivals = await insertAll(tx, 'arrivals', arrivals, [
      'id', 'route_id', 'journey_id', 'driver_name', 'plate', 'base', 'origin_base',
      'leg_number', 'scheduled_at', 'arrived_at', 'deviation_minutes', 'status', 'notes',
      'latitude', 'longitude', 'accuracy_meters', 'location_captured_at', 'driver_update_token',
      'base_open_on_arrival', 'base_status_recorded_at', 'base_opened_at',
      'unloading_delay_reason', 'unloading_delay_details',
      'delivery_photo_key', 'delivery_photo_name', 'delivery_photo_type', 'delivery_photo_bytes',
      'delivery_photo_uploaded_at', 'delivery_photo_required',
      'hub_departed_at', 'travel_minutes', 'hub_latitude', 'hub_longitude', 'hub_accuracy_meters',
      'hub_location_captured_at', 'collected_bags', 'created_at',
    ]);
    console.log(`[seed] arrivals: ${nArrivals}/${arrivals.length}`);

    const journeys = loadTable('journeys');
    const nJourneys = await insertAll(tx, 'journeys', journeys, [
      'id', 'route_id', 'driver_name', 'plate', 'base', 'origin_base', 'leg_number', 'notes',
      'started_at', 'start_latitude', 'start_longitude', 'start_accuracy_meters',
      'start_location_captured_at', 'driver_update_token', 'arrival_id', 'completed_at', 'created_at',
    ]);
    console.log(`[seed] journeys: ${nJourneys}/${journeys.length}`);

    const bagLoads = loadTable('bag_loads');
    const nBagLoads = await insertAll(tx, 'bag_loads', bagLoads, [
      'id', 'date_key', 'base', 'loaded_bags', 'operator_email', 'updated_at', 'created_at',
    ]);
    console.log(`[seed] bag_loads: ${nBagLoads}/${bagLoads.length}`);

    const bagEvents = loadTable('bag_events');
    const nBagEvents = await insertAll(tx, 'bag_events', bagEvents, [
      'id', 'date_key', 'base', 'event_type', 'previous_bags', 'new_bags',
      'operator_email', 'occurred_at', 'created_at',
    ]);
    console.log(`[seed] bag_events: ${nBagEvents}/${bagEvents.length}`);

    const closures = loadTable('bag_cycle_closures');
    const nClosures = await insertAll(tx, 'bag_cycle_closures', closures, [
      'id', 'date_key', 'phase', 'closed_at', 'closed_by_email',
      'reopened_at', 'reopened_by_email', 'updated_at', 'created_at',
    ]);
    console.log(`[seed] bag_cycle_closures: ${nClosures}/${closures.length}`);

    const fleet = loadTable('fleet_schedules');
    const nFleet = await insertAll(tx, 'fleet_schedules', fleet, [
      'id', 'date_key', 'plate', 'operator_email', 'updated_at', 'created_at',
    ]);
    console.log(`[seed] fleet_schedules: ${nFleet}/${fleet.length}`);
  });

  console.log('[seed] importação concluída.');
}

if (require.main === module) {
  const force = process.argv.includes('--force');
  seed({ force })
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { seed };
