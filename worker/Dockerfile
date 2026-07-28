# Railway worker image for the Zordon operations-team worker.
# Build context is the repo root (see railway.toml → dockerfilePath).
FROM node:20-slim

WORKDIR /app

# Install deps from package.json (npm install, not ci, so a lockfile drift for
# the added `tsx` dep never blocks the build).
COPY package.json ./
RUN npm install --no-audit --no-fund

# The worker imports shared code from lib/ and runs the TypeScript directly via tsx.
COPY . .

CMD ["npx", "tsx", "worker/index.ts"]
