-- Webhook relay daily counter (/api/agent-task). Additive only.
CREATE TABLE IF NOT EXISTS agent_rate (
  day TEXT PRIMARY KEY,
  n   INTEGER NOT NULL DEFAULT 0
);
