# CI Security Policy

GitHub Actions runs read-only quality and security workflows for pull requests and pushes to `main`. Workflow permissions are limited to repository-content reads. No job deploys, publishes images or receives SMTP credentials.

Official actions are pinned to full commit SHAs. npm uses the committed lockfile and caches only npm's package cache. Docker builds use isolated GitHub Actions caches and never push.

## Dependency findings

`scripts/audit-production.mjs` runs the non-mutating `npm audit --omit=dev --audit-level=high --json` check and fails the workflow for high or critical production findings. Findings are visible in job output; the workflow never runs `npm audit fix`.

The exact time-bounded exception for the current upstream Next.js findings is recorded in `DEPENDENCY_RISK_ACCEPTANCE.md`. The gate validates advisory IDs, installed dependency nodes and its review deadline; it does not ignore unrelated findings or use `continue-on-error`. Any new or changed finding fails and requires review of affected version, reachability, upstream fix and regression risk.

## Repository checks

The local/CI repository-security script enumerates Git-tracked files, rejects `.env`, runtime mail, uploads, raw evidence and credential containers, and scans text for high-confidence credential patterns. It prints only rule and filename, never matched content.

Compose validation covers both the localhost container-development file and the HTTPS production overlay using explicit non-secret CI placeholders. Image jobs build both Dockerfiles without publishing. Local Docker runtime validation remains required when Docker is available.
