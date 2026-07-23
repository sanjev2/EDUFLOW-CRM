# Security Decisions

- The Express backend is the security boundary. Clients will never be trusted to enforce access.
- Authorisation will be deny-by-default and explicitly permit role-and-resource actions.
- A secure server-side session strategy is planned for the next stage, using hardened, HTTP-only, secure and appropriate SameSite cookies with rotation and revocation.
- Uploaded files will be private, stored outside public web roots, renamed with generated identifiers, validated by type and size, and served only after authorisation.
- Logs use structured events and redact cookies, authorisation headers, passwords, tokens and secrets. Sensitive application content must not be logged.
- CORS is restricted to the configured frontend origin and request bodies are size-limited.
- Formal penetration testing is deferred until feature implementation is complete.
