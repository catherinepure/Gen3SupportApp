-- User Notification Log: per-user tracking of push notification delivery
-- Enables workshop/maintenance users to see a history of notifications sent to them

-- ============================================================
-- User notification log table
-- ============================================================
CREATE TABLE IF NOT EXISTS user_notification_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id   UUID NOT NULL REFERENCES push_notifications(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    body              TEXT NOT NULL,
    tap_action        TEXT DEFAULT 'none',
    delivered         BOOLEAN NOT NULL DEFAULT false,
    read_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary query: user's notifications newest-first
CREATE INDEX idx_user_notif_log_user_created ON user_notification_log(user_id, created_at DESC);

-- For joining back to push_notifications
CREATE INDEX idx_user_notif_log_notification ON user_notification_log(notification_id);

-- Fast unread count per user
CREATE INDEX idx_user_notif_log_unread ON user_notification_log(user_id) WHERE read_at IS NULL;

ALTER TABLE user_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on user_notification_log"
    ON user_notification_log
    FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE user_notification_log IS 'Per-user delivery log for push notifications. Title/body denormalized because per-user placeholders produce different text per recipient.';

-- ============================================================
-- Cron: purge entries older than 180 days
-- ============================================================
SELECT cron.schedule(
    'cleanup-user-notification-log',
    '30 3 * * *',
    $$DELETE FROM user_notification_log WHERE created_at < now() - interval '180 days'$$
);
