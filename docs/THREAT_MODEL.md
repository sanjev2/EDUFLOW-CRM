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
- Privacy export leakage, mass-assignment import and prototype pollution

## Implemented authentication controls

Strict Zod input schemas, Argon2id password hashing, generic identity responses, hashed expiring tokens, combined account/IP controls, lockout, CAPTCHA, encrypted TOTP, hashed recovery codes, opaque sessions, session-bound CSRF, deny-by-default role middleware, structured audit events and session revocation.

### Private-document threats and controls

Document controls address malicious content, MIME spoofing, double extensions, oversized bodies, path traversal, symbolic-link escape, predictable object names, direct-object-reference attacks and public caching. The server checks extension, declared type and signature, limits files to 5 MB, stores random names inside a canonical private root, verifies SHA-256 integrity on download and returns inaccessible and nonexistent resources through the same generic response. Counsellor access depends on the current assignment record; administrator access is explicit, MFA-backed and audited. Malware scanning, off-host backups and production storage isolation remain deployment-stage requirements.

Email threats include account enumeration, resend flooding, Host-header link poisoning, SMTP credential disclosure, header injection, HTML injection, token leakage and unlimited undelivered tokens. Controls include generic responses, hashed IP/account throttles, validated `PUBLIC_APP_URL`, validated sender/recipient fields, HTML escaping, structured-log redaction, token hashing and invalidation after failed delivery. Production cannot fall back to the development outbox.

## Residual risks

- The in-process throttle decision uses MongoDB attempt records and has not yet been validated under distributed deployment.
- Development outbox links are intentionally available only outside production and require a trusted local environment.
- Unresolved Next dependency findings affect build-time CSS and unused image-optimization paths; compatible upstream remediation is monitored.
- Formal penetration testing remains deferred until feature completion.

Privacy controls address cross-account export, excessive fields, cache leakage, mass assignment, oversized JSON and prototype pollution. The session determines export/import ownership; strict allowlists, 100 KB limits, CSRF, confirmation, rate limits and sanitized auditing protect import. Export omits secrets, storage identifiers and document bytes.

## CRM threats and controls

- **Cross-student/cross-counsellor IDOR:** user IDs are derived for student self-service and active assignment checks gate staff resources.
- **Mass assignment:** every mutation uses strict Zod objects; role, owner, official stage and assignment fields are absent from public schemas.
- **Workflow bypass:** stage changes use an explicit forward transition map; administrator corrections are isolated and reasoned.
- **Duplicate workflow creation:** partial unique indexes protect active applications/assignments and an idempotency key protects automatic tasks.
- **Internal information leakage:** students have no notes/tasks route permission; summaries expose aggregates and safe fields only.
- **Stored script content:** notes remain plain strings and are never rendered through raw HTML.
