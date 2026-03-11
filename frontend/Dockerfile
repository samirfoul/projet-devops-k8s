# Étape 1 : Construction (Build) avec Node
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx @angular/cli@18 build --configuration production

# Étape 2 : Serveur Web (Nginx)
FROM nginx:alpine
# On copie les fichiers compilés d'Angular dans le dossier par défaut de Nginx
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
