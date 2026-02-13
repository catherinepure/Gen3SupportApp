-- Webhook Subscriptions & Delivery Log
-- Enables API key holders to register callback URLs for real-time event notifications.
-- Events from activity_events trigger HTTP POST deliveries with HMAC-SHA256 signatures.

-- webhook_subscriptions: callback URL registrations tied to API keys
CREATE TABLE webhook_subscriptions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id            UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    url                   TEXT NOT NULL CHECK (url ~ '^https?://'),
    secret                TEXT NOT NULL,
    description           TEXT,

    -- Event filtering (empty array = all partner event types)
    event_types           TEXT[] NOT NULL DEFAULT '{}',

    -- Delivery configuration
    is_active             BOOLEAN NOT NULL DEFAULT true,
    max_retries           INTEGER NOT NULL DEFAULT 3,
    timeout_seconds       INTEGER NOT NULL DEFAULT 10,

    -- Auto-pause on consecutive failures
    consecutive_failures  INTEGER NOT NULL DEFAULT 0,
    failure_threshold     INTEGER NOT NULL DEFAULT 10,
    paused_at             TIMESTAMPTZ,
    paused_reason         TEXT,

    -- Metadata
    created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_delivery_at      TIMESTAMPTZ,
    last_success_at       TIMESTAMPTZ
);

-- webhook_deliveries: audit log for every delivery attempt
CREATE TABLE webhook_deliveries (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id   UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event_id          UUID NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,

    -- Request
    request_url       TEXT NOT NULL,
    request_payload   JSONB NOT NULL,

    -- Response
    response_status   INTEGER,
    response_body     TEXT,
    response_time_ms  INTEGER,
    error_message     TEXT,

    -- Retry tracking
    attempt_number    INTEGER NOT NULL DEFAULT 1,
    next_retry_at     TIMESTAMPTZ,

    -- pending | sent | failed | retrying
    status            TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at      TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_webhook_subs_api_key ON webhook_subscriptions(api_key_id) WHERE is_active = true;
CREATE INDEX idx_webhook_subs_active ON webhook_subscriptions(is_active) WHERE paused_at IS NULL;
CREATE INDEX idx_webhook_deliveries_sub ON webhook_deliveries(subscription_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status, next_retry_at) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_webhook_deliveries_event ON webhook_deliveries(event_id);

-- RLS: service role only (Edge Functions use service_role key)
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON webhook_subscriptions
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON webhook_deliveries
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- updated_at auto-trigger (reuses existing function from 20260209000010)
DROP TRIGGER IF EXISTS set_webhook_subscriptions_updated_at ON webhook_subscriptions;
CREATE TRIGGER set_webhook_subscriptions_updated_at
    BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Cron: purge webhook_deliveries older than 90 days (daily at 3:15 AM UTC)
SELECT cron.schedule(
    'cleanup-webhook-deliveries',
    '15 3 * * *',
    $$DELETE FROM webhook_deliveries WHERE created_at < now() - interval '90 days'$$
);
