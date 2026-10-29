CREATE TABLE IF NOT EXISTS ratings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id bigint NOT NULL REFERENCES requests (id),
  rater_id bigint NOT NULL REFERENCES users (id),
  ratee_id bigint NOT NULL REFERENCES users (id),
  rater_role text NOT NULL CHECK (rater_role IN ('driver','provider')),
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings (ratee_id);

CREATE TABLE IF NOT EXISTS notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id),
  title text NOT NULL,
  body text,
  kind text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read_at, created_at DESC);