# Privacy and Data Portability

EduFlow provides authenticated, rate-limited self-service data portability. The backend remains the privacy boundary; frontend controls do not decide ownership.

## Export

`GET /api/v1/privacy/export` derives the subject from the active session and returns versioned JSON with `Cache-Control: no-store, private`, attachment disposition and `nosniff`.

The export contains safe account fields, the student's own profile and applications, owned application history, role-appropriate task fields, owned document metadata and relevant audit-event names/timestamps. It deliberately excludes password and password-history data, sessions, CSRF values, token hashes, MFA secrets, recovery codes, encryption material, login-attempt internals, storage identifiers, integrity hashes and document bytes. Staff exports do not contain student profiles.

## Import

Only students may import, and only fields already accepted by the existing student-profile editor are allowed. The versioned schema is strict; unknown keys and the keys `__proto__`, `prototype` and `constructor` are rejected recursively. Email, role, ownership, account status, verification, password, MFA, sessions, assignments, application decisions, audit records and documents are not schema members.

Preview and confirmation are separate authenticated POST requests. Both require JSON, the session-bound CSRF header, current verified credentials and rate limits. The entire body is limited to 100 KB. Validation finishes before one atomic owned-profile upsert, so validation failure cannot partially update the profile. Success and rejection create sanitized audit events.

The browser reads the selected file in memory only. It does not place import content or exports in `localStorage` or `sessionStorage`. Export downloads use a short-lived browser blob URL rather than a public server URL.

## Residual considerations

- Exports contain personal information and should be stored and shared carefully by the account holder.
- Export retention and deletion are controlled by the user's device after download.
- The in-memory rate limiter is suitable for the single-process coursework environment; distributed deployment requires a shared limiter.
- Document file bytes require their existing authenticated download flow and are intentionally outside the JSON export.
