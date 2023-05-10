FROM node:18-alpine AS builder
WORKDIR /app

COPY package.json yarn.lock .
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

FROM node:18-alpine

WORKDIR /app

RUN apk add curl

COPY package.json yarn.lock .
RUN yarn install --production --frozen-lockfile

COPY --from=builder /app/bin /app/bin
COPY --from=builder /app/lib /app/lib
RUN chmod +x /app/bin/*.js

ENTRYPOINT ["yarn"]