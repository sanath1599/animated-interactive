# Isolated environment where Claude Code analyses an untrusted repository copy.
# Build from the repo root: docker build -t demo-studio-runner:latest -f docker/runner/Dockerfile docker/runner
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV HOME=/home/runner CHROME_PATH=/usr/bin/chromium
RUN mkdir -p /home/runner /work && chmod 777 /home/runner /work
WORKDIR /opt/runner
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY . ./
ENTRYPOINT ["node", "/opt/runner/runner-entry.mjs"]
