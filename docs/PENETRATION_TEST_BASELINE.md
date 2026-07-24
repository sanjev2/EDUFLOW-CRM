# Penetration-Test Baseline

## Authorised target

- Baseline commit: `03a6a697462944660b77c46b2446d6bafdc745a8`
- Frontend: `http://localhost:3100`
- Backend: `http://localhost:5001`
- Scope: the student, counsellor and administrator interfaces; authentication, session, privacy, CRM and private-document APIs; the local MongoDB-backed development deployment.
- Test identities: dedicated, disposable accounts labelled STUDENT, COUNSELLOR and ADMIN. Passwords, MFA seeds, recovery codes and session material must never enter committed evidence.

Testing is authorised only against a user-owned local EduFlow instance and generated test data. Third-party services, Gmail, Google accounts, infrastructure not owned by the tester, denial-of-service testing, destructive payloads and real personal documents are out of scope.

## Method

Manual testing is primary. Automated scanners and fuzzers may supplement it only with bounded rates, local targets and reviewed payloads. The tester must record the exact baseline, role, preconditions, request class, expected result, observed result and cleanup.

Coverage is mapped to:

- OWASP Web Security Testing Guide
- OWASP ASVS authentication, session, access-control, validation, file-handling and logging controls
- OWASP API Security Top 10, especially object-level and function-level authorisation

Required coverage includes authentication and enumeration, MFA and recovery, session rotation/revocation, CSRF and Origin enforcement, role and object ownership, mass assignment, injection and prototype pollution, rate limits, file type/polyglot/traversal controls, privacy export/import isolation, safe errors, security headers, audit events and suspended-account denial.

## Evidence and safety

Use the ignored `.evidence/` workspace described in `EVIDENCE_GUIDE.md`. Redact cookies, authorization and CSRF headers, tokens, email-link query strings, MFA material, password data, local file paths and personal information before creating any submission artifact. Never commit raw proxy history, database dumps or tool output.

Every finding must use `FINDING_TEMPLATE.md`, include reproducible safe steps and distinguish observation from inference. Retest against the same baseline or record the later commit exactly. Remove disposable accounts, generated uploads and temporary evidence after the assessment.

This document is a test plan, not evidence that a penetration test has already been performed.
