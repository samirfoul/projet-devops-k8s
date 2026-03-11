# 🚀 Projet Annuaire DevOps - Kubernetes (K8s)

Ce projet est une application Fullstack (Angular/Node.js/PostgreSQL) déployée sur un cluster Kubernetes local (Kind) avec une architecture haute disponibilité.

## 🏗️ Architecture Technique
- **Cluster :** Kind (1 Master, 2 Workers)
- **Ingress Controller :** Traefik
- **Load Balancer :** MetalLB
- **Base de données :** PostgreSQL via l'Opérateur CloudNativePG (3 instances)
- **Monitoring :** Metrics Server (pour l'Autoscaling HPA)
- **Gestionnaire de paquets :** Helm (Chart personnalisée)

## 🚀 Guide de Déploiement (Démonstration)

### Étape 1 : Initialisation de l'Infrastructure
```bash
kind create cluster --name k8s-projet --config kind-config.yaml
helm install traefik traefik/traefik -n traefik-system --create-namespace
helm install metallb metallb/metallb -n metallb-system --create-namespace
kubectl apply -f metallb-config.yaml
```

### Étape 2 : Services et Base de Données
```bash
helm install cnpg cnpg/cloudnative-pg -n cnpg-system --create-namespace
helm upgrade --install metrics-server metrics-server/metrics-server -n kube-system --set args={--kubelet-insecure-tls}
kubectl apply -f db-cluster.yaml
```

### Étape 3 : Déploiement de l'Application (via Helm)
```bash
helm install mon-app-prod ./devops-chart
```

### Étape 4 : Accès (Tunnel macOS)
```bash
kubectl port-forward service/traefik -n traefik-system 8080:80
```
L'application est accessible sur : **http://localhost:8080**

## 🧪 Tests de Résilience (H/A)
Pour tester l'auto-guérison de Kubernetes, vous pouvez supprimer un pod backend ou l'instance primaire de la base de données :
```bash
kubectl delete pod <nom-du-pod>
```
Kubernetes recréera automatiquement la ressource pour maintenir l'état désiré.
