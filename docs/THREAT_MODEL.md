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

## Planned controls

Zod validation, deny-by-default authorisation, secure server-side sessions, CSRF protection, rate limiting, audit events, output minimisation, private upload handling and security-focused tests. Authentication and authorisation controls are planned, not yet implemented.
