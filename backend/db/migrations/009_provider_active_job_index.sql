-- A provider can have only one active job (accepted or arrived) at a time. This is the database safety net
-- behind the application check, so two simultaneous accepts can never give one provider two jobs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_requests_one_active_job_per_provider
  ON requests (provider_id)
  WHERE status IN ('accepted', 'arrived');