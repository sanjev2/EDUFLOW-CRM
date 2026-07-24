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

## Private document storage

- Private files are stored only below the configured backend `UPLOAD_ROOT`; Express never exposes that directory statically and APIs never return storage paths or keys.
- Stored names use 192 bits of cryptographic randomness. Canonical-path, regular-file and symbolic-link checks keep reads and deletes inside the upload root.
- Uploads accept only PDF, JPEG and PNG up to 5 MB. Extension, declared MIME type and magic/signature structure must agree; empty, double-extension, traversal, mismatched and detectably embedded active-content files are rejected.
- File bytes remain outside MongoDB. Metadata includes ownership, optional application relationship, controlled category, safe original name, detected type, size and SHA-256 integrity data. Integrity is rechecked before download.
- Downloads use authenticated controllers with resource-level authorization, attachment disposition, `nosniff` and private no-store caching. Student ownership, current counsellor assignment and explicit administrator authorization are evaluated server-side.
- Mutations require the existing session CSRF token and an exact trusted Origin. Upload attempts are rate limited. Upload, download, deletion, denial and validation rejection are audited without file contents or storage paths.
- No malware-scanning engine is included. Production requires hardened private storage, backups, retention controls and malware scanning.

## Email delivery

- Verification and reset links use validated `PUBLIC_APP_URL`; attacker-controlled Host headers are never used.
- Outbox delivery is permitted only outside production and is stored under the ignored runtime directory. SMTP success does not also write an outbox copy.
- SMTP configuration validates host, port, secure mode, credentials and sender identity. STARTTLS is required when implicit TLS is disabled.
- Messages include fixed subjects plus plain-text and escaped minimal HTML. Recipient and sender values reject header injection.
- Public registration, resend and recovery responses remain generic. Resend/recovery abuse controls use normalized email and IP hashes.
- Delivery failures never expose provider details. Newly issued undelivered tokens are invalidated and sanitized alerts/audit events are created.
- SMTP credentials, message bodies, token fields, URLs, authorization, cookies and CSRF headers are excluded or redacted from application logs.
- Formal penetration testing is deferred until feature implementation is complete.

## Privacy and data portability

- Export identity comes only from the authenticated session. Export APIs accept no subject identifier and return no document storage keys or file bytes.
- Export schemas are versioned and explicitly project safe fields; model serialization is never used as an unrestricted export mechanism.
- Profile import reuses the existing strict profile schema, adds a version envelope, rejects dangerous object keys and requires preview, explicit confirmation, CSRF and rate limits.
- Import validation completes before a single owned-profile update. Protected account, authorization, workflow and security fields are not importable.
- Export/import responses use private no-store caching. Export, import and rejection events are audited without recording imported values.

## CRM resource authorisation

- Student profile/application endpoints derive the student identifier from the authenticated session; supplied roles, owners, stages and assignments are rejected by strict schemas.
- Counsellor access requires a current active assignment for the requested student, preventing cross-counsellor IDOR.
- Administrators use dedicated assignment and stage-correction endpoints with mandatory reasons. Normal profile or application updates cannot change protected fields.
- Application transitions use a server-side allow-list state machine and append immutable history rather than rewriting evidence.
- Automatic assignment selects the lowest active workload, then email and `_id` for deterministic ties. Partial unique indexes prevent duplicate active assignments/applications.
- Automatic follow-up tasks use a unique `enquiry-follow-up:<studentId>` key. Repeated requests cannot duplicate the task.
- Counselling notes are plain text; the frontend renders them as React text nodes rather than HTML.

## Dependency audit

The baseline audit contained 4 moderate, 3 high and 1 critical finding. Updating Vitest and its Vite toolchain removed the critical and all development-tool findings. The remaining Next report is an aggregate of bundled PostCSS `<=8.5.11` and optional Sharp `<0.35.0`: PostCSS processes developer-owned CSS only during the build, and EduFlow currently does not invoke Next image optimization on untrusted images, so neither affected path is runtime-reachable in the current application. npm offers only an incorrect downgrade to Next 9.3.3; no `--force` or breaking downgrade was used. These three findings remain tracked pending a compatible Next release.
