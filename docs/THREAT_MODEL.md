# Threat Model

## Assets

Student identity data, enquiry and application records, uploaded documents, staff actions and future session credentials.

## Trust boundaries

The browser is untrusted. The API validates every request and mediates access to MongoDB and private files. MongoDB is local during development and must not be exposed publicly.

## Principal threats

- Broken access control between students, counsellors and administrators
- Injection and malformed input
- Session theft, fixation and CSRF
- Sensitive-data leakage through logs, errors or public files
- Malicious uploads and resource exhaustion
- Excessive privilege and unsafe administrative actions

## Implemented authentication controls

Strict Zod input schemas, Argon2id password hashing, generic identity responses, hashed expiring tokens, combined account/IP controls, lockout, CAPTCHA, encrypted TOTP, hashed recovery codes, opaque sessions, session-bound CSRF, deny-by-default role middleware, structured audit events and session revocation.

## Residual risks

- The in-process throttle decision uses MongoDB attempt records and has not yet been validated under distributed deployment.
- Development outbox links are intentionally available only outside production and require a trusted local environment.
- Unresolved Next dependency findings affect build-time CSS and unused image-optimization paths; compatible upstream remediation is monitored.
- Formal penetration testing remains deferred until feature completion.
- Private upload controls remain planned because documents are outside this stage.
