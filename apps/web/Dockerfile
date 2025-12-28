FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files for monorepo workspaces
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build web app
RUN npm run build -w @wit/web

# Production stage
FROM node:20-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/apps/web/dist ./dist

EXPOSE 3000

CMD ["sh", "-c", "serve dist -s -l ${PORT:-3000}"]
