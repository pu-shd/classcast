# Test image: runs lint, type checks and unit tests for the UmbraCast page.
FROM node:24.11.1-alpine3.22@sha256:2867d550cf9d8bb50059a0fff528741f11a84d985c732e60e19e8e75c7239c43

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY eslint.config.js tsconfig.json classcast.js index.html ./
COPY test ./test

USER node
CMD ["npm", "run", "check"]
