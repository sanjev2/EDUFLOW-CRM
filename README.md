# EduFlow

EduFlow is a responsive, security-led web application foundation for one education consultancy. It will support student enquiries and applications for three roles: student, counsellor and administrator.

This foundation intentionally excludes authentication, MFA and CRM business workflows.

## Requirements

- Node.js 20+
- npm
- MongoDB Community Server at `mongodb://127.0.0.1:27017/eduflow_crm`

## Setup

1. Copy `.env.example` to `.env` and replace all placeholder secrets locally.
2. Run `npm install`.
3. Start MongoDB.
4. Run `npm run dev`.

Frontend: `http://localhost:3000`  
API: `http://localhost:4000/api/health`

## Commands

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

See `docs/` for scope, security decisions, threat modelling and coursework traceability.
