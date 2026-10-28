# Imagen genérica de la API (sirve para Render, Railway, Fly.io o cualquier host de contenedores).
FROM node:22-alpine AS build
WORKDIR /app
ENV SCARF_ANALYTICS=false
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
