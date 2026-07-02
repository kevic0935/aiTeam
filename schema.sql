-- schema.sql
-- Cloudflare D1 Database schema for Visual Agent Canvas platform

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  temperature REAL DEFAULT 0.7,
  position_x REAL DEFAULT 0.0,
  position_y REAL DEFAULT 0.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_connections (
  id TEXT PRIMARY KEY,
  source_agent_id TEXT NOT NULL,
  target_agent_id TEXT NOT NULL,
  FOREIGN KEY (source_agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (target_agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,    -- 'user', 'agent'
  sender_id TEXT,               -- NULL if user, agent_id if agent
  sender_name TEXT NOT NULL,    -- 'User' or Agent Name
  content TEXT NOT NULL,
  prompt_snapshot TEXT,         -- system prompt used
  model_snapshot TEXT,          -- model used
  parent_message_id TEXT,       -- for tracing / regeneration branches
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES agents(id) ON DELETE SET NULL
);
