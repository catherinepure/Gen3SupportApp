-- Notification Templates System
-- Reusable notification templates with triggers, placeholders, and active/inactive toggle

-- ============================================================
-- notification_templates table
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    title_template  TEXT NOT NULL,
    body_template   TEXT NOT NULL,
    tap_action      TEXT NOT NULL DEFAULT 'none',
    trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('firmware_update', 'scooter_status', 'user_event', 'scheduled', 'manual')),
    trigger_config  JSONB NOT NULL DEFAULT '{}',
    target_type     TEXT NOT NULL CHECK (target_type IN ('all', 'role', 'hw_version', 'trigger_match', 'user')),
    target_value    TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT false,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_notification_templates_trigger ON notification_templates(trigger_type) WHERE is_active = true;
CREATE INDEX idx_notification_templates_active ON notification_templates(is_active);

-- RLS: service role only
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Add template_data and template_id columns to push_notifications
-- Stores placeholder context data for template-based notifications
-- ============================================================
ALTER TABLE push_notifications ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL;
ALTER TABLE push_notifications ADD COLUMN IF NOT EXISTS template_data JSONB DEFAULT '{}';

COMMENT ON TABLE notification_templates IS 'Reusable push notification templates with trigger conditions and placeholder support';
