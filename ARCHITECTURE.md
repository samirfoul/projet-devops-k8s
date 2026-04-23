# Architecture du Projet DevOps — Kubernetes

> Explication complète du projet : Frontend → Backend → Docker → Kubernetes → Infrastructure

---

## Table des matières

1. [L'Application](#1-lapplication)
2. [Docker — Empaqueter l'application](#2-docker--empaqueter-lapplication)
3. [Kubernetes — Orchestrer les containers](#3-kubernetes--orchestrer-les-containers)
4. [L'Infrastructure](#4-linfrastructure)
5. [Helm — Le gestionnaire de paquets Kubernetes](#5-helm--le-gestionnaire-de-paquets-kubernetes)
6. [Le flux complet](#6-le-flux-complet--de-ton-code-à-lutilisateur)
7. [Résumé](#7-résumé)

---

## 1. L'Application

### Frontend (Angular 18)

```
frontend/src/
├── app.component.ts    ← logique (canvas animation + appels API)
├── app.component.html  ← template HTML
├── app.component.css   ← styles du composant
└── styles.css          ← styles globaux
```

C'est une **Single Page Application (SPA)**. Le navigateur charge une seule page HTML, et Angular gère tout le reste en JavaScript côté client. Elle communique avec le backend via des appels REST pour lire, créer, modifier et supprimer des étudiants.

L'animation du fond est réalisée avec une **API Canvas HTML5** : des nœuds Kubernetes (masters hexagonaux, workers, pods) s'animent et se connectent dynamiquement.

---

### Backend (Node.js / Express)

```
backend/
└── server.js   ← API REST + connexion PostgreSQL
```

Expose 4 routes :

| Méthode | Route | Action |
|---------|-------|--------|
| `GET` | `/api/students` | Lire tous les étudiants |
| `POST` | `/api/students` | Créer un étudiant |
| `PUT` | `/api/students/:id` | Modifier un étudiant |
| `DELETE` | `/api/students/:id` | Supprimer un étudiant |

Se connecte à PostgreSQL via les variables d'environnement injectées par Kubernetes : `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.

---

### Base de données (PostgreSQL)

Gérée par l'opérateur **CloudNativePG** directement dans Kubernetes. Les données persistent sur un volume Kubernetes (`PersistentVolumeClaim`). 3 instances tournent en parallèle : 1 primaire (lecture/écriture) + 2 réplicas (lecture seule).

---

## 2. Docker — Empaqueter l'application

Sans Docker, faire tourner l'app nécessite d'installer Node.js, Angular CLI, configurer Nginx... sur chaque machine. Avec Docker, on crée une **image** qui contient tout l'environnement nécessaire.

### Dockerfile du Frontend — Build multi-stage

```dockerfile
# Étape 1 : compiler Angular dans un container Node temporaire
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN ng build --configuration production
# → génère dist/frontend/browser/*.js (HTML/CSS/JS minifiés)

# Étape 2 : copier UNIQUEMENT les fichiers compilés dans Nginx
FROM nginx:alpine
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**Pourquoi 2 étapes ?** Pour que l'image finale soit légère. Node.js (~400 Mo) est utilisé seulement pour compiler, puis jeté. L'image finale ne contient que Nginx + les fichiers statiques.

```
Image finale (Nginx + fichiers) : ~25 Mo
Image si on gardait Node       : ~500 Mo
```

### Configuration Nginx (`nginx.conf`)

```nginx
location = /index.html {
    add_header Cache-Control "no-store, no-cache, must-revalidate";
}
location ~* \.(js|css|png|jpg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
location / {
    try_files $uri $uri/ /index.html;
}
```

- `index.html` n'est **jamais mis en cache** → le navigateur voit toujours la dernière version
- Les JS/CSS ont un **cache d'1 an** (leur nom contient un hash qui change à chaque build)
- Le fallback SPA renvoie `index.html` pour toutes les routes Angular

### Publier sur Docker Hub

```bash
docker build -t samfoul/frontend-k8s:v5 .
docker push samfoul/frontend-k8s:v5
```

Docker Hub est comme GitHub mais pour des images Docker. Kubernetes les télécharge depuis là lors du déploiement.

---

## 3. Kubernetes — Orchestrer les containers

### Pourquoi Kubernetes ?

| Problème | Solution Kubernetes |
|----------|---------------------|
| Container qui plante | Auto-guérison : recrée le pod automatiquement |
| Trop de trafic | Scaling horizontal : ajoute des replicas |
| Déploiement avec coupure | Rolling update : remplace progressivement |
| Routing complexe | Ingress : un seul point d'entrée |

---

### Pod

> **L'unité de base.** Un pod = 1 ou plusieurs containers qui tournent ensemble sur le même nœud.

```
Pod frontend → container nginx  (sert HTML/JS/CSS)
Pod backend  → container node   (sert l'API REST)
Pod app-db-1 → container postgres
```

Un pod est **éphémère** — il peut mourir à tout moment (nœud en panne, mise à jour...). C'est pour ça qu'on ne travaille jamais directement avec des pods seuls.

---

### Deployment

> **Garantit qu'un certain nombre de pods tourne EN PERMANENCE.**

```yaml
kind: Deployment
spec:
  replicas: 2                      # toujours 2 pods frontend en vie
  template:
    spec:
      containers:
      - image: samfoul/frontend-k8s:v5
```

Si tu supprimes un pod manuellement (`kubectl delete pod xxx`), le Deployment en recrée un immédiatement. C'est l'**auto-guérison**.

Lors d'une mise à jour d'image, Kubernetes fait un **Rolling Update** :
```
Avant : [pod-v4] [pod-v4]
Étape 1 : [pod-v4] [pod-v4] [pod-v5]   ← nouveau pod créé
Étape 2 : [pod-v4] [pod-v5]             ← ancien pod supprimé
Étape 3 : [pod-v5] [pod-v5]             ← terminé, zéro interruption
```

---

### Service

> **Donne une adresse IP stable à un groupe de pods.**

Le problème : les pods ont des IPs qui changent à chaque redémarrage. Le Service est un **proxy stable** devant eux.

```yaml
kind: Service
metadata:
  name: frontend-service
spec:
  selector:
    app: frontend         # cible tous les pods avec ce label
  ports:
  - port: 80
```

```
Trafic entrant → frontend-service:80 → [pod-1, pod-2]  (load balancing automatique)
```

Il existe 3 types de Services :

| Type | Accessibilité |
|------|--------------|
| `ClusterIP` (défaut) | Seulement à l'intérieur du cluster |
| `LoadBalancer` | Exposé vers l'extérieur (utilisé avec MetalLB) |
| `NodePort` | Exposé sur un port fixe de chaque nœud |

---

### Ingress

> **Le routeur HTTP du cluster. Une seule entrée pour tout le trafic.**

```yaml
kind: Ingress
spec:
  rules:
  - http:
      paths:
      - path: /api   → backend-service:3000
      - path: /      → frontend-service:80
```

Sans Ingress, il faudrait exposer chaque service séparément avec une IP différente. Avec l'Ingress, une seule IP/port gère tout le routage basé sur les chemins URL.

---

### HPA — HorizontalPodAutoscaler

> **Scale automatiquement selon la charge CPU.**

```yaml
kind: HorizontalPodAutoscaler
spec:
  minReplicas: 2
  maxReplicas: 5
  targetCPUUtilizationPercentage: 80
```

```
CPU < 80%  → 2 replicas (minimum)
CPU = 90%  → Kubernetes ajoute des replicas automatiquement
CPU baisse → Kubernetes supprime les replicas en trop
```

Nécessite le **Metrics Server** installé dans le cluster pour collecter les métriques CPU/RAM.

---

### Secret

> **Stocke des données sensibles (mots de passe, tokens) de façon sécurisée.**

L'opérateur CloudNativePG crée automatiquement un Secret contenant le mot de passe PostgreSQL. Le backend le lit via une variable d'environnement :

```yaml
env:
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: app-db-app   # nom du secret créé par CloudNativePG
      key: password
```

Le mot de passe n'est jamais écrit en clair dans les fichiers YAML.

---

## 4. L'Infrastructure

### Vue d'ensemble

```
┌──────────────────────────────────────────────────────────┐
│                      Ton Mac (macOS)                     │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │            Docker Desktop (VM Linux interne)       │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │        Cluster Kind "k8s-projet"             │  │  │
│  │  │                                              │  │  │
│  │  │  ┌─────────────┐  ┌────────┐  ┌────────┐   │  │  │
│  │  │  │control-plane│  │worker 1│  │worker 2│   │  │  │
│  │  │  └─────────────┘  └────────┘  └────────┘   │  │  │
│  │  │                                              │  │  │
│  │  │  Traefik    → Ingress Controller             │  │  │
│  │  │  MetalLB    → LoadBalancer (IP externe)      │  │  │
│  │  │  CloudNativePG → Opérateur PostgreSQL        │  │  │
│  │  │  Metrics Server → Métriques pour HPA         │  │  │
│  │  │                                              │  │  │
│  │  │  frontend x2   backend x2   app-db x3        │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
           ↑
   kubectl port-forward :8080
           ↑
     Ton navigateur
```

---

### Kind (Kubernetes IN Docker)

Kind fait tourner un cluster Kubernetes **dans des containers Docker** sur ton Mac. C'est du Kubernetes local pour le développement. En production ce serait AWS EKS, Google GKE, Azure AKS...

```yaml
# kind-config.yaml
nodes:
- role: control-plane   # cerveau du cluster (API server, scheduler, etcd)
- role: worker          # exécute les pods applicatifs
- role: worker
```

Le **control-plane** contient :
- `API Server` : reçoit toutes les commandes `kubectl`
- `Scheduler` : décide sur quel worker placer chaque pod
- `etcd` : base de données qui stocke l'état du cluster
- `Controller Manager` : surveille et corrige l'état (ex: recrée les pods morts)

---

### Traefik (Ingress Controller)

Traefik est le **routeur** qui lit les règles Ingress Kubernetes et redirige le trafic HTTP. Sans lui, les objets `Ingress` ne font rien — ils sont juste des règles sans moteur pour les appliquer.

```bash
helm install traefik traefik/traefik -n traefik-system --create-namespace
```

---

### MetalLB (LoadBalancer)

Sur les clouds (AWS, GCP), un `Service LoadBalancer` crée automatiquement une vraie IP externe. Sur Kind (local), il n'y a pas de cloud — MetalLB joue ce rôle en assignant des IPs fictives depuis un pool défini :

```yaml
# metallb-config.yaml
spec:
  addresses:
  - 172.18.255.200-172.18.255.250   # plage d'IPs disponibles
```

---

### CloudNativePG (Opérateur PostgreSQL)

Un **opérateur** Kubernetes est un programme qui étend Kubernetes pour gérer des applications complexes. CloudNativePG comprend comment :
- Démarrer PostgreSQL correctement
- Créer des réplicas en lecture
- Gérer les failovers (si le primaire tombe, un réplica devient primaire)
- Créer les Secrets avec les credentials

```yaml
# db-cluster.yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster          # ressource custom créée par l'opérateur
metadata:
  name: app-db
spec:
  instances: 3         # 1 primaire + 2 réplicas
  storage:
    size: 1Gi
```

Cela crée automatiquement 3 Services :
- `app-db-rw` → lecture/écriture (primaire uniquement)
- `app-db-ro` → lecture seule (réplicas)
- `app-db-r` → tous les nœuds

---

## 5. Helm — Le gestionnaire de paquets Kubernetes

Déployer manuellement plusieurs fichiers YAML à chaque fois est fastidieux et source d'erreurs. Helm regroupe tout en un **Chart** (paquet) avec des variables.

### Structure du Chart

```
devops-chart/
├── Chart.yaml          ← métadonnées (nom, version du chart)
├── values.yaml         ← variables configurables
└── templates/
    ├── frontend.yaml   ← Deployment + Service + HPA
    ├── backend.yaml    ← Deployment + Service + HPA
    └── ingress.yaml    ← Ingress Traefik
```

### values.yaml — point central de configuration

```yaml
replicaCount: 2
image:
  backend:  samfoul/backend-k8s:v3
  frontend: samfoul/frontend-k8s:v5    # ← changer la version ici
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 5
  targetCPUUtilizationPercentage: 80
```

### Commandes Helm essentielles

```bash
helm install mon-app-prod ./devops-chart    # premier déploiement
helm upgrade mon-app-prod ./devops-chart    # mise à jour
helm uninstall mon-app-prod                # supprime tout
helm list                                   # voir les releases installées
```

---

## 6. Le flux complet — De ton code à l'utilisateur

```
┌─────────────────────────────────────────────────────────┐
│  DÉVELOPPEMENT                                          │
│                                                         │
│  1. Tu modifies le code Angular                         │
│          ↓                                              │
│  2. docker build → image samfoul/frontend-k8s:v5        │
│          ↓                                              │
│  3. docker push  → Docker Hub (registre public)         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  DÉPLOIEMENT                                            │
│                                                         │
│  4. helm upgrade / kubectl set image                    │
│          ↓                                              │
│  5. Rolling update (zéro interruption) :                │
│     [pod-v4][pod-v4] → [pod-v4][pod-v5] → [pod-v5][pod-v5] │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  ACCÈS                                                  │
│                                                         │
│  6. kubectl port-forward service/traefik 8080:80        │
│          ↓                                              │
│  7. Navigateur → http://localhost:8080                  │
│          ↓                                              │
│  8. Traefik lit les règles Ingress :                    │
│     /api/* → backend-service → pod backend → PostgreSQL │
│     /*     → frontend-service → pod nginx → index.html  │
└─────────────────────────────────────────────────────────┘
```

### Séquence d'un appel API complet

```
Navigateur
    │  GET /api/students
    ▼
kubectl port-forward (tunnel local → cluster)
    │
    ▼
Traefik (Ingress Controller)
    │  route /api → backend-service
    ▼
backend-service (ClusterIP, load balancing)
    │  choisit un pod backend
    ▼
Pod backend (Node.js / Express)
    │  SELECT * FROM students
    ▼
app-db-rw (Service PostgreSQL)
    │
    ▼
Pod app-db-1 (PostgreSQL primaire)
    │  retourne les données
    ▼  (remonte la chaîne)
Navigateur reçoit le JSON
```

---

## 7. Résumé

| Composant | Rôle |
|-----------|------|
| **Angular** | Interface utilisateur dans le navigateur (SPA) |
| **Node.js / Express** | API REST, pont entre frontend et base de données |
| **PostgreSQL** | Persistance des données |
| **Docker** | Empaquette chaque composant en image portable |
| **Docker Hub** | Registre public pour stocker et distribuer les images |
| **Kind** | Simule un cluster Kubernetes sur ton Mac via Docker |
| **Deployment** | Garantit N replicas toujours en vie (auto-guérison) |
| **Service** | IP stable devant les pods (load balancing interne) |
| **Ingress** | Routeur HTTP : un seul point d'entrée, routage par chemin |
| **Traefik** | Implémente concrètement les règles Ingress |
| **MetalLB** | Fournit des IPs externes aux Services sur Kind (local) |
| **HPA** | Scale automatique selon la charge CPU (2 à 5 replicas) |
| **Metrics Server** | Collecte CPU/RAM des pods pour le HPA |
| **CloudNativePG** | Opérateur qui gère PostgreSQL en haute disponibilité |
| **Helm** | Déploie toute l'application avec une seule commande |

### Commandes de démarrage rapide

```bash
# 1. Créer le cluster
kind create cluster --name k8s-projet --config kind-config.yaml

# 2. Installer l'infrastructure
helm install traefik traefik/traefik -n traefik-system --create-namespace
helm install metallb metallb/metallb -n metallb-system --create-namespace
helm install cnpg cnpg/cloudnative-pg -n cnpg-system --create-namespace
helm upgrade --install metrics-server metrics-server/metrics-server -n kube-system --set args={--kubelet-insecure-tls}

# 3. Configurer MetalLB et déployer la DB
kubectl apply -f metallb-config.yaml
kubectl apply -f db-cluster.yaml

# 4. Déployer l'application
helm install mon-app-prod ./devops-chart

# 5. Accéder à l'app
kubectl port-forward service/traefik -n traefik-system 8080:80
# → http://localhost:8080

# 6. Tout arrêter
kind delete cluster --name k8s-projet
docker system prune -f
```
