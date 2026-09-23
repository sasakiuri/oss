FROM node:26.8.2-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 HUSKY=0
RUN npm install --global npm@11.13.0
COPY package.json package-lock.json .npmrc ./
# Workspace directories must retain their names for npm's lockfile resolution.
COPY packages/ ./packages/
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .

FROM dependencies AS development
RUN chown -R node:node /app/packages/saika-docs
USER node
EXPOSE 5175
CMD ["npm", "run", "dev", "--workspace=@sasakiuri/saika-docs"]

FROM dependencies AS build
ARG NEXT_PUBLIC_SITE_URL=http://localhost:5175
ARG API_BASE_URL=
ARG NEXT_PUBLIC_BASE_PATH=
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0
ARG NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE=0
ARG NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE=0
ARG NEXT_PUBLIC_APP_ENV=production
ARG SENTRY_ORG=
ARG SENTRY_PROJECT=
ARG NEXT_PUBLIC_RELEASE=
ARG NEXT_PUBLIC_WEB_VITALS=0
ARG NEXT_PUBLIC_GTM_ID=
ARG NEXT_PUBLIC_CLARITY_ID=
ARG NEXT_PUBLIC_DEV_AXE=0
ARG DOCS_IMAGE_HOSTS=
ARG DOCS_SOFT_BREAKS=0
ENV DOCS_OUTPUT=standalone
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN npm run build --workspace=@sasakiuri/saika-docs

FROM node:26.8.2-bookworm-slim AS production
WORKDIR /app
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=5175
COPY --from=build --chown=node:node /app/packages/saika-docs/.next/standalone ./
COPY --from=build --chown=node:node /app/packages/saika-docs/.next/static ./packages/saika-docs/.next/static
COPY --from=build --chown=node:node /app/packages/saika-docs/public ./packages/saika-docs/public
USER node
EXPOSE 5175
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s CMD node -e "fetch('http://127.0.0.1:5175'+process.env.NEXT_PUBLIC_BASE_PATH+'/api/health/',{headers:process.env.DOCS_PREVIEW_AUTH==='1'?{Authorization:'Basic '+Buffer.from(process.env.PREVIEW_AUTH_USER+':'+process.env.PREVIEW_AUTH_PASSWORD).toString('base64')}:{}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/saika-docs/server.js"]
