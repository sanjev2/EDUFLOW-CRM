# Temporary Dependency Risk Acceptance

Recorded: 2026-07-27

Review deadline: 2026-08-31

Scope: production dependency audit for Next.js 16.2.12 only

The production audit is **not clean**. This time-bounded acceptance covers only the advisory identifiers and exact installed dependency nodes below. `scripts/audit-production.mjs` fails for any other high or critical advisory, a changed dependency path, or an expired review date.

| Advisory            | Affected node  | Current path              | Reason direct remediation is unavailable                           |
| ------------------- | -------------- | ------------------------- | ------------------------------------------------------------------ |
| GHSA-qx2v-qp2m-jg93 | PostCSS 8.4.31 | `next` → `postcss`        | Current stable Next.js still bundles the affected PostCSS version. |
| GHSA-6g55-p6wh-862q | PostCSS 8.4.31 | `next` → `postcss`        | Current stable Next.js still bundles the affected PostCSS version. |
| GHSA-r28c-9q8g-f849 | PostCSS 8.4.31 | `next` → `postcss`        | Current stable Next.js still bundles the affected PostCSS version. |
| GHSA-f88m-g3jw-g9cj | Sharp 0.34.5   | `next` → optional `sharp` | Current stable Next.js still declares Sharp below 0.35.0.          |

At the recorded date, Next.js 16.2.12 and `eslint-config-next` 16.2.12 are the latest stable releases. npm proposes a forced downgrade to Next.js 9.3.3, which is incompatible and is not accepted.

## Compensating controls

- PostCSS receives repository-controlled styles during the trusted build; EduFlow does not accept user-supplied CSS or source maps.
- The only `next/image` use renders the server-generated MFA QR data URL with `unoptimized`, so private uploaded documents are not processed through Next image optimization or Sharp.
- Uploaded files remain behind the backend's format-aware validation, private storage and authenticated download boundary.
- CI evaluates the machine-readable production audit at high severity. It allows only the four identifiers and exact dependency nodes above; unrelated future findings still fail.
- No `npm audit fix --force`, dependency downgrade or blanket `continue-on-error` is used.

## Removal condition

Remove this acceptance and the matching entries in `scripts/audit-production.mjs` as soon as a supported stable Next.js release installs fixed PostCSS and Sharp versions and passes EduFlow's complete verification suite. Review immediately if the dependency path, application reachability or advisory details change, and no later than 2026-08-31.
