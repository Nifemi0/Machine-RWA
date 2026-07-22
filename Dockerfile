# Use Node.js LTS (20.x or 22.x) as the base image
FROM node:22-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm install --production

# Copy application source
COPY . .

# Expose the API port
EXPOSE 8090

# Define environment variables with defaults
ENV MACHINE_PORT=8090
ENV CASPER_RPC_URL=https://rpc.testnet.casper.network

# Use PM2-runtime or standard node execution
# For containers, direct node execution is usually preferred over background PM2,
# but since our app has two processes (server.js and agent.js), we can use pm2-runtime
# or a simple shell script to run both.
RUN npm install -g pm2
CMD ["pm2-runtime", "ecosystem.config.js"]
