# Gmail Integration Setup Guide

This guide explains how to configure Gmail API access for the MCP server to send emails via OAuth 2.0 authentication.

## 🔧 Prerequisites

1. **Google Cloud Console Access**: You need access to Google Cloud Console
2. **Gmail Account**: A Gmail account to send emails from
3. **OAuth 2.0 Setup**: Google OAuth client credentials

## 📋 Step-by-Step Setup

### Step 1: Google Cloud Console Configuration

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create or Select Project**
   - Create a new project or select an existing one
   - Note the Project ID for later use

3. **Enable Gmail API**
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click "Enable"

4. **Enable Google+ API (for user info)**
   - Search for "Google+ API" or "People API"
   - Click "Enable"

### Step 2: OAuth 2.0 Credentials Setup

1. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Select "Web application"

2. **Configure OAuth Client**
   ```
   Name: MCP Gmail Integration
   
   Authorized JavaScript origins:
   - http://localhost:8792 (for development)
   - https://your-worker.workers.dev (for production)
   
   Authorized redirect URIs:
   - http://localhost:8792/google/callback (for development)
   - https://your-worker.workers.dev/google/callback (for production)
   ```

3. **Download Credentials**
   - Download the JSON file with client ID and secret
   - Save these credentials securely

### Step 3: OAuth Consent Screen

1. **Configure Consent Screen**
   - Go to "APIs & Services" > "OAuth consent screen"
   - Choose "External" for testing or "Internal" for organization use

2. **Fill Required Information**
   ```
   App name: MCP Gmail Integration
   User support email: your-email@gmail.com
   Developer contact: your-email@gmail.com
   ```

3. **Add Scopes**
   Add these scopes for Gmail functionality:
   ```
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/userinfo.profile
   https://www.googleapis.com/auth/userinfo.email
   ```

4. **Add Test Users** (for external apps in testing)
   - Add email addresses that can test the application
   - Include your own Gmail address

### Step 4: Environment Configuration

1. **Development Environment**
   Create or update `.dev.vars`:
   ```bash
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GMAIL_API_VERSION=v1
   GMAIL_SCOPES=https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.profile
   ```

2. **Production Environment**
   Set secrets using Wrangler:
   ```bash
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   ```

### Step 5: Testing the Integration

1. **Start Development Server**
   ```bash
   npm run dev
   ```

2. **Access OAuth Flow**
   - Visit: http://localhost:8792/authorize
   - Choose "Google" as the OAuth provider
   - Complete the Google OAuth consent flow

3. **Test Gmail Tools**
   Once authenticated, you can use these MCP tools:
   
   **Send Email:**
   ```json
   {
     "tool": "sendEmail",
     "arguments": {
       "to": ["recipient@example.com"],
       "subject": "Test Email from MCP",
       "body": "This is a test email sent via Gmail API through MCP server.",
       "isHtml": false
     }
   }
   ```
   
   **Get Email Profile:**
   ```json
   {
     "tool": "getEmailProfile",
     "arguments": {}
   }
   ```

## 🛡️ Security Features

### Email Validation
- **Recipient Limits**: Maximum 50 total recipients (25 To, 25 CC, 25 BCC)
- **Email Format**: RFC 5322 compliant email validation
- **Content Limits**: Subject max 998 chars, body max 10MB

### Anti-Phishing Protection
- **Content Scanning**: Detects suspicious patterns and spam indicators
- **Dangerous Content**: Blocks JavaScript, iframes, and script tags
- **Phishing Detection**: Identifies common phishing language patterns

### Rate Limiting
- **Send Email**: 5 emails per minute
- **Read Operations**: 50 operations per minute
- **Search Operations**: 20 operations per minute

## 🔍 Troubleshooting

### Common Issues

**"Invalid Grant" Error:**
- Token expired - re-authenticate through OAuth flow
- Check that redirect URI matches exactly

**"Insufficient Permissions" Error:**
- Verify Gmail API is enabled
- Check OAuth scopes include `gmail.send`
- Ensure user granted all required permissions

**"Quota Exceeded" Error:**
- Gmail API has daily quotas
- Check Google Cloud Console > APIs & Services > Quotas
- Consider implementing request throttling

**"Bad Request" Error:**
- Check email format and recipients
- Verify subject and body content validation
- Review phishing detection warnings

### Debug Tips

1. **Check OAuth Token**
   - Verify token has correct scopes
   - Test token with Google's OAuth playground

2. **API Limits**
   - Monitor quota usage in Google Cloud Console
   - Implement exponential backoff for retries

3. **Content Validation**
   - Review security validation errors
   - Check for blocked content patterns

## 📊 Production Considerations

### Quota Management
- **Daily Quota**: 1 billion quota units per day (default)
- **Per-User Rate Limit**: 250 quota units per user per second
- **Sending Limits**: 500 recipients per message, 1000 messages per day per user

### Security Best Practices
- **Token Management**: Store tokens securely, implement refresh logic
- **Content Filtering**: Enable all security validations
- **Monitoring**: Use Sentry for error tracking and performance monitoring
- **Access Control**: Limit users who can send emails via `ALLOWED_USERNAMES`

### Compliance
- **CAN-SPAM Act**: Include unsubscribe links in marketing emails
- **GDPR**: Handle user data appropriately
- **Terms of Service**: Ensure compliance with Gmail's terms

## 🔗 Related Documentation

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/docs)

---

This setup enables secure, authenticated Gmail integration with comprehensive security validation and monitoring through the MCP server.