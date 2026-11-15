FROM mcr.microsoft.com/devcontainers/typescript-node:24@sha256:e1fd824e03c68d8f406ef45b574023a2d683a5acc98906743f8d60aaf78b0174
ARG NODE_VERSION=24.16.0
RUN su node -c "source /usr/local/share/nvm/nvm.sh && nvm install ${NODE_VERSION} && nvm alias default ${NODE_VERSION}"
ENV PATH=/usr/local/share/nvm/versions/node/v24.16.0/bin:${PATH}
COPY packages/repo-tooling/npm-runtime/package*.json /opt/npm-runtime/
# Login shells put nvm's Node.js first on PATH, so point its npm and npx at the
# locked runtime instead of the bundled release.
RUN npm ci --prefix /opt/npm-runtime --ignore-scripts --no-audit --no-fund \
    && node_bin="/usr/local/share/nvm/versions/node/v${NODE_VERSION}/bin" \
    && ln -sf /opt/npm-runtime/node_modules/npm/bin/npm-cli.js "${node_bin}/npm" \
    && ln -sf /opt/npm-runtime/node_modules/npm/bin/npx-cli.js "${node_bin}/npx" \
    && test "$("${node_bin}/npm" --version)" = "$(node -p "require('/opt/npm-runtime/package.json').dependencies.npm")"
