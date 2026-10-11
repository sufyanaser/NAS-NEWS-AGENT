-- NAS Newsroom — migration 0001: initial schema.
-- Source of truth: docs/02-requirements/NAS_Newsroom_Technical_Specs_v1.0.md §4.
-- Single-editor MVP 1.0: no roles/permissions tables.

-- المستخدم الوحيد (المحرر). لا جدول أدوار/صلاحيات.
-- password_hash format: "<iterations>$<base64 PBKDF2-SHA256 hash>" (see docs/04-implementation/README.md, deviation D-1).
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- جلسات دخول قابلة للإلغاء الفوري (logout حقيقي)
CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  ip_hash       TEXT,
  user_agent    TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- الخبر — جوهر النظام
CREATE TABLE stories (
  id                       TEXT PRIMARY KEY,
  status                   TEXT NOT NULL DEFAULT 'مسودة'
                             CHECK (status IN ('مسودة','قيد المراجعة','معتمد','منشور','مستبعد')),
  source_url               TEXT,
  source_name              TEXT,
  publish_date             TEXT,
  category                 TEXT,
  source_lang              TEXT,
  source_text              TEXT NOT NULL DEFAULT '',
  import_failed            INTEGER NOT NULL DEFAULT 0,
  import_message           TEXT,
  has_blocker              INTEGER NOT NULL DEFAULT 0,
  blocker_reason           TEXT,
  headline                 TEXT,
  urgent_enabled           INTEGER NOT NULL DEFAULT 0,
  formats_json             TEXT,
  facts_json               TEXT,
  checks_facts_verified    INTEGER NOT NULL DEFAULT 0,
  checks_attribution_verified INTEGER NOT NULL DEFAULT 0,
  exclude_reason           TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at              TEXT,
  published_at             TEXT
);
CREATE INDEX idx_stories_status ON stories(status);
CREATE INDEX idx_stories_updated ON stories(updated_at DESC);

-- سجل تدقيق شامل
CREATE TABLE story_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id   TEXT NOT NULL REFERENCES stories(id),
  event_type TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_story ON story_events(story_id, created_at);

-- إعدادات المنصة — صف واحد ثابت
CREATE TABLE settings (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  station_name    TEXT NOT NULL DEFAULT 'NAS FM — إذاعة ناس',
  editorial_style TEXT NOT NULL DEFAULT 'فصحى إخبارية إذاعية مبسطة',
  radio_length    TEXT NOT NULL DEFAULT '20-40',
  model_provider  TEXT NOT NULL DEFAULT 'OpenAI',
  model_name      TEXT NOT NULL DEFAULT 'gpt-4.1',
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO settings (id) VALUES (1);
