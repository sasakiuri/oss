FROM mcr.microsoft.com/devcontainers/typescript-node:24
ARG NODE_VERSION=24.16.0
RUN su node -c "source /usr/local/share/nvm/nvm.sh && nvm install ${NODE_VERSION} && nvm alias default ${NODE_VERSION} && npm install -g npm@11.13.0"
ENV PATH=/usr/local/share/nvm/versions/node/v24.16.0/bin:${PATH}
