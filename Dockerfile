# Crumb API for Cloud Run. Build context: repository root.
#   gcloud run deploy crumb-api --source .   (Cloud Build builds this file)

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@crumb/api..." \
 && pnpm --filter @crumb/api build \
 && pnpm --filter @crumb/api deploy --prod --legacy /out

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
