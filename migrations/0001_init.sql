-- El Compita site schema (Cloudflare D1 / SQLite).
-- Applied with: wrangler d1 migrations apply el-compita --local|--remote

CREATE TABLE IF NOT EXISTS trucks (
  id          INTEGER PRIMARY KEY,
  label       TEXT    NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schedule_entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  truck_id       INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  date           TEXT    NOT NULL,              -- YYYY-MM-DD (local, America/Denver)
  start_time     TEXT    NOT NULL,              -- HH:MM 24h
  end_time       TEXT    NOT NULL,              -- HH:MM 24h
  location_name  TEXT    NOT NULL,
  street_address TEXT    NOT NULL DEFAULT '',
  map_link       TEXT    NOT NULL DEFAULT '',   -- optional override; otherwise built from the address
  note           TEXT    NOT NULL DEFAULT '',
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule_entries(date, start_time);

CREATE TABLE IF NOT EXISTS menu_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id   INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  price_cents   INTEGER,                         -- NULL = price not set yet
  availability  TEXT    NOT NULL DEFAULT 'available'
                CHECK (availability IN ('available','sold_out','hidden')),
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_menu_items_cat ON menu_items(category_id, sort_order);

CREATE TABLE IF NOT EXISTS photos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key        TEXT    NOT NULL UNIQUE,
  content_type  TEXT    NOT NULL,
  alt_text      TEXT    NOT NULL,
  -- where the photo shows: the gallery grid, or one of the design's image slots
  placement     TEXT    NOT NULL DEFAULT 'gallery'
                CHECK (placement IN ('gallery','hero','location','menu','story','catering','contact')),
  width         INTEGER,
  height        INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reviewer_name  TEXT    NOT NULL,
  quote          TEXT    NOT NULL,
  star_rating    INTEGER NOT NULL CHECK (star_rating BETWEEN 1 AND 5),
  source         TEXT    NOT NULL DEFAULT 'Google',
  sort_order     INTEGER NOT NULL DEFAULT 0
);

-- Free-form owner-editable text: hero headline, story, catering copy,
-- contact details, Google rating, notification email, hours summary.
CREATE TABLE IF NOT EXISTS site_settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catering_inquiries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT NOT NULL,
  event_date      TEXT NOT NULL,
  headcount       INTEGER,
  event_location  TEXT NOT NULL DEFAULT '',
  message         TEXT NOT NULL DEFAULT '',
  submitted_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  notify_status   TEXT NOT NULL DEFAULT 'pending',   -- sent | failed | not_configured | pending
  notify_error    TEXT NOT NULL DEFAULT ''
);
