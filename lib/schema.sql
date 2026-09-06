-- Schema Postgres do Chegada Certa (compatível com Supabase / qualquer Postgres gerenciado).

CREATE TABLE IF NOT EXISTS routes (
  id BIGINT PRIMARY KEY,
  driver_name TEXT NOT NULL,
  plate TEXT NOT NULL,
  notes TEXT DEFAULT '',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  update_token TEXT UNIQUE,
  management_closed_at TIMESTAMPTZ,
  management_closed_by_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journeys (
  id BIGINT PRIMARY KEY,
  route_id BIGINT,
  driver_name TEXT,
  plate TEXT,
  base TEXT,
  origin_base TEXT DEFAULT 'HUB PRINCIPAL',
  leg_number INTEGER DEFAULT 1,
  notes TEXT DEFAULT '',
  started_at TIMESTAMPTZ,
  start_latitude DOUBLE PRECISION,
  start_longitude DOUBLE PRECISION,
  start_accuracy_meters DOUBLE PRECISION,
  start_location_captured_at TIMESTAMPTZ,
  driver_update_token TEXT,
  arrival_id BIGINT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS arrivals (
  id BIGINT PRIMARY KEY,
  route_id BIGINT,
  journey_id BIGINT,
  driver_name TEXT,
  plate TEXT,
  base TEXT NOT NULL,
  origin_base TEXT DEFAULT 'HUB PRINCIPAL',
  leg_number INTEGER DEFAULT 1,
  scheduled_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  deviation_minutes INTEGER,
  status TEXT,
  notes TEXT DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_meters DOUBLE PRECISION,
  location_captured_at TIMESTAMPTZ,
  driver_update_token TEXT,
  base_open_on_arrival INTEGER,
  base_status_recorded_at TIMESTAMPTZ,
  base_opened_at TIMESTAMPTZ,
  unloading_delay_reason TEXT,
  unloading_delay_details TEXT,
  delivery_photo_key TEXT,
  delivery_photo_name TEXT,
  delivery_photo_type TEXT,
  delivery_photo_bytes BIGINT,
  delivery_photo_uploaded_at TIMESTAMPTZ,
  delivery_photo_required INTEGER DEFAULT 0,
  hub_departed_at TIMESTAMPTZ,
  travel_minutes INTEGER,
  hub_latitude DOUBLE PRECISION,
  hub_longitude DOUBLE PRECISION,
  hub_accuracy_meters DOUBLE PRECISION,
  hub_location_captured_at TIMESTAMPTZ,
  collected_bags INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_stops (
  id BIGINT PRIMARY KEY,
  route_id BIGINT NOT NULL,
  seq_number INTEGER NOT NULL,
  base TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(route_id, seq_number)
);

CREATE TABLE IF NOT EXISTS bag_loads (
  id BIGINT PRIMARY KEY,
  date_key TEXT NOT NULL,
  base TEXT NOT NULL,
  loaded_bags INTEGER DEFAULT 0,
  operator_email TEXT,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date_key, base)
);

CREATE TABLE IF NOT EXISTS bag_events (
  id BIGINT PRIMARY KEY,
  date_key TEXT,
  base TEXT,
  event_type TEXT NOT NULL,
  previous_bags INTEGER,
  new_bags INTEGER,
  operator_email TEXT,
  occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bag_cycle_closures (
  id BIGINT PRIMARY KEY,
  date_key TEXT NOT NULL,
  phase TEXT NOT NULL,
  closed_at TIMESTAMPTZ,
  closed_by_email TEXT,
  reopened_at TIMESTAMPTZ,
  reopened_by_email TEXT,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date_key, phase)
);

CREATE TABLE IF NOT EXISTS fleet_schedules (
  id BIGINT PRIMARY KEY,
  date_key TEXT NOT NULL,
  plate TEXT NOT NULL,
  operator_email TEXT,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date_key, plate)
);

-- sequências próprias (não usamos SERIAL porque o backup traz ids explícitos;
-- as sequências são avançadas pelo seed depois da carga, e usadas para registros novos).
CREATE SEQUENCE IF NOT EXISTS routes_id_seq OWNED BY routes.id;
CREATE SEQUENCE IF NOT EXISTS route_stops_id_seq OWNED BY route_stops.id;
CREATE SEQUENCE IF NOT EXISTS journeys_id_seq OWNED BY journeys.id;
CREATE SEQUENCE IF NOT EXISTS arrivals_id_seq OWNED BY arrivals.id;
CREATE SEQUENCE IF NOT EXISTS bag_loads_id_seq OWNED BY bag_loads.id;
CREATE SEQUENCE IF NOT EXISTS bag_events_id_seq OWNED BY bag_events.id;
CREATE SEQUENCE IF NOT EXISTS bag_cycle_closures_id_seq OWNED BY bag_cycle_closures.id;
CREATE SEQUENCE IF NOT EXISTS fleet_schedules_id_seq OWNED BY fleet_schedules.id;

CREATE INDEX IF NOT EXISTS idx_arrivals_base ON arrivals(base);
CREATE INDEX IF NOT EXISTS idx_arrivals_status ON arrivals(status);
CREATE INDEX IF NOT EXISTS idx_arrivals_route ON arrivals(route_id);
CREATE INDEX IF NOT EXISTS idx_arrivals_scheduled ON arrivals(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_journeys_route ON journeys(route_id);
CREATE INDEX IF NOT EXISTS idx_bagloads_date ON bag_loads(date_key);
CREATE INDEX IF NOT EXISTS idx_bagevents_date ON bag_events(date_key);
CREATE INDEX IF NOT EXISTS idx_fleet_date ON fleet_schedules(date_key);
CREATE INDEX IF NOT EXISTS idx_routes_token ON routes(update_token);
CREATE INDEX IF NOT EXISTS idx_routes_plate ON routes(plate);
CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops(route_id);
