# Container Environment

The Compose environment is production-oriented and separate from the normal `npm run dev` workflow.

## Runtime configuration

Docker Compose reads the ignored root `.env` only at runtime. Add URL-safe values for `MONGODB_ROOT_USERNAME` and `MONGODB_ROOT_PASSWORD`, plus the existing production session, encryption, password-pepper and SMTP settings. `EMAIL_DELIVERY_MODE` is forced to `smtp`; production outbox delivery is prohibited. Never place real values in Dockerfiles, Compose, documentation or Git.

The browser-facing API URL is intentionally public configuration and is built as `http://localhost:5001/api/v1`.

## Commands

```powershell
docker compose build
docker compose up -d
docker compose ps
Invoke-RestMethod http://localhost:5001/api/health
Invoke-RestMethod http://localhost:5001/api/v1/health/database
Invoke-WebRequest http://localhost:3100/login -UseBasicParsing
docker compose logs --no-log-prefix backend
docker compose down
```

`docker compose down` stops and removes disposable containers and networks but preserves named MongoDB and private-upload volumes. Never add `--volumes` when real user data must be retained.

For an explicitly disposable test project, use a unique project name and delete only its verified volumes:

```powershell
docker compose -p eduflow-test up -d --build
docker compose -p eduflow-test down
# After confirming the exact eduflow-test volume names:
docker volume ls --filter label=com.docker.compose.project=eduflow-test
```

Volume deletion is intentionally a separate manual decision.

## Architecture and controls

- MongoDB is available only on the internal `data` network and requires authentication.
- The backend joins `web` and `data`; MongoDB does not join the browser-facing network.
- Private uploads use a named volume mounted only into the backend. No static route exposes it.
- Frontend and backend bind only to localhost ports 3100 and 5001.
- Application images are multi-stage, run as non-root, carry production runtime dependencies only, and include health checks.
- Application containers use read-only roots, limited temporary filesystems, dropped capabilities and `no-new-privileges`.
- MongoDB and uploads use persistent named volumes. Resource and graceful-stop limits are declared.
- `.dockerignore` excludes secrets, runtime mail, uploads, evidence, screenshots, build output and Git metadata from both image contexts.
