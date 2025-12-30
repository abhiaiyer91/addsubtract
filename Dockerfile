FROM node:20-alpine

WORKDIR /app

# Install git for any git operations and docker CLI for sandbox
RUN apk add --no-cache git docker-cli

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
