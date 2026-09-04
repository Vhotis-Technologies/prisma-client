FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG VITE_API_URL=https://staging.client.prismavalet.com
ARG VITE_BASE=/
ARG VITE_STRIPE_PUBLISHABLE_KEY=...
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE=$VITE_BASE
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY

RUN npm run build
RUN npm install -g serve

EXPOSE 80
CMD ["serve", "-s", "dist", "-l", "80"]