# Coursework Requirements Traceability

| Coursework requirement | Planned EduFlow implementation | Current status | Planned evidence | Planned test |
|---|---|---|---|---|
| Responsive web application | Next.js App Router and Tailwind layouts | Foundation complete | Screenshots and source | Responsive UI tests/manual checks |
| Three user roles | STUDENT, COUNSELLOR and ADMIN with controlled provisioning | Authentication foundation complete | Models, bootstrap and role routes | Negative role tests |
| Secure authentication | Argon2id, verification, reset, MFA and revocable sessions | Authentication foundation complete | `AUTHENTICATION_DESIGN.md` and source | Authentication integration suite |
| Deny-by-default access | API authentication, verification, MFA, freshness and role middleware | Foundation complete | Middleware and access routes | Negative access tests |
| Student enquiry/application workflow | Validated REST resources | Not implemented | API and UI evidence | Integration tests |
| Local persistent database | Mongoose with MongoDB Community Server | Foundation complete | Health endpoint and schema evidence | Database integration tests |
| Secure private documents | Non-public storage and authorised delivery | Planned | Storage design and implementation | Upload/access tests |
| Input validation | Strict Zod authentication/admin schemas | Authentication scope complete | Route schemas and safe errors | Unexpected-field and policy tests |
| Testing | Vitest, Supertest and Testing Library | Authentication integration coverage present | Test command output | Automated suite |
| Security evaluation | Formal penetration test after features | Deferred | Final report | Documented test cases |
