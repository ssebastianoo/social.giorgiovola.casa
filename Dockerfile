FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
# the public origin is compiled in for the CSRF check (SvelteKit 3 removed the runtime ORIGIN)
ARG PUBLIC_URL
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
# adapter-node defaults to 512K, too small for avatar uploads (client allows 10MB)
ENV BODY_SIZE_LIMIT=12582912
EXPOSE 7777
# the schema uses IF NOT EXISTS so it is safe to apply on every start.
# Starts as root only to fix ownership of the avatars volume (older volumes were written
# as root), then drops to the unprivileged bun user for everything else.
CMD ["sh", "-c", "chown -R bun:bun static/avatars && exec setpriv --reuid=bun --regid=bun --init-groups sh -c 'bun initdb.ts && exec bun build/index.js'"]
