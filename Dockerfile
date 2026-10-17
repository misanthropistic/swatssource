FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./

EXPOSE 5000

CMD ["node", "server.js"]
