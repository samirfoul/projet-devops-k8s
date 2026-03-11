# On utilise une image Node.js légère et compatible avec ton Mac M1 (arm64)
FROM node:20-alpine

# On se place dans le dossier /app du conteneur
WORKDIR /app

# On copie les fichiers définissant les dépendances
COPY package*.json ./

# On installe les bibliothèques (express, pg, cors)
RUN npm install

# On copie tout le reste de ton code source
COPY . .

# On expose le port 3000
EXPOSE 3000

# La commande pour démarrer l'API
CMD ["node", "server.js"]