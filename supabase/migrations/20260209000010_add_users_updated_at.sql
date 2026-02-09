-- Add updated_at column to users table for audit trail and modification tracking
-- Automatically updates whenever any user record is modified

-- Add updated_at column (defaults to now for existing records)
ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();

-- Create reusable trigger function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger on users table
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add index for querying by updated_at
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);

COMMENT ON COLUMN users.updated_at IS 'Timestamp of last modification to this user record (auto-updated via trigger)';
COMMENT ON FUNCTION update_updated_at_column() IS 'Trigger function to automatically update updated_at column on record modification';
