-- Brute-force lock + read-only MCP tokens (ported from design-daily migrations/0002.sql).
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  hash         TEXT NOT NULL UNIQUE,   -- sha256(token) hex; the token itself is never stored
  prefix       TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at   INTEGER
);
CREATE TABLE IF NOT EXISTS auth_fail (
  ip           TEXT NOT NULL,
  scope        TEXT NOT NULL,          -- 'owner' | 'mcp'
  count        INTEGER NOT NULL,
  first_at     INTEGER NOT NULL,
  locked_until INTEGER,
  PRIMARY KEY (ip, scope)
);
