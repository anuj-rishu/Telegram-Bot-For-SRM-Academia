FROM node:20-alpine


WORKDIR /app


RUN npm install -g npm@11.5.2 pm2


COPY package*.json ./


RUN npm install --omit=dev


COPY . .


RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001 -G nodejs && \
    chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 9000


HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:9000/health || exit 1


CMD ["pm2-runtime", "server.js", "--name", "server"]
