FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production


RUN npm install -g pm2

COPY . .

EXPOSE 9000


CMD ["pm2-runtime", "start", "server.js", "-i", "max"]