FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM base AS prod-deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base
# Roboto is used to render the social card images
RUN apt-get update \
	&& apt-get install -y --no-install-recommends fonts-roboto fontconfig \
	&& rm -rf /var/lib/apt/lists/* \
	&& mkdir -p static/avatars
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json initdb.ts ./
COPY src/schema.sql ./src/schema.sql

ENV PORT=7777
EXPOSE 7777
# the schema uses IF NOT EXISTS so it is safe to apply on every start
CMD ["sh", "-c", "bun initdb.ts && exec bun build/index.js"]
