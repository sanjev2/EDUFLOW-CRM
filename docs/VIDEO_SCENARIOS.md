# Genuine Security Video Scenarios

These scenarios come from real EduFlow defects. Reproduce historical vulnerable behavior only in a temporary local worktree with disposable data; never weaken the main working tree.

## DOC-01 — Valid screenshot rejected by binary substring scanning

- Before: `6617e56864d9a91fdb10880a3c2fca24d47030c7`
- Fixed by: `48ef741ad0fa3bdedb5f15fefc91e0da32975eb8`
- Category: insecure/incorrect file validation and availability

Demonstrate a generated Windows-style PNG that is structurally valid but was rejected because arbitrary compressed bytes matched an active-content substring. Then demonstrate the format-aware validator accepting the same legitimate fixture while rejecting PNG/HTML, PNG/SVG, appended-content and malformed files. Do not use a personal screenshot.

Evidence: redacted request/response, fixture-generation description, automated regression names, before/fix commits and cleanup.

## AUTH-01 — Administrator MFA completion routed through stale role state

- Before: `87f00c690698afbed68cd1db0ca6bae428a51f28`
- Fixed by: `6c50414e7316f6f5f93ab5381016b646e57846c4`
- Category: authentication state and protected-route usability

Using a disposable administrator in an isolated local database, demonstrate that the security page initially assumed STUDENT before the authoritative role loaded and that MFA completion returned to `/security` without confirming the updated session state. Then show the fixed flow fetching the authenticated user, confirming MFA completion and routing to the stored-role dashboard.

Record no password, TOTP secret, recovery code, cookie, CSRF value or bootstrap secret. Evidence should include the redacted navigation result, relevant tests, before/fix commits and account cleanup.

## AUTH-02 — Re-authentication left the earlier session active

- Before: `a739771fc5c3cc1b7f77fb885f17d72241694309`
- Fixed by: `b446730c083ed47efb2deae6af549f2781e9ee4f`
- Category: session lifecycle and CSRF recovery

With one disposable student in the isolated manual-test database, sign in and then authenticate again while the first session cookie is present. The earlier implementation created another session without rotating the authenticated session and the frontend could remain blocked by stale CSRF state. The corrected flow refreshes CSRF when necessary, rotates the existing session, and proves that the earlier cookie receives 401 while the new cookie succeeds.

Capture only redacted cookie labels or one-way evidence identifiers, never cookie or CSRF values. Run the earlier commit only in a separate temporary worktree using the isolated database, then remove that worktree and data.

## History review limitation

CRM and private-document ownership checks were introduced deny-by-default in `f2febd9` and `1095955`. Repository history does not contain a genuine earlier implemented IDOR bypass suitable for a before-and-after demonstration; the preceding commits simply lack those features. Do not describe feature absence as a vulnerability or manufacture an IDOR scenario. Current IDOR rejection remains suitable for present-version penetration-test evidence, but not historical “before” footage.
