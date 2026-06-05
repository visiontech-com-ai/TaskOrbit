# Stage 1: Build dependencies
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install

# Stage 2: Production runner
FROM node:20-slim
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/licenses.db

# Copy built node_modules and code
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY database.js server.js ./
COPY admin/ ./admin/

# Create persistent storage folder for SQLite db and set permissions for node user
RUN mkdir -p /data && chown -R node:node /data
VOLUME /data

# Expose API port
EXPOSE 3000

# Run container as non-root user for security
USER node

CMD ["npm", "start"]
