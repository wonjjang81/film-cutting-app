CREATE TABLE IF NOT EXISTS libraries (
  user_id TEXT PRIMARY KEY NOT NULL,
  user_email TEXT NOT NULL,
  document_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_libraries_updated_at ON libraries(updated_at);
