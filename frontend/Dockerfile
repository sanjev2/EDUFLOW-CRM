# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

FROM dependencies AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_TELEMETRY_DISABLED=1
COPY frontend frontend
RUN npm run build --workspace=@eduflow/frontend

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S eduflow && adduser -S -G eduflow -h /app eduflow \
  && chown -R eduflow:eduflow /app
COPY --from=build --chown=eduflow:eduflow /app/frontend/.next/standalone ./
COPY --from=build --chown=eduflow:eduflow /app/frontend/.next/static ./frontend/.next/static
USER eduflow
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3100/login').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "frontend/server.js"]
