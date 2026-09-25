FROM node:20-slim AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM deps AS dev
COPY . .

EXPOSE 3003

CMD ["npm", "run", "dev"]

FROM deps AS build
ARG VITE_API_URL=/api
ARG VITE_ALLOWED_HOSTS=localhost,127.0.0.1
ARG VITE_PROXY_TARGET=http://backend:8000
ENV VITE_API_URL=$VITE_API_URL \
    VITE_ALLOWED_HOSTS=$VITE_ALLOWED_HOSTS \
    VITE_PROXY_TARGET=$VITE_PROXY_TARGET

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS prod

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
