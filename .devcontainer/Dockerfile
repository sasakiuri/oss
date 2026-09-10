FROM mcr.microsoft.com/devcontainers/typescript-node:22
ARG NODE_VERSION=22.22.2
RUN su node -c "source /usr/local/share/nvm/nvm.sh && nvm install ${NODE_VERSION} && nvm alias default ${NODE_VERSION} && npm install -g npm@10.9.4"
ENV PATH=/usr/local/share/nvm/versions/node/v22.22.2/bin:${PATH}
