# Security Policy

## Reporting a Security Vulnerability

The SRM Academia Telegram Bot team takes security seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report a Vulnerability

Please report security vulnerabilities by send whatsapp at:
[WhatsApp Group](https://chat.whatsapp.com/Jm1WyAiunsxGqrMkw0dVLb)

Please include:
- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact of the vulnerability
- Any potential solutions you've identified

### Response Timeline

We aim to respond to security reports within 48 hours, and will keep you updated as we address the issue.

## Supported Versions

Only the latest version of the SRM Academia Telegram Bot is supported with security updates.

## Handling of Sensitive Data

The SRM Academia Telegram Bot handles sensitive user data and academic information:

- **Credentials**: Login credentials are never stored - only authentication tokens are retained
- **Messages**: All messages containing credentials are deleted after processing
- **Database**: User data is stored in MongoDB with appropriate access controls
- **API Tokens**: Authentication tokens are stored securely and used only for authorized requests

## Security Best Practices for Users

1. **Never share your bot sessions** with others
2. **Use /logout** when you've finished using the bot on shared devices
3. **Set up 2FA** on your Telegram account
4. **Verify** you're using the official bot (@SRMAcademiaBot)
5. **Report suspicious behavior** immediately

## Vulnerability Disclosure Policy

- Once a vulnerability is reported, we will acknowledge receipt within 48 hours
- We will validate and reproduce the issue
- A fix will be developed and tested
- Security patches will be deployed promptly
- Reporters will be credited (unless they request anonymity)
- Public disclosure will occur after the fix is deployed

## Security Measures in Place

- Credentials are deleted from chat history after login
- Authentication tokens are stored securely
- Session validation before accessing sensitive data
- HTTPS for all API communications
- Regular security reviews of dependencies
- Rate limiting to prevent abuse

## Contact

For security concerns, please contact:
- Email: anujtiwari4454@outllok.com
