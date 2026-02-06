# User Registration System Setup Guide

This document explains how to set up the user registration and authentication system with SendGrid email verification.

## Overview

The system implements:
- User registration with email/password
- Email verification via SendGrid
- Session-based authentication
- Role-based access control (admin vs regular users)
- Admin users can manage scooters in admin tool
- Regular users can only upload firmware

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌──────────┐
│  Android    │  HTTP   │   Flask      │  REST   │ Supabase │
│  App        │ ◄─────► │   Backend    │ ◄─────► │ Database │
│             │         │              │         │          │
└─────────────┘         └──────────────┘         └──────────┘
                               │
                               │ SMTP
                               ▼
                        ┌──────────────┐
                        │  SendGrid    │
                        │  Email       │
                        └──────────────┘
```

## Setup Instructions

### 1. Database Setup

Run the schema migration in Supabase SQL Editor:

```bash
# In Supabase dashboard, go to SQL Editor and run:
user_registration_schema.sql
```

This creates:
- `users` table (email, password hash, role, verification status)
- `user_sessions` table (active sessions)
- `password_reset_tokens` table (for future password reset feature)
- `user_audit_log` table (for tracking user actions)

### 2. SendGrid Setup

1. **Verify Your SendGrid Sender Email:**
   - Go to SendGrid Dashboard: https://app.sendgrid.com
   - Navigate to Settings > Sender Authentication
   - Click "Verify a Single Sender"
   - Enter your sender email (e.g., noreply@pureelectric.com)
   - Verify the email

2. **Set the API Key as an environment variable:**
   ```
   export SENDGRID_API_KEY="your-sendgrid-api-key"
   ```

### 3. Backend Setup

1. **Install Python dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your values:
   # - SUPABASE_URL (from your Supabase project settings)
   # - SUPABASE_KEY (anon/public key from Supabase)
   # - FROM_EMAIL (your verified SendGrid sender email)
   ```

3. **Run the Flask backend:**
   ```bash
   python auth_service.py
   ```

   The backend will run on `http://localhost:5000`

4. **For production, deploy to a cloud service:**
   - Heroku
   - Railway
   - AWS Lambda + API Gateway
   - Google Cloud Run
   - DigitalOcean App Platform

### 4. Android App Configuration

1. **Update the backend URL in AuthClient.java:**
   ```java
   // Line 14 in AuthClient.java
   private static final String BASE_URL = "https://your-backend.herokuapp.com/api";
   ```

2. **Update AndroidManifest.xml** to set LoginActivity as the launcher:
   ```xml
   <activity
       android:name=".LoginActivity"
       android:exported="true">
       <intent-filter>
           <action android:name="android.intent.action.MAIN" />
           <category android:name="android.intent.category.LAUNCHER" />
       </intent-filter>
   </activity>

   <activity
       android:name=".RegisterActivity"
       android:exported="false" />

   <activity
       android:name=".FirmwareUpdaterActivity"
       android:exported="false"
       android:screenOrientation="portrait" />
   ```

3. **Add required permissions** (should already exist):
   ```xml
   <uses-permission android:name="android.permission.INTERNET" />
   ```

## User Flow

### Registration Flow
1. User opens app → sees LoginActivity
2. Clicks "Register" → RegisterActivity
3. Enters email and password (8+ chars)
4. Backend creates user with `is_verified=false`
5. SendGrid sends verification email
6. User clicks link in email
7. Backend marks `is_verified=true`
8. User can now log in

### Login Flow
1. User enters email/password
2. Backend validates credentials
3. Checks if email is verified
4. Creates session token (30-day expiry)
5. Returns session token to app
6. App stores token in SharedPreferences
7. User proceeds to FirmwareUpdaterActivity

### Session Management
- Sessions expire after 30 days of inactivity
- On app launch, validates existing session
- If valid, skips login screen
- If invalid/expired, shows login screen

## Role-Based Access

### Regular Users (`role='user'`)
- Can log in to Android app
- Can upload firmware to scooters
- Cannot access admin tool

### Admin Users (`role='admin'`)
- Can log in to Android app
- Can upload firmware to scooters
- Can access admin tool (future: add login to admin_gui.py)

### Granting Admin Access

To make a user an admin, run in Supabase SQL Editor:

```sql
UPDATE users
SET role = 'admin'
WHERE email = 'user@example.com';
```

## API Endpoints

### POST /api/register
Register a new user
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### POST /api/login
Login and get session token
```json
{
  "email": "user@example.com",
  "password": "password123",
  "device_info": "Samsung Galaxy S21 (Android 13)"
}
```

### POST /api/verify
Verify email with token (called from email link)
```json
{
  "token": "verification_token_here"
}
```

### POST /api/validate-session
Check if session is still valid
```json
{
  "session_token": "session_token_here"
}
```

### POST /api/resend-verification
Resend verification email
```json
{
  "email": "user@example.com"
}
```

### POST /api/logout
Invalidate session
```json
{
  "session_token": "session_token_here"
}
```

## Security Features

1. **Password Hashing:** SHA-256 (consider upgrading to bcrypt for production)
2. **Secure Tokens:** Generated using `secrets.token_urlsafe(32)`
3. **Token Expiry:** Verification tokens expire in 24 hours, sessions in 30 days
4. **Email Verification:** Users must verify email before logging in
5. **Session Management:** Automatic cleanup of expired sessions
6. **Account Activation:** Inactive accounts removed after 7 days if not verified

## Database Schema

### users table
- `id` - UUID primary key
- `email` - Unique email address
- `password_hash` - SHA-256 hash
- `role` - 'user' or 'admin'
- `is_verified` - Email verification status
- `verification_token` - Temporary token for email verification
- `verification_token_expires` - Token expiry timestamp
- `distributor_id` - Optional link to distributor (for scoped access)
- `created_at` - Registration timestamp
- `last_login` - Last login timestamp
- `is_active` - Account active status

### user_sessions table
- `id` - UUID primary key
- `user_id` - Reference to users table
- `session_token` - Unique session token
- `device_info` - Device description
- `created_at` - Session creation time
- `expires_at` - Session expiry time
- `last_activity` - Last activity timestamp

## Maintenance

### Clean up expired data
Run these periodically (or set up as cron jobs):

```sql
-- Remove expired sessions
DELETE FROM user_sessions WHERE expires_at < now();

-- Remove expired password reset tokens
DELETE FROM password_reset_tokens WHERE expires_at < now() AND used = false;

-- Remove unverified accounts older than 7 days
DELETE FROM users WHERE is_verified = false AND created_at < now() - INTERVAL '7 days';
```

Or use the built-in functions:
```sql
SELECT cleanup_expired_sessions();
SELECT cleanup_expired_verification_tokens();
```

## Testing

1. **Register a test user:**
   ```bash
   curl -X POST http://localhost:5000/api/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'
   ```

2. **Check verification email in SendGrid activity log**

3. **Manually verify user for testing:**
   ```sql
   UPDATE users SET is_verified = true WHERE email = 'test@example.com';
   ```

4. **Login:**
   ```bash
   curl -X POST http://localhost:5000/api/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123","device_info":"Test Device"}'
   ```

## Troubleshooting

### Email not sending
- Check SendGrid API key is valid
- Verify sender email in SendGrid dashboard
- Check SendGrid activity log for errors
- Ensure FROM_EMAIL matches verified sender

### "Invalid session" errors
- Session may have expired (30 days)
- User needs to log in again
- Check user_sessions table for active sessions

### Can't register duplicate email
- Email already exists in database
- Use password reset flow (to be implemented)
- Or manually delete from database for testing

## Future Enhancements

- [ ] Password reset flow
- [ ] OAuth/Social login (Google, Apple)
- [ ] Two-factor authentication (2FA)
- [ ] Upgrade to bcrypt for password hashing
- [ ] Add login to admin tool GUI
- [ ] Audit log viewer for admins
- [ ] User management UI in admin tool
- [ ] Rate limiting on API endpoints
- [ ] CAPTCHA on registration

## Support

For issues or questions about the authentication system, contact your development team.
