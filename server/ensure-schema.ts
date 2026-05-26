/**
 * ensure-schema.ts
 *
 * Idempotent startup migration — creates all tables if they don't exist.
 * Safe to run on every boot; uses CREATE TABLE IF NOT EXISTS throughout.
 */

import { pool } from "./db";

export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid       VARCHAR PRIMARY KEY,
        sess      JSONB        NOT NULL,
        expire    TIMESTAMP    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

      CREATE TABLE IF NOT EXISTS users (
        id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        email             VARCHAR UNIQUE,
        first_name        VARCHAR,
        last_name         VARCHAR,
        profile_image_url VARCHAR,
        created_at        TIMESTAMP DEFAULT NOW(),
        updated_at        TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS assets (
        id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        name          VARCHAR(255) NOT NULL,
        type          VARCHAR(50)  NOT NULL,
        category      VARCHAR(50),
        file_url      TEXT         NOT NULL,
        thumbnail_url TEXT,
        file_format   VARCHAR(20),
        file_size     INTEGER,
        is_built_in   BOOLEAN DEFAULT FALSE,
        is_public     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS games (
        id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title        VARCHAR(255) NOT NULL,
        description  TEXT,
        thumbnail    TEXT,
        is_published BOOLEAN DEFAULT FALSE,
        is_public    BOOLEAN DEFAULT TRUE,
        plays        INTEGER DEFAULT 0,
        max_players  INTEGER DEFAULT 10,
        created_at   TIMESTAMP DEFAULT NOW(),
        updated_at   TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS game_objects (
        id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        game_id        VARCHAR NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        parent_id      VARCHAR,
        name           VARCHAR(255) NOT NULL,
        type           VARCHAR(50)  NOT NULL,
        container      VARCHAR(50)  NOT NULL DEFAULT 'Workspace',
        position_x     REAL DEFAULT 0,
        position_y     REAL DEFAULT 0,
        position_z     REAL DEFAULT 0,
        rotation_x     REAL DEFAULT 0,
        rotation_y     REAL DEFAULT 0,
        rotation_z     REAL DEFAULT 0,
        scale_x        REAL DEFAULT 1,
        scale_y        REAL DEFAULT 1,
        scale_z        REAL DEFAULT 1,
        primitive_type VARCHAR(50),
        color          VARCHAR(7) DEFAULT '#888888',
        asset_id       VARCHAR REFERENCES assets(id) ON DELETE SET NULL,
        properties     JSONB DEFAULT '{}',
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS scripts (
        id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        game_id     VARCHAR NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        object_id   VARCHAR REFERENCES game_objects(id) ON DELETE CASCADE,
        container   VARCHAR(50) DEFAULT 'ServerScriptService',
        script_type VARCHAR(20) NOT NULL DEFAULT 'Script',
        name        VARCHAR(255) NOT NULL,
        code        TEXT NOT NULL DEFAULT '// Write your JavaScript code here\n',
        enabled     BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS multiplayer_sessions (
        id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        game_id        VARCHAR NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        host_user_id   VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_active      BOOLEAN DEFAULT TRUE,
        max_players    INTEGER DEFAULT 10,
        current_players INTEGER DEFAULT 0,
        created_at     TIMESTAMP DEFAULT NOW(),
        ended_at       TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS session_players (
        id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id  VARCHAR NOT NULL REFERENCES multiplayer_sessions(id) ON DELETE CASCADE,
        user_id     VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        player_name VARCHAR(255),
        position_x  REAL DEFAULT 0,
        position_y  REAL DEFAULT 5,
        position_z  REAL DEFAULT 0,
        rotation_y  REAL DEFAULT 0,
        is_active   BOOLEAN DEFAULT TRUE,
        joined_at   TIMESTAMP DEFAULT NOW(),
        left_at     TIMESTAMP
      );
    `);
    console.log("[db] schema ready");
  } catch (err) {
    console.error("[db] ensureSchema failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
