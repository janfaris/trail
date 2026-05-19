ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS languages JSONB;
ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
