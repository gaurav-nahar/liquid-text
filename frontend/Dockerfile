# 1. Base image (Node)
FROM node:24.11.0-slim
# 2. Working directory
WORKDIR /app
# 3. Dependencies install karenge
COPY package.json package-lock.json ./
RUN npm install
# 4. Source code copy karenge
COPY . .
# 5. React development server ke liye port
EXPOSE 3000
# 6. Start command
CMD ["npm", "start"]