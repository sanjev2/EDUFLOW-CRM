# Security Evidence Guide

Raw assessment material belongs only in the ignored `.evidence/` directory:

- `test-plan/`
- `raw-tool-output/`
- `screenshots/`
- `http/`
- `findings/`
- `retest/`
- `video/`

Name files with a finding ID, UTC date and short description, for example `AUTH-01_2026-07-24_login-rate-limit.md`. Keep an untouched local original, then make a redacted derivative for submission.

Before sharing or submitting evidence, remove passwords, hashes, cookies, bearer and CSRF values, MFA secrets, recovery codes, verification/reset tokens, complete token URLs, personal documents, private notes, database connection strings and unnecessary email addresses. Prefer generated fixtures and disposable accounts.

For video evidence, show the tested commit and local URL, explain the role and preconditions, reproduce the defect with safe generated data, show the secure result after the fix, and show cleanup. Pause recording before entering any password, MFA code or secret.
