# ต้นและเพชร Tennis Club — ranking leaderboard: single-container build for Cloud Run
# Stage 1: build the Vite frontend
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runtime — Node serves dist/ and the leaderboard API
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/
RUN cd server && npm install --omit=dev
COPY server/ server/
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "server/index.mjs"]
