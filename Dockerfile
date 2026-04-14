# Use Node.js 18 LTS with Ubuntu base for easier system dependency installation
FROM node:18-bullseye-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libjemalloc2 \
    && rm -rf /var/lib/apt/lists/*

# Install yarn version 4.9.2
RUN corepack enable && corepack prepare yarn@4.9.2 --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN yarn install

# Copy source code
COPY . .

# Build TypeScript
RUN yarn build

# Create sessions directory
RUN mkdir -p sessions

# Set environment variable for jemalloc
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# Expose port if needed (adjust based on your needs)
# EXPOSE 3000

# Run the application
CMD ["yarn", "start"]
