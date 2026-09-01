# Multi-stage: Vite build, then nginx for the SPA (React Router fallback).
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Baked at build time. Staging nginx serves the app at /app/ against API /client.
ARG VITE_API_URL=http://localhost/client
ARG VITE_BASE=/
ARG VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51S0pDCFVJJgf9kPbBk7noZevUQSzkRN7CyYGi7QeKzKGToFekvr6jPVQQS1lsQoZyvd1J3EiQTfZJJHMxwIpX4mL005xBo7ME9
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE=$VITE_BASE
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY

RUN npm run build

FROM nginx:1.27-alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
