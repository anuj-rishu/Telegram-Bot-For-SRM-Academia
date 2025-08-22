FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Expose the port your app runs on
EXPOSE 9000

# Run the application
CMD ["node", "server.js"]