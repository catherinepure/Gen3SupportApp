-- Organisation API Keys
-- Enables programmatic REST API access with organisation-scoped keys,
-- territory filtering, and per-key rate limits.

-- api_keys: stores hashed API keys with org scope and permissions
CREATE TABLE api_keys (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash              TEXT NOT NULL UNIQUE,
    key_prefix            VARCHAR(16) NOT NULL,
    name                  TEXT NOT NULL,
    organisation_type     TEXT NOT NULL CHECK (organisation_type IN ('manufacturer', 'distributor', 'workshop', 'custom')),
    organisation_id       UUID,
    created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
    scopes                TEXT[] NOT NULL DEFAULT '{}',
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
    is_active             BOOLEAN NOT NULL DEFAULT true,
    expires_at            TIMESTAMPTZ,
    last_used_at          TIMESTAMPTZ,
    request_count         BIGINT NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- api_key_usage_log: audit trail for API requests
CREATE TABLE api_key_usage_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id        UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint          TEXT NOT NULL,
    ip_address        INET,
    response_status   INTEGER,
    response_time_ms  INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_api_keys_org ON api_keys(organisation_type, organisation_id) WHERE is_active = true;
CREATE INDEX idx_api_keys_created_by ON api_keys(created_by);
CREATE INDEX idx_api_key_usage_key ON api_key_usage_log(api_key_id);
CREATE INDEX idx_api_key_usage_time ON api_key_usage_log(created_at DESC);

-- RLS: service role only (Edge Functions use service_role key)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON api_keys
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON api_key_usage_log
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- updated_at auto-trigger (reuses existing function from 20260209000010)
DROP TRIGGER IF EXISTS set_api_keys_updated_at ON api_keys;
CREATE TRIGGER set_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Cron: purge api_key_usage_log entries older than 90 days (daily at 3:10 AM UTC)
SELECT cron.schedule(
    'cleanup-api-key-usage-log',
    '10 3 * * *',
    $$DELETE FROM api_key_usage_log WHERE created_at < now() - interval '90 days'$$
);
