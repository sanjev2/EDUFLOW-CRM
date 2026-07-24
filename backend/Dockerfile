# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

FROM dependencies AS build
COPY backend backend
RUN npm run build --workspace=@eduflow/backend

FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace=@eduflow/backend --include-workspace-root=false \
  && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    BACKEND_PORT=5001 \
    UPLOAD_ROOT=/app/uploads
WORKDIR /app
RUN addgroup -S eduflow && adduser -S -G eduflow -h /app eduflow \
  && mkdir -p /app/uploads \
  && chown -R eduflow:eduflow /app
COPY --from=production-dependencies --chown=eduflow:eduflow /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=eduflow:eduflow /app/backend/node_modules ./backend/node_modules
COPY --from=build --chown=eduflow:eduflow /app/backend/dist ./backend/dist
USER eduflow
EXPOSE 5001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:5001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/server.js"]
