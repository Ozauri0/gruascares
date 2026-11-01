# Frontend (Next.js) en contenedor. Se construye desde la raíz: `docker compose --profile app up --build`.
# El navegador solo habla con este contenedor; /api/* se reenvía al servicio `backend` por la red interna.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next.config.ts lee BACKEND_URL al compilar (las reescrituras de /api/* quedan fijas en el build).
ARG BACKEND_URL=http://backend:4000
ENV BACKEND_URL=$BACKEND_URL NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ARG BACKEND_URL=http://backend:4000
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 BACKEND_URL=$BACKEND_URL NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
# Sin EXPOSE ni puertos publicados: se accede por la red interna del compose.
CMD ["node", "server.js"]
