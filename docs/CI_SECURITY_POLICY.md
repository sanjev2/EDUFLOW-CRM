# CI Security Policy

GitHub Actions runs read-only quality and security workflows for pull requests and pushes to `main`. Workflow permissions are limited to repository-content reads. No job deploys, publishes images or receives SMTP credentials.

Official actions are pinned to full commit SHAs. npm uses the committed lockfile and caches only npm's package cache. Docker builds use isolated GitHub Actions caches and never push.

## Dependency findings

`npm audit --omit=dev --audit-level=critical` is non-mutating and fails the workflow for critical production findings. Findings are visible in job output; the workflow never runs `npm audit fix` or suppresses results.

The accepted Next.js transitive findings and their reachability assessment are recorded in `SECURITY_DECISIONS.md`. They remain visible technical debt, not an exemption for future critical issues. Any new finding requires review of affected version, reachability, upstream fix and regression risk.

## Repository checks

The local/CI repository-security script enumerates Git-tracked files, rejects `.env`, runtime mail, uploads, raw evidence and credential containers, and scans text for high-confidence credential patterns. It prints only rule and filename, never matched content.

Compose validation uses explicit non-secret CI placeholders. Image jobs build both Dockerfiles without publishing. Local Docker runtime validation remains required when Docker is available.
