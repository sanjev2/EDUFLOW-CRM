# Authentication Design

## Identity and roles

EduFlow uses exactly `STUDENT`, `COUNSELLOR` and `ADMIN`. Public registration always assigns `STUDENT` and rejects unexpected fields. Authenticated, MFA-complete, freshly authenticated administrators may create counsellors or switch only between student and counsellor. No normal API assigns `ADMIN`.

The initial administrator is created once with:

```powershell
$env:ADMIN_NAME="Initial Administrator"
$env:ADMIN_EMAIL="<initial administrator email>"
$env:ADMIN_SETUP_OUTPUT_FILE="<an ignored, access-controlled runtime file>"
npm.cmd run bootstrap:admin --workspace=@eduflow/backend
```

The script never accepts or prints a default password. For a new account it creates an unrecoverable random credential, stores only hashes of single-use verification and password-setup tokens, and writes the one-time links to the explicitly configured ignored runtime file. For an existing active account, email verification is required before promotion and all sessions are revoked. The bootstrap is idempotent for the same administrator and refuses to overwrite a different administrator. Every creation or promotion is audited. After verification and password setup, an administrator remains confined to MFA enrolment, logout, current-session and CSRF endpoints until TOTP setup succeeds.

## Passwords

Passwords are 12–128 characters and require uppercase, lowercase, numeric and special characters; common password fragments are rejected. Argon2id uses 19,456 KiB memory, two iterations and one lane by default, with an optional server-side pepper. The parameters are configurable for controlled tuning. The five latest Argon2 hashes are retained separately for reuse checks. Passwords expire after a configurable 90 days.

## Verification and reset

Email verification and password reset use 256-bit random, single-use, expiring tokens. MongoDB stores SHA-256 token hashes only. Delivery uses a provider-independent service with plain-text and minimal HTML messages. Links are constructed only from validated `PUBLIC_APP_URL`, never the request Host header.

Outbox mode is development/testing-only and writes labelled messages to ignored `.runtime/email-outbox.json`; token URLs are not returned by public APIs. SMTP mode uses TLS-capable standard SMTP through Nodemailer. Production rejects outbox mode and requires complete SMTP/sender configuration. Provider acceptance requires the intended envelope recipient to be accepted and not rejected or pending. Failed delivery invalidates only the newly issued token and records sanitized operational evidence, while a previously valid replacement token remains usable until the provider accepts its successor. A completed password reset invalidates every session.

`POST /api/v1/auth/resend-verification` always gives the same response for unknown, verified and ineligible accounts. Requests are normalized, recorded and rate-limited by both email hash and IP hash. Eligible resend requests create a candidate replacement and invalidate older unused verification tokens only after the provider accepts that candidate.

## Login protections

Login returns generic invalid-credential responses. Failures are tracked as privacy-preserving keyed email/IP hashes. Controls combine a 15-minute IP threshold, per-account failures, progressive delay, a 15-minute account lock after five failures, security alerts and a five-minute single-use local arithmetic CAPTCHA after repeated failures. CAPTCHA complements rather than replaces throttling and lockout.

## Sessions and CSRF

Sessions use a 256-bit opaque cookie value. MongoDB stores only SHA-256 token and CSRF hashes. The cookie is `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` in production. Default absolute lifetime is 24 hours; idle lifetime is 30 minutes. Activity writes are throttled to once per five minutes.

Sessions rotate after password authentication, MFA completion and password change. Logout, individual revocation and logout-all are server-side invalidations. Session output contains limited device, activity and approximate IP metadata but no token.

Authenticated state-changing requests require a session-bound CSRF token in `x-csrf-token`. Comparison is timing-safe and cross-origin requests are rejected. Public registration, verification, login, password-reset and MFA-login endpoints have no authenticated session and are therefore not CSRF-gated. CSRF values rotate with sessions and on explicit refresh.

## MFA

TOTP uses `otplib`. Secrets are AES-256-GCM encrypted with a key derived from `FIELD_ENCRYPTION_KEY`; plaintext is shown only during enrolment. Activation requires a valid TOTP. Ten recovery codes are shown once and stored only as hashes. Login challenges expire after five minutes, allow five attempts and are invalidated after success. Each recovery code is consumed once.

Disabling MFA requires the password and current TOTP, and is forbidden for administrators. Regeneration requires a fresh, MFA-complete session. Important MFA events create audit records and security alerts.

## Audit and alerting

Audit records are append-oriented and have no edit/delete API. Events cover registration, verification, login, lockout, CAPTCHA, sessions, MFA, recovery codes, passwords, roles, account state and denied access. Metadata keys suggesting passwords, secrets, tokens, cookies, answers or codes are discarded. Request logging separately redacts sensitive headers and body fields.
