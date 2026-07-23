# EduFlow

EduFlow is a responsive, security-led web application foundation for one education consultancy. It will support student enquiries and applications for three roles: student, counsellor and administrator.

This stage includes secure authentication, TOTP MFA, revocable server-side sessions, CSRF protection and deny-by-default role controls. CRM business workflows remain intentionally excluded.

## Requirements

- Node.js 20+
- npm
- MongoDB Community Server at `mongodb://127.0.0.1:27017/eduflow_crm`

## Setup

1. Run `npm run env:setup` to create `.env` with generated local secrets. Existing files are preserved.
2. Run `npm install`.
3. Start MongoDB.
4. Run `npm run dev`.

Frontend: `http://localhost:3100`
API: `http://localhost:5001/api/health`

## Commands

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

See `docs/` for scope, security decisions, threat modelling and coursework traceability.

## Initial administrator

See [`docs/AUTHENTICATION_DESIGN.md`](docs/AUTHENTICATION_DESIGN.md) for the controlled environment-variable bootstrap procedure. Never store bootstrap credentials in a file or commit them.
