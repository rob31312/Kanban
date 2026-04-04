-- Migration number: 0001 	 2026-04-04T00:41:00.734Z
ALTER TABLE cards ADD COLUMN created_by_user_id TEXT;
ALTER TABLE cards ADD COLUMN created_by_name TEXT;
ALTER TABLE cards ADD COLUMN owner_user_id TEXT;
ALTER TABLE cards ADD COLUMN owner_name TEXT;

CREATE TABLE IF NOT EXISTS board_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  username TEXT,
  global_name TEXT,
  avatar TEXT,
  is_current_participant INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL,
  UNIQUE(board_id, discord_user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_members_board_id
ON board_members(board_id);

CREATE INDEX IF NOT EXISTS idx_cards_owner_user_id
ON cards(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_cards_created_by_user_id
ON cards(created_by_user_id);