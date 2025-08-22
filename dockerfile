FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

# Install PM2 globally
RUN npm install -g pm2

COPY . .

EXPOSE 9000

# Run app with PM2 in cluster mode
CMD ["pm2-runtime", "start", "server.js", "-i", "max"]
