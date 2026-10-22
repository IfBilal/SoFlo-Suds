-- Expo push tickets awaiting receipts, so the scheduler can drop dead tokens.
CREATE TABLE IF NOT EXISTS push_tickets (
  ticket_id text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE push_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON push_tickets FROM anon, authenticated;
