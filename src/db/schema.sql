-- Amici PostgreSQL schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname VARCHAR(32) NOT NULL UNIQUE,
  first_name VARCHAR(64) NOT NULL,
  last_name VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_color VARCHAR(7) NOT NULL,
  refresh_token_hash VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  s3_key VARCHAR(512) NOT NULL,
  url TEXT DEFAULT '',
  mime_type VARCHAR(64) NOT NULL,
  media_type VARCHAR(16) NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  duration_seconds REAL,
  file_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS epic_moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_id UUID NOT NULL REFERENCES images(id),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  google_place_id VARCHAR(255),
  place_name VARCHAR(255),
  formatted_address TEXT,
  caption TEXT DEFAULT '',
  is_permanent BOOLEAN NOT NULL DEFAULT false,
  epic_moment_id UUID REFERENCES epic_moments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id UUID NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id UUID NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(16) NOT NULL CHECK (type IN ('funny', 'awful', 'scare', 'love', 'wow', 'meh')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pin_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);

CREATE TABLE IF NOT EXISTS user_ranks (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_score INTEGER NOT NULL DEFAULT 0,
  pin_count INTEGER NOT NULL DEFAULT 0,
  reaction_score INTEGER NOT NULL DEFAULT 0,
  rating_score INTEGER NOT NULL DEFAULT 0,
  funny_count INTEGER NOT NULL DEFAULT 0,
  rank_position INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(16) NOT NULL CHECK (activity_type IN ('coito', 'entreno')),
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_log_date DATE,
  total_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, activity_type)
);

CREATE TABLE IF NOT EXISTS user_daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(16) NOT NULL CHECK (activity_type IN ('coito', 'entreno')),
  log_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, activity_type, log_date)
);

CREATE INDEX IF NOT EXISTS idx_pins_location ON pins(lat, lng);
CREATE INDEX IF NOT EXISTS idx_pins_user ON pins(user_id);
CREATE INDEX IF NOT EXISTS idx_pins_place ON pins(google_place_id);
CREATE INDEX IF NOT EXISTS idx_reactions_pin ON reactions(pin_id);
CREATE INDEX IF NOT EXISTS idx_comments_pin ON comments(pin_id);
CREATE INDEX IF NOT EXISTS idx_images_user ON images(user_id);
CREATE INDEX IF NOT EXISTS idx_relations_requester ON user_relations(requester_id);
CREATE INDEX IF NOT EXISTS idx_relations_addressee ON user_relations(addressee_id);
CREATE INDEX IF NOT EXISTS idx_ranks_score ON user_ranks(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_ranks_position ON user_ranks(rank_position);
CREATE INDEX IF NOT EXISTS idx_streaks_type_streak ON user_streaks(activity_type, current_streak DESC);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON user_daily_logs(user_id, log_date DESC);
