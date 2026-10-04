FROM node:20-alpine
 
# Install ffmpeg and media build tools
RUN apk add --no-cache ffmpeg vips-dev python3 make g++

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Environment port fallback
EXPOSE 3000

# Command to run application
CMD ["npm", "start"]
