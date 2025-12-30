# Procfile for Railway/Heroku-style deployments
# Defines the process types for the application

# Main API server (Git HTTP, tRPC API, SSH)
web: node dist/cli.js serve --port $PORT

# Background worker for async tasks (optional)
# worker: node dist/worker.js

# Release command - runs migrations before deploy
release: npm run db:migrate
