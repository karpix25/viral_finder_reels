FROM node:20-slim

WORKDIR /app

# Install production deps (tsx is in dependencies)
COPY package*.json ./
RUN npm ci --omit=optional

# Copy source
COPY . .

ENV NODE_ENV=production

# Default entrypoint; override CMD in EasyPanel if you need another script
CMD ["npm", "run", "start"]
