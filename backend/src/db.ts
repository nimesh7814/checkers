import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'checkers',
  user: process.env.DB_USER || 'checkers',
  password: process.env.DB_PASSWORD || 'checkers_password',
});

async function seedDemoUsers(): Promise<void> {
  const candidates = [
    {
      username: process.env.DEMO_USER_1_USERNAME,
      password: process.env.DEMO_USER_1_PASSWORD,
      firstName: 'Demo',
      lastName: 'One',
    },
    {
      username: process.env.DEMO_USER_2_USERNAME,
      password: process.env.DEMO_USER_2_PASSWORD,
      firstName: 'Demo',
      lastName: 'Two',
    },
  ].filter(
    user =>
      typeof user.username === 'string' &&
      user.username.trim().length > 0 &&
      typeof user.password === 'string' &&
      user.password.trim().length > 0,
  ) as Array<{ username: string; password: string; firstName: string; lastName: string }>;

  for (const user of candidates) {
    const username = user.username.trim();
    const email = `${username.toLowerCase()}@demo.local`;
    const passwordHash = await bcrypt.hash(user.password, 12);

    await pool.query(
      `INSERT INTO users
         (username, email, password_hash, first_name, last_name, country, country_code, is_online)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, false)
       ON CONFLICT (username) DO UPDATE
       SET email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           country = EXCLUDED.country,
           country_code = EXCLUDED.country_code`,
      [username, email, passwordHash, user.firstName, user.lastName, 'Unknown', 'UN'],
    );
  }
}

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username      VARCHAR(50)  UNIQUE NOT NULL,
      email         VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name    VARCHAR(100) NOT NULL,
      last_name     VARCHAR(100) NOT NULL,
      birthday      DATE,
      avatar        TEXT,
      country       VARCHAR(100),
      country_code  VARCHAR(10),
      games_played  INTEGER DEFAULT 0,
      wins          INTEGER DEFAULT 0,
      losses        INTEGER DEFAULT 0,
      draws         INTEGER DEFAULT 0,
      board_theme         VARCHAR(20)  DEFAULT 'classic',
      checker_color       VARCHAR(10)  DEFAULT 'white',
      sound_enabled       BOOLEAN      DEFAULT true,
      animations_enabled  BOOLEAN      DEFAULT true,
      is_online     BOOLEAN DEFAULT false,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token         TEXT UNIQUE NOT NULL,
      logged_in_at  TIMESTAMPTZ DEFAULT NOW(),
      logged_out_at TIMESTAMPTZ,
      is_active     BOOLEAN DEFAULT true
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS game_invites (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      board_size     INTEGER NOT NULL,
      board_theme    VARCHAR(20) NOT NULL,
      inviter_color  VARCHAR(10) NOT NULL,
      status         VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at   TIMESTAMPTZ,
      CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
      CHECK (inviter_color IN ('white', 'black')),
      CHECK (board_size IN (8, 12)),
      CHECK (from_user_id <> to_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_game_invites_to_status
      ON game_invites(to_user_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_game_invites_from_status
      ON game_invites(from_user_id, status, created_at DESC);

    ALTER TABLE game_invites
      ADD COLUMN IF NOT EXISTS match_id UUID;

    CREATE TABLE IF NOT EXISTS game_matches (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invite_id             UUID UNIQUE REFERENCES game_invites(id) ON DELETE SET NULL,
      white_user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      black_user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      board_size            INTEGER NOT NULL,
      board_theme           VARCHAR(20) NOT NULL,
      status                VARCHAR(20) NOT NULL DEFAULT 'active',
      winner_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
      winner_reason         VARCHAR(20),
      white_disconnected_at TIMESTAMPTZ,
      black_disconnected_at TIMESTAMPTZ,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at              TIMESTAMPTZ,
      CHECK (white_user_id <> black_user_id),
      CHECK (board_size IN (8, 12)),
      CHECK (board_theme IN ('classic', 'wooden', 'metal')),
      CHECK (status IN ('active', 'finished', 'cancelled')),
      CHECK (winner_reason IS NULL OR winner_reason IN ('timeout', 'resign', 'completed'))
    );

    ALTER TABLE game_matches
      ADD COLUMN IF NOT EXISTS game_state JSONB;

    ALTER TABLE game_matches
      ADD COLUMN IF NOT EXISTS state_revision INTEGER NOT NULL DEFAULT 0;

    CREATE INDEX IF NOT EXISTS idx_game_matches_active_by_white
      ON game_matches(white_user_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_game_matches_active_by_black
      ON game_matches(black_user_id, status, created_at DESC);
  `);

  await seedDemoUsers();
}
