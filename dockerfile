FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install -g npm@11.5.2 && \
    npm install --omit=dev

RUN npm install -g pm2

COPY . .

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001 -G nodejs
RUN chown -R nodeuser:nodejs /app
USER nodeuser

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:9000/health || exit 1

CMD ["pm2-runtime", "start", "server.js", "-i", "1"]