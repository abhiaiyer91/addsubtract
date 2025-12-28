FROM node:20-alpine

WORKDIR /app

# Install git for any git operations
RUN apk add --no-cache git

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source (for production, we'd copy built files)
COPY . .

# Build TypeScript
RUN npm run build

# Create repos directory
RUN mkdir -p /repos

# Expose server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start server
CMD ["node", "dist/cli.js", "serve", "--port", "3000", "--repos", "/repos"]
