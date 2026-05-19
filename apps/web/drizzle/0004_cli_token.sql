-- CLI device-code login: short-lived tokens that pair a browser session with
-- a polling CLI. The CLI generates the token id (random hex), the web fills
-- in cookie_value + user_handle after OAuth, and the /api/cli-auth/poll
-- endpoint hands them back and deletes the row (single-use).
CREATE TABLE IF NOT EXISTS "cli_token" (
  "id" text PRIMARY KEY,
  "cookie_value" text,
  "user_handle" text,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL
);
