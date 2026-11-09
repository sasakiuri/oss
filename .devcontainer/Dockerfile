FROM mcr.microsoft.com/devcontainers/typescript-node:24@sha256:85bf802bec074be0be2fc4229ca4d3882c6f9c9bfda1de7995d025257778514c
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
