CREATE TABLE IF NOT EXISTS sheet_rows (
  sheet_name TEXT NOT NULL,
  row_idx INTEGER NOT NULL,
  row_json TEXT NOT NULL,
  PRIMARY KEY (sheet_name, row_idx)
);

CREATE INDEX IF NOT EXISTS idx_sheet_rows_name ON sheet_rows (sheet_name);

CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS uploaded_images (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data_base64 TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
