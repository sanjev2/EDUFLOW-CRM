# EduFlow

EduFlow is a responsive, security-led web application foundation for one education consultancy. It will support student enquiries and applications for three roles: student, counsellor and administrator.

This stage includes secure authentication, role-aware CRM workflows and private local document handling for students, assigned counsellors and administrators.

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

Private files are stored beneath the backend-controlled `UPLOAD_ROOT` (default `uploads`) and are never exposed as static files. PDF, JPEG and PNG files up to 5 MB are checked by extension, declared type and file signature. Local storage does not include a malware-scanning engine; production requires hardened storage, backups and malware scanning.

## Email delivery

Development defaults to `EMAIL_DELIVERY_MODE=outbox`; verification and reset messages are written only to the ignored `.runtime/email-outbox.json` file and are labelled development-only. Real delivery requires `EMAIL_DELIVERY_MODE=smtp` plus validated SMTP and sender settings. Production refuses outbox mode.

Gmail SMTP is compatible through `smtp.gmail.com` using TLS and a Google App Password. Enable Google 2-Step Verification, create an App Password, and place it only in the ignored local `.env` as `SMTP_PASSWORD`. Never use or share the normal Gmail password. Production should use a dedicated transactional email provider rather than a personal Gmail mailbox.

## Commands

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

See `docs/` for scope, security decisions, threat modelling and coursework traceability.

## Initial administrator

See [`docs/AUTHENTICATION_DESIGN.md`](docs/AUTHENTICATION_DESIGN.md) for the controlled environment-variable bootstrap procedure. Never store bootstrap credentials in a file or commit them.
