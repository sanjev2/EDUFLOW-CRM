# Coursework Requirements Traceability

| Coursework requirement | Planned EduFlow implementation | Current status | Planned evidence | Planned test |
|---|---|---|---|---|
| Responsive web application | Next.js App Router and Tailwind layouts | Foundation complete | Screenshots and source | Responsive UI tests/manual checks |
| Three user roles | STUDENT, COUNSELLOR and ADMIN with controlled provisioning | Authentication foundation complete | Models, bootstrap and role routes | Negative role tests |
| Secure authentication | Argon2id, verification, reset, MFA and revocable sessions | Authentication foundation complete | `AUTHENTICATION_DESIGN.md` and source | Authentication integration suite |
| Deny-by-default access | API authentication, verification, MFA, freshness and role middleware | Foundation complete | Middleware and access routes | Negative access tests |
| Student enquiry/application workflow | Validated REST resources and stage history | Complete for CRM stage | API and role pages | CRM integration tests |
| Local persistent database | Mongoose with MongoDB Community Server | Foundation complete | Health endpoint and schema evidence | Database integration tests |
| Secure private documents | Non-public storage and authorised delivery | Planned | Storage design and implementation | Upload/access tests |
| Input validation | Strict Zod authentication/admin schemas | Authentication scope complete | Route schemas and safe errors | Unexpected-field and policy tests |
| Testing | Vitest, Supertest and Testing Library | Authentication integration coverage present | Test command output | Automated suite |
| Security evaluation | Formal penetration test after features | Deferred | Final report | Documented test cases |
| Student CRM profile | Strict profile model and self/assignment ownership | Complete for CRM stage | Profile page and API | CRM ownership tests |
| Application workflow | Server state machine and immutable stage history | Complete for CRM stage | Application timeline/API | Transition and cancellation tests |
| Counsellor operations | Assignments, notes and follow-up tasks | Complete for CRM stage | Counsellor pages/API | IDOR and automation tests |
| Administrator oversight | Safe summaries, assignment, audit and alert views | Complete for CRM stage | Administrator pages/API | Role and reason tests |
| Private document workflow | Student upload/management, assigned-counsellor access and audited administrator oversight | Implemented | `/documents`, assigned student documents, `/admin/documents`, authenticated document API | Signature, IDOR, CSRF, traversal, delivery and deletion tests |
| Secure email delivery | Verification, resend and password recovery through development outbox or standard SMTP | Implemented | Email service, authentication endpoints, `/resend-verification` | Message, enumeration, rate-limit, configuration and failure-sanitization tests |
| Privacy-aligned data portability | Owned, versioned JSON export and strict student-profile import | Implemented | `/privacy`, privacy API and `PRIVACY_DESIGN.md` | Ownership, exclusion, CSRF, mass-assignment, pollution and size tests |

Document security testing covers policy validation and access controls in the automated suite. Wider penetration and deployment security testing remains a separate final coursework stage.
