# Stage 1: Build dependencies
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install

# Stage 2: Production runner
FROM node:20-slim
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/data/marketplace.db

COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY database.js server.js ./

RUN mkdir -p /data && chown -R node:node /data
VOLUME /data

EXPOSE 4000

USER node

CMD ["npm", "start"]
