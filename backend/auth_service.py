"""
User Authentication Service with SendGrid Email Verification
Flask API for user registration, login, and email verification
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import hashlib
import secrets
import os
from datetime import datetime, timedelta
from supabase import create_client, Client
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content

app = Flask(__name__)
CORS(app)

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@pureelectric.com")  # Change to your verified SendGrid sender
APP_URL = os.getenv("APP_URL", "http://localhost:5000")  # Your app's base URL

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def hash_password(password: str) -> str:
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()

def generate_token() -> str:
    """Generate a secure random token"""
    return secrets.token_urlsafe(32)

def send_verification_email(email: str, token: str):
    """Send email verification link via SendGrid"""
    verification_url = f"{APP_URL}/verify?token={token}"

    message = Mail(
        from_email=Email(FROM_EMAIL),
        to_emails=To(email),
        subject='Verify your Pure Electric account',
        html_content=f'''
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Welcome to Pure Electric Firmware Updater</h2>
            <p>Thank you for registering! Please verify your email address by clicking the link below:</p>
            <p>
                <a href="{verification_url}"
                   style="background-color: #4CAF50; color: white; padding: 12px 24px;
                          text-decoration: none; border-radius: 4px; display: inline-block;">
                    Verify Email Address
                </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="color: #666;">{verification_url}</p>
            <p style="margin-top: 30px; color: #999; font-size: 12px;">
                This link will expire in 24 hours. If you didn't create this account, please ignore this email.
            </p>
        </body>
        </html>
        '''
    )

    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        print(f"Email sent to {email}, status: {response.status_code}")
        return True
    except Exception as e:
        print(f"Error sending email: {str(e)}")
        return False

@app.route('/api/register', methods=['POST'])
def register():
    """Register a new user"""
    data = request.json
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    try:
        # Check if user already exists
        existing = supabase.table('users').select('id').eq('email', email).execute()
        if existing.data:
            return jsonify({'error': 'Email already registered'}), 409

        # Generate verification token
        verification_token = generate_token()
        expires_at = datetime.utcnow() + timedelta(hours=24)

        # Create user
        password_hash = hash_password(password)
        result = supabase.table('users').insert({
            'email': email,
            'password_hash': password_hash,
            'role': 'user',  # Default role
            'is_verified': False,
            'verification_token': verification_token,
            'verification_token_expires': expires_at.isoformat()
        }).execute()

        if not result.data:
            return jsonify({'error': 'Failed to create user'}), 500

        # Send verification email
        if send_verification_email(email, verification_token):
            return jsonify({
                'success': True,
                'message': 'Registration successful. Please check your email to verify your account.'
            }), 201
        else:
            return jsonify({
                'success': True,
                'message': 'Registration successful, but failed to send verification email. Please contact support.',
                'warning': 'email_failed'
            }), 201

    except Exception as e:
        print(f"Registration error: {str(e)}")
        return jsonify({'error': 'Registration failed'}), 500

@app.route('/api/verify', methods=['POST'])
def verify_email():
    """Verify user email with token"""
    data = request.json
    token = data.get('token', '')

    if not token:
        return jsonify({'error': 'Verification token required'}), 400

    try:
        # Find user with this token
        result = supabase.table('users')\
            .select('id, verification_token_expires, is_verified')\
            .eq('verification_token', token)\
            .execute()

        if not result.data:
            return jsonify({'error': 'Invalid verification token'}), 404

        user = result.data[0]

        # Check if already verified
        if user['is_verified']:
            return jsonify({'message': 'Email already verified'}), 200

        # Check if token expired
        expires_at = datetime.fromisoformat(user['verification_token_expires'].replace('Z', '+00:00'))
        if datetime.utcnow() > expires_at.replace(tzinfo=None):
            return jsonify({'error': 'Verification token expired'}), 400

        # Mark user as verified
        supabase.table('users').update({
            'is_verified': True,
            'verification_token': None,
            'verification_token_expires': None
        }).eq('id', user['id']).execute()

        return jsonify({
            'success': True,
            'message': 'Email verified successfully. You can now log in.'
        }), 200

    except Exception as e:
        print(f"Verification error: {str(e)}")
        return jsonify({'error': 'Verification failed'}), 500

@app.route('/api/login', methods=['POST'])
def login():
    """Login user and create session"""
    data = request.json
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    device_info = data.get('device_info', '')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    try:
        # Find user
        password_hash = hash_password(password)
        result = supabase.table('users')\
            .select('id, email, role, is_verified, is_active, distributor_id')\
            .eq('email', email)\
            .eq('password_hash', password_hash)\
            .execute()

        if not result.data:
            return jsonify({'error': 'Invalid email or password'}), 401

        user = result.data[0]

        # Check if user is active
        if not user['is_active']:
            return jsonify({'error': 'Account is disabled'}), 403

        # Check if email is verified
        if not user['is_verified']:
            return jsonify({'error': 'Please verify your email before logging in'}), 403

        # Create session token
        session_token = generate_token()
        expires_at = datetime.utcnow() + timedelta(days=30)

        supabase.table('user_sessions').insert({
            'user_id': user['id'],
            'session_token': session_token,
            'device_info': device_info,
            'expires_at': expires_at.isoformat()
        }).execute()

        # Update last login
        supabase.table('users').update({
            'last_login': datetime.utcnow().isoformat()
        }).eq('id', user['id']).execute()

        return jsonify({
            'success': True,
            'session_token': session_token,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'role': user['role'],
                'distributor_id': user.get('distributor_id')
            }
        }), 200

    except Exception as e:
        print(f"Login error: {str(e)}")
        return jsonify({'error': 'Login failed'}), 500

@app.route('/api/validate-session', methods=['POST'])
def validate_session():
    """Validate a session token"""
    data = request.json
    session_token = data.get('session_token', '')

    if not session_token:
        return jsonify({'error': 'Session token required'}), 400

    try:
        # Find active session
        result = supabase.table('user_sessions')\
            .select('user_id, expires_at')\
            .eq('session_token', session_token)\
            .execute()

        if not result.data:
            return jsonify({'error': 'Invalid session'}), 401

        session = result.data[0]

        # Check if expired
        expires_at = datetime.fromisoformat(session['expires_at'].replace('Z', '+00:00'))
        if datetime.utcnow() > expires_at.replace(tzinfo=None):
            return jsonify({'error': 'Session expired'}), 401

        # Get user info
        user_result = supabase.table('users')\
            .select('id, email, role, is_active, distributor_id')\
            .eq('id', session['user_id'])\
            .execute()

        if not user_result.data or not user_result.data[0]['is_active']:
            return jsonify({'error': 'User not found or inactive'}), 401

        user = user_result.data[0]

        # Update last activity
        supabase.table('user_sessions').update({
            'last_activity': datetime.utcnow().isoformat()
        }).eq('session_token', session_token).execute()

        return jsonify({
            'valid': True,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'role': user['role'],
                'distributor_id': user.get('distributor_id')
            }
        }), 200

    except Exception as e:
        print(f"Validation error: {str(e)}")
        return jsonify({'error': 'Validation failed'}), 500

@app.route('/api/resend-verification', methods=['POST'])
def resend_verification():
    """Resend verification email"""
    data = request.json
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify({'error': 'Email required'}), 400

    try:
        # Find unverified user
        result = supabase.table('users')\
            .select('id, is_verified')\
            .eq('email', email)\
            .execute()

        if not result.data:
            # Don't reveal if email exists
            return jsonify({'message': 'If the email exists, a verification link has been sent'}), 200

        user = result.data[0]

        if user['is_verified']:
            return jsonify({'message': 'Email already verified'}), 200

        # Generate new token
        verification_token = generate_token()
        expires_at = datetime.utcnow() + timedelta(hours=24)

        supabase.table('users').update({
            'verification_token': verification_token,
            'verification_token_expires': expires_at.isoformat()
        }).eq('id', user['id']).execute()

        # Send email
        send_verification_email(email, verification_token)

        return jsonify({'message': 'Verification email sent'}), 200

    except Exception as e:
        print(f"Resend verification error: {str(e)}")
        return jsonify({'error': 'Failed to resend verification'}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    """Logout user and invalidate session"""
    data = request.json
    session_token = data.get('session_token', '')

    if session_token:
        try:
            supabase.table('user_sessions').delete().eq('session_token', session_token).execute()
        except:
            pass

    return jsonify({'success': True}), 200

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok'}), 200

if __name__ == '__main__':
    # Make sure to set environment variables before running:
    # export SUPABASE_URL="your_supabase_url"
    # export SUPABASE_KEY="your_supabase_key"
    # export FROM_EMAIL="your_verified_sendgrid_sender@domain.com"
    app.run(debug=True, host='0.0.0.0', port=5000)
