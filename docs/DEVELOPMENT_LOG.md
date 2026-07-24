# Development Log

## Foundation stage

- Established npm workspaces for Next.js and Express.
- Added responsive public, authentication-placeholder and role-dashboard layouts.
- Added MongoDB startup gating, database health reporting and graceful shutdown.
- Added security middleware, constrained CORS, request IDs, structured redacted logging and consistent errors.
- Added initial API and frontend rendering tests.
- Deferred authentication, MFA and all CRM business functionality as required.

## Authentication and authorisation stage

- Triaged 8 dependency findings. Compatible Vitest/Vite upgrades removed the critical development-server issue and four related findings.
- Retained 3 tracked Next findings because npm proposes an incompatible Next 9 downgrade. The underlying PostCSS path is build-only with trusted CSS; Sharp image optimization is unused. No forced audit fix was applied.
- Added ten focused security models with strict schemas, indexes, hidden secrets, timestamps and TTL expiry.
- Added Argon2id password policy/history, email verification, reset, brute-force tracking, lockout, CAPTCHA and development-only outbox.
- Added opaque hashed sessions, idle/absolute expiry, rotation, revocation, hardened cookies and session-bound CSRF.
- Added encrypted TOTP, hashed one-time recovery codes and forced administrator enrolment.
- Added deny-by-default role middleware, controlled counsellor creation, account state/role administration and an initial-admin bootstrap.
- Replaced authentication placeholders with responsive registration, verification, login, CAPTCHA, MFA, recovery, reset, expiry, security/session and access-denied interfaces.
- Added MongoDB-isolated security integration tests using only `eduflow_crm_test`.
- CRM profiles, applications, documents, tasks, automation and formal penetration testing remain deferred.

## Core CRM stage

- Added separate student profile, application, stage-history, assignment, note and task models.
- Added server-calculated profile completion and strict self/assigned/admin ownership rules.
- Added a seven-stage application state machine, early student cancellation and reasoned administrator correction.
- Added deterministic least-workload automatic assignment with unique active-assignment protection and a no-counsellor operational alert.
- Added idempotent 24-hour enquiry follow-up tasks, internal plain-text notes and role-safe task workflows.
- Added role-specific dashboard summaries and original responsive EduFlow application shell.
- Added private local PDF/JPEG/PNG document storage with 5 MB limits, signature validation, cryptographically random storage keys, hash verification, authenticated delivery and cleanup-safe security tests.
- Added student document management, assigned-counsellor document context and audited administrator oversight. No malware scanner is included; hardened production storage, backups and scanning remain future deployment work.
- Added student, counsellor and administrator CRM pages using the locked colour/token system.
- Added CRM integration and interface tests. Secure documents, final landing redesign and formal penetration testing remain deferred.
