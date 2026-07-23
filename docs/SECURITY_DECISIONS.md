# Security Decisions

- The Express backend is the security boundary. Clients will never be trusted to enforce access.
- Authorisation is deny-by-default and explicitly permits role-and-resource actions using reusable authentication, verification, MFA, freshness and role middleware.
- Authentication uses Argon2id, separate password history and an optional server-side pepper. See `AUTHENTICATION_DESIGN.md`.
- Sessions are opaque, server-stored and revocable. Only hashes of session and CSRF values are stored. Cookies are HttpOnly, SameSite=Lax and Secure in production.
- Cookie-authenticated mutations require a session-bound custom-header CSRF value and origin validation.
- TOTP secrets use AES-256-GCM authenticated encryption. Recovery codes are displayed once and stored only as hashes.
- Uploaded files will be private, stored outside public web roots, renamed with generated identifiers, validated by type and size, and served only after authorisation.
- Logs use structured events and redact cookies, authorisation headers, passwords, tokens and secrets. Sensitive application content must not be logged.
- CORS is restricted to the configured frontend origin and request bodies are size-limited.
- Formal penetration testing is deferred until feature implementation is complete.

## CRM resource authorisation

- Student profile/application endpoints derive the student identifier from the authenticated session; supplied roles, owners, stages and assignments are rejected by strict schemas.
- Counsellor access requires a current active assignment for the requested student, preventing cross-counsellor IDOR.
- Administrators use dedicated assignment and stage-correction endpoints with mandatory reasons. Normal profile or application updates cannot change protected fields.
- Application transitions use a server-side allow-list state machine and append immutable history rather than rewriting evidence.
- Automatic assignment selects the lowest active workload, then email and `_id` for deterministic ties. Partial unique indexes prevent duplicate active assignments/applications.
- Automatic follow-up tasks use a unique `enquiry-follow-up:<studentId>` key. Repeated requests cannot duplicate the task.
- Counselling notes are plain text; the frontend renders them as React text nodes rather than HTML.

## Dependency audit

The baseline audit contained 4 moderate, 3 high and 1 critical finding. Updating Vitest and its Vite toolchain removed the critical and all development-tool findings. The remaining Next report is an aggregate of bundled PostCSS `<8.5.10` and optional Sharp `<0.35.0`: PostCSS processes developer-owned CSS only during the build, and EduFlow currently does not invoke Next image optimization on untrusted images, so neither affected path is runtime-reachable in the current application. npm offers only an incorrect downgrade to Next 9.3.3; no `--force` or breaking downgrade was used. These three findings remain tracked pending a compatible Next release.
