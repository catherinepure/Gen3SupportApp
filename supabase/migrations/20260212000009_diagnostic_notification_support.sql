-- Add 'scooter_owner' to push_notifications target_type constraint
-- Add 'diagnostic_request' to notification_templates trigger_type constraint
-- Enables: auto-notify scooter owner when CS requests/cancels a diagnostic

-- ============================================================
-- push_notifications: add 'scooter_owner' and 'hw_version' to target_type
-- ============================================================
ALTER TABLE push_notifications
    DROP CONSTRAINT IF EXISTS push_notifications_target_type_check;

ALTER TABLE push_notifications
    ADD CONSTRAINT push_notifications_target_type_check
    CHECK (target_type IN ('all', 'user', 'role', 'hw_version', 'scooter_owner'));

-- ============================================================
-- notification_templates: add 'diagnostic_request' to trigger_type
--                         add 'scooter_owner' to target_type
-- ============================================================
ALTER TABLE notification_templates
    DROP CONSTRAINT IF EXISTS notification_templates_trigger_type_check;

ALTER TABLE notification_templates
    ADD CONSTRAINT notification_templates_trigger_type_check
    CHECK (trigger_type IN ('firmware_update', 'scooter_status', 'user_event', 'scheduled', 'manual', 'diagnostic_request'));

ALTER TABLE notification_templates
    DROP CONSTRAINT IF EXISTS notification_templates_target_type_check;

ALTER TABLE notification_templates
    ADD CONSTRAINT notification_templates_target_type_check
    CHECK (target_type IN ('all', 'role', 'hw_version', 'trigger_match', 'user', 'scooter_owner'));

-- ============================================================
-- Seed a default diagnostic request template (inactive by default)
-- Admin can activate + customize from the Notifications > Templates page
-- ============================================================
INSERT INTO notification_templates (name, title_template, body_template, tap_action, trigger_type, trigger_config, target_type, is_active)
VALUES (
    'Diagnostic Requested',
    'Diagnostic Check Requested',
    'A diagnostic check has been requested for your scooter. Please open the app and connect to your scooter to begin.',
    'none',
    'diagnostic_request',
    '{"event": "requested"}',
    'trigger_match',
    true
),
(
    'Diagnostic Cancelled',
    'Diagnostic Request Cancelled',
    'The diagnostic request for your scooter has been cancelled. No action is needed.',
    'none',
    'diagnostic_request',
    '{"event": "cancelled"}',
    'trigger_match',
    true
);
