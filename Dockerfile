FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
RUN mkdir -p /app/data && chown node:node /app/data
ENV SUBSCRIPTIONS_FILE=/app/data/subscriptions.json
COPY config/config.example.yaml ./config/config.example.yaml
USER node
EXPOSE 5514/udp 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", "src/index.js"]
