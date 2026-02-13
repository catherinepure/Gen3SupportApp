-- =============================================================================
-- Workshop Portal Demo User
-- =============================================================================
-- Creates a login account for the workshop demo portal.
-- Email: workshop@pureelectric.com / Password: Hawkf13ld
-- Uses pgcrypto (in extensions schema) to generate bcrypt hash.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

INSERT INTO users (email, password_hash, first_name, last_name, user_level, is_verified, is_active, created_at)
VALUES (
  'workshop@pureelectric.com',
  extensions.crypt('Hawkf13ld', extensions.gen_salt('bf')),
  'Workshop',
  'Demo',
  'normal',
  true,
  true,
  now()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = extensions.crypt('Hawkf13ld', extensions.gen_salt('bf')),
  is_active = true;
