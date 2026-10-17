# ClaimSure Single-Container Production Dockerfile for Google Cloud Run
FROM node:22-slim

# Set working directory
WORKDIR /app

# Install build essentials for native modules if needed
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./

# Install dependencies
RUN npm ci --include=dev

# Copy application code and seed datasets
COPY . .

# Build Vite React SPA into dist/
RUN npm run build

# Configure Cloud Run environment
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Start Express full-stack server
CMD ["npm", "start"]
