FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy application files
COPY . .

# Create data and logs directories
RUN mkdir -p data logs

# Expose API port
EXPOSE 3001

# Start both API server and agent with a simple process manager
CMD ["sh", "-c", "pnpm server & while true; do pnpm agent; sleep 360; done"]
