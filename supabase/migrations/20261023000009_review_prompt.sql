-- When a job was first seen completed; drives the review prompt push 2 hours later (handbook 4.7).
ALTER TABLE job_sync ADD COLUMN IF NOT EXISTS completed_at timestamptz;
