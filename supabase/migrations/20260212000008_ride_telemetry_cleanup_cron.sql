-- Auto-cleanup for ride telemetry data
-- ride_telemetry samples: 7-day retention
-- ride_sessions (uploaded): 90-day retention
--
-- NOTE: pg_cron requires Supabase Pro plan.
-- If unavailable, skip this migration (repair --status reverted) and
-- handle cleanup manually or via a scheduled Edge Function.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Delete ride_telemetry samples older than 7 days (daily at 3 AM UTC)
SELECT cron.schedule(
    'cleanup-ride-telemetry-samples',
    '0 3 * * *',
    $$DELETE FROM ride_telemetry WHERE recorded_at < now() - interval '7 days'$$
);

-- Delete uploaded ride_sessions older than 90 days (daily at 3:05 AM UTC)
SELECT cron.schedule(
    'cleanup-ride-sessions',
    '5 3 * * *',
    $$DELETE FROM ride_sessions WHERE status = 'uploaded' AND created_at < now() - interval '90 days'$$
);
