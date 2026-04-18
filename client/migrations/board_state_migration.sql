CREATE TABLE IF NOT EXISTS board_state (
  board_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_by_name TEXT,
  last_action TEXT NOT NULL DEFAULT ''
);
