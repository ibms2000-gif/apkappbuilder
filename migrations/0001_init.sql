CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, device_id TEXT NOT NULL, prompt TEXT NOT NULL, app_name TEXT NOT NULL,
 package_name TEXT NOT NULL, main_activity TEXT NOT NULL, summary TEXT NOT NULL, provider TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'generated', error_message TEXT, apk_key TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_device_created ON projects(device_id, created_at DESC);
CREATE TABLE IF NOT EXISTS device_usage (
 usage_day TEXT NOT NULL, device_id TEXT NOT NULL, generations INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (usage_day, device_id)
);
CREATE TABLE IF NOT EXISTS provider_usage (
 usage_day TEXT NOT NULL, provider TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
 input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (usage_day, provider)
);
