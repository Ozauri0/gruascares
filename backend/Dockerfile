FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY drizzle ./drizzle
COPY src ./src
# Imágenes subidas desde /admin/contenido: este volumen debe persistir entre despliegues.
ENV NODE_ENV=production PORT=4000 UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R bun:bun /data /app
VOLUME /data/uploads
USER bun
EXPOSE 4000
CMD ["sh", "-c", "bun src/db/migrate.ts && bun src/index.ts"]
