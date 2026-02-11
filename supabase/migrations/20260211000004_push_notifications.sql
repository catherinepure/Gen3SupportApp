-- Push Notification System: device tokens + notification history
-- Supports custom push notifications from web-admin via FCM

-- ============================================================
-- Device tokens table: stores FCM tokens linked to users
-- ============================================================
CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    device_fingerprint TEXT NOT NULL,
    device_name TEXT,
    platform TEXT DEFAULT 'android',
    app_version TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_device UNIQUE (user_id, device_fingerprint)
);

CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);
CREATE INDEX idx_device_tokens_fcm ON device_tokens(fcm_token);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE device_tokens IS 'FCM device tokens for push notifications. One row per user+device combination. Upserted on token refresh.';

-- ============================================================
-- Push notifications history/log table
-- ============================================================
CREATE TABLE IF NOT EXISTS push_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    action TEXT DEFAULT 'none',
    target_type TEXT NOT NULL CHECK (target_type IN ('all', 'user', 'role')),
    target_value TEXT,
    sent_by UUID NOT NULL REFERENCES users(id),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    total_recipients INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'completed', 'failed')),
    error_details JSONB
);

CREATE INDEX idx_push_notifications_sent_at ON push_notifications(sent_at DESC);
CREATE INDEX idx_push_notifications_sent_by ON push_notifications(sent_by);

ALTER TABLE push_notifications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE push_notifications IS 'History log of all push notifications sent from the admin panel.';
