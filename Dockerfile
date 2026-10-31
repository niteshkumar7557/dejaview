# The DejaView API and the worker in one image.
#
#   docker build -t dejaview .
#   docker run --rm -p 3001:3001 -e DATABASE_URL=... dejaview
#   docker run --rm -e DATABASE_URL=... dejaview npm run start -w @dejaview/worker
#
# One image, three commands: the API, the worker and the dashboard all come out of it, so a
# deployment only has to ship this one thing. The database is not in the image: Postgres runs as
# its own service (fly postgres, Neon, or the local docker-compose.yml).
#
# The image holds the source, not just the build output, because the worker and the API are run
# with tsx straight from TypeScript. That keeps the image small and the start-up instant, and it
# means the thing that runs in production is the same code the tests ran against.

FROM node:22-alpine

WORKDIR /app

# python3 and the build tools are what node-gyp needs for the few native dependencies.
RUN apk add --no-cache python3 make g++

# The manifests first, so a change to the source does not reinstall the dependencies.
# Every workspace needs its package.json here: npm cannot resolve a workspace whose
# manifest is missing, and the install would silently leave out its dependencies.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY db/package.json ./db/
COPY packages/ingest/package.json ./packages/ingest/
COPY packages/linker/package.json ./packages/linker/
COPY packages/pipeline/package.json ./packages/pipeline/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

COPY . .

# The same checks CI runs, so an image that builds is an image whose code typechecks.
RUN npm run typecheck

# The dashboard is Next.js, and Next inlines the NEXT_PUBLIC_* variables into the client bundle
# at build time. So the API URL has to be known here, not at run time. Build it with:
#   docker build --build-arg BUILD_WEB=1 --build-arg NEXT_PUBLIC_API_URL=https://... .
ARG BUILD_WEB=0
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
# Without this the dashboard shows its own sample data instead of the API's.
ARG NEXT_PUBLIC_USE_MOCKS=0
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_USE_MOCKS=$NEXT_PUBLIC_USE_MOCKS
RUN if [ "$BUILD_WEB" = "1" ]; then npm run build -w @dejaview/web; fi

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# The API by default. The worker is the same image with a different command.
CMD ["npm", "run", "start", "-w", "@dejaview/api"]
