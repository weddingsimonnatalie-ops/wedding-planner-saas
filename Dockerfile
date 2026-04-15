FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl

# NEXT_PUBLIC_* vars are inlined at build time, not runtime.
# Pass them as build args so they're available during next build.
ARG NEXT_PUBLIC_SEATING_APP_URL=""
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl

ARG NEXT_PUBLIC_SEATING_APP_URL=""
ENV NEXT_PUBLIC_SEATING_APP_URL=$NEXT_PUBLIC_SEATING_APP_URL

# Copy deps first for better caching
COPY --from=deps /app/node_modules ./node_modules

# Copy only package.json and prisma schema first — enables layer cache when only source changes
COPY package*.json ./
COPY prisma ./prisma
RUN npx prisma generate

# Now copy source and build
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# OpenSSL required by Prisma engine
RUN apk add --no-cache openssl

# Keep full node_modules for prisma CLI, tsx, and entrypoint scripts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
