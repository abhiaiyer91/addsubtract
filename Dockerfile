FROM node:20-slim

WORKDIR /app

# Install git for any git operations, docker CLI for sandbox, and curl for CodeRabbit CLI
# Using debian-slim instead of alpine because CodeRabbit CLI requires glibc
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install CodeRabbit CLI for AI code reviews
# Note: The CLI binary requires glibc (which debian-slim provides natively)
RUN curl -fsSL https://cli.coderabbit.ai/install.sh | bash && \
    ls -la /root/.local/bin/ && \
    ln -sf /root/.local/bin/coderabbit /usr/local/bin/coderabbit && \
    ln -sf /root/.local/bin/coderabbit /usr/local/bin/cr && \
    ls -la /usr/local/bin/coderabbit && \
    /usr/local/bin/coderabbit --version

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source (for production, we'd copy built files)
COPY . .

# Build TypeScript
RUN npm run build

# Create repos directory (will be overwritten by volume mount)
RUN mkdir -p /data/repos

# Expose server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start server - uses /data/repos which should be a persistent volume
CMD ["node", "dist/cli.js", "serve", "--repos", "/data/repos"]
