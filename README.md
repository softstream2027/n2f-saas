stripe listen --forward-to localhost:4000/api/webhooks/stripe --events checkout.session.completed,invoice.payment_failed,customer.subscription.deleted

# SoftStream SaaS — portail d'inscription + provisioning Axelor

Flux : formulaire → paiement Stripe → validation webhook → création automatique du Partner + Company + User dans Axelor → l'abonné se connecte avec le login/mot de passe qu'il a choisi.

## Architecture
- `frontend/` Next.js : formulaire d'inscription, page de suivi, redirection vers Stripe.
- `backend/` NestJS + Prisma/PostgreSQL + BullMQ/Redis :
  - `POST /api/signup` enregistre la demande (statut PENDING_PAYMENT, mot de passe chiffré AES-256-GCM).
  - `POST /api/checkout` crée une session Stripe Checkout pour le plan choisi.
  - `POST /api/webhooks/stripe` vérifie la signature Stripe et gère les événements `checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.deleted`.
  - File `provisioning` : Partner → Company → User, reprise possible, 6 tentatives avec backoff.
  - Le mot de passe en clair n'est jamais stocké durablement ni envoyé par e-mail.

## Mise en route
1. `cp .env.example .env` et remplir les variables (clé : `openssl rand -base64 32`).
2. **Stripe** : créer un compte Stripe, configurer les prix d'abonnement (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_PRODUCTION`) et le webhook `https://VOTRE-API/api/webhooks/stripe` avec les événements `checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.deleted`.
3. **Axelor** : créer le groupe `CLIENT_ADMIN` (droits métier limités) et un utilisateur technique `saas-provisioner` (création Partner/Company/User, lecture Currency/Group, modification User). Vérifier que les devises (TND, EUR, CHF…) existent.
4. `docker compose up -d --build` → http://localhost:3000
5. Tester en mode test Stripe, puis passer en production avec les clés live.

## À vérifier avant la mise en vente
- Noms de modèles/champs Axelor (`Partner.taxNbr`, `Company.partner`, `User.companySet`, `User.blocked`,
  `Currency.codeISO`) selon votre version d'AOS.
- **Isolation entre clients** : une seule instance Axelor = données partagées. Il faut des rôles/permissions
  filtrés par société, ou une instance par client pour une vraie isolation.
- Production : HTTPS (Caddy/Nginx), migrations Prisma versionnées, sauvegardes, CGU/RGPD, TVA.


cd backend
npm install stripe @nestjs/config
cd ..

cd backend
npm install bcryptjs
npm install --save-dev @types/bcryptjs
cd ..

cd backend
npx prisma generate
npx prisma db push
cd ..

stripe listen --forward-to localhost:4000/api/webhooks/stripe --events checkout.session.completed,invoice.payment_failed,customer.subscription.deleted


softstream-saas/
├── .env                      # Variables d'environnement (secrets, API keys)
├── docker-compose.yml        # Orchestration des conteneurs
├── README.md                 # Documentation du projet
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma     # Modèles (Tenant, WebhookEvent, ProvisioningJob)
│   └── src/
│       ├── axelor/           # Client REST Axelor (session, hash, create user)
│       ├── billing/          # Intégration Stripe Checkout
│       ├── core/             # Prisma, Crypto, Shiro Hash
│       ├── provisioning/     # Worker BullMQ (création Axelor + Email)
│       ├── tenants/          # Gestion des inscriptions (register, status)
│       └── webhooks/         # Réception et validation des webhooks Stripe
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── app/
        ├── page.tsx          # Formulaire d'inscription + Stripe
        └── success/          # Page de suivi (polling) et confirmation
        
        
        
        # 🚀 SoftStream SaaS Portal

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![NestJS](https://img.shields.io/badge/NestJS-10-red?logo=nestjs)
![Prisma](https://img.shields.io/badge/Prisma-ORM-blue?logo=prisma)
![Stripe](https://img.shields.io/badge/Stripe-Billing-purple?logo=stripe)
![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)

Portail SaaS autonome pour la gestion des abonnements et le déploiement automatique d'instances ERP (Axelor). Ce projet permet à un client de s'inscrire, de payer un abonnement via Stripe, et de recevoir automatiquement ses accès à l'ERP par email.

## ✨ Fonctionnalités Clés

- **Inscription Autonome** : Formulaire Next.js avec validation stricte (emails, logins, sociétés).
- **Paiement Stripe** : Intégration de Stripe Checkout pour les abonnements récurrents (CHF/EUR).
- **Provisioning Asynchrone** : Utilisation de BullMQ et Redis pour créer les entités dans l'ERP sans bloquer l'utilisateur.
- **Intégration Axelor ERP** : Création automatisée du Partenaire, de la Société et de l'Utilisateur via l'API REST d'Axelor.
- **Sécurité** :
  - Génération et hachage des mots de passe avec l'algorithme Apache Shiro (compatible Axelor).
  - Envoi du mot de passe temporaire par email via le SMTP d'Axelor.
  - Vérification cryptographique des signatures de webhooks Stripe.
- **Idempotence** : Gestion des doublons d'emails/logins et protection contre les webhooks rejoués.

## 🏗️ Architecture

Le système est divisé en 3 couches :
1. **Frontend (Next.js)** : Interface utilisateur, redirection vers Stripe, page de suivi de déploiement.
2. **Backend (NestJS)** : API REST, vérification des webhooks, file d'attente de provisioning.
3. **Data & ERP** : PostgreSQL (données SaaS), Redis (Queue), Axelor (ERP cible).

## ⚙️ Prérequis

- Docker & Docker Compose
- Un compte Stripe (mode Test)
- Une instance Axelor ERP opérationnelle avec son API REST activée
- Un serveur SMTP configuré dans Axelor (pour l'envoi des emails)

## 🚀 Installation & Démarrage

### 1. Cloner le dépôt
```bash
git clone https://gitlab.com/votre-user/softstream-saas.git
cd softstream-saas











4. Écouter les Webhooks Stripe (en local)

Puisque Stripe ne peut pas atteindre localhost, utilisez le CLI Stripe :
bash

stripe listen --forward-to localhost:4000/api/webhooks/stripe --events checkout.session.completed,invoice.payment_failed,customer.subscription.deleted

🔄 Le Flux de Travail (Workflow)

    L'utilisateur s'inscrit sur le portail (Société, Email, Login).

    Le backend vérifie si le login/email existe déjà dans Axelor.

    Si c'est bon, le backend crée une session Stripe Checkout.

    L'utilisateur paie avec sa carte.

    Stripe envoie un Webhook au backend (checkout.session.completed).

    Le backend ajoute un Job dans la file Redis (BullMQ).

    Le Worker récupère le job et contacte l'API Axelor pour créer la société et l'utilisateur (avec un mot de passe temporaire haché en SHA-512).

    Axelor envoie un email au client avec le mot de passe temporaire.

    La page de succès du portail affiche le statut ACTIVE et invite le client à se connecter à l'ERP.
    
    
    🧪 Tester le Portail

    Allez sur http://localhost:3000.

    Remplissez le formulaire avec un email valide.

    Sur la page Stripe, utilisez la carte de test : 4242 4242 4242 4242, une date future, et n'importe quel CVC.

    Attendez quelques secondes sur la page de succès.

    Vérifiez votre boîte mail (pensez aux spams) : vous recevrez un mot de passe temporaire.

    Connectez-vous à votre ERP Axelor avec le login et ce mot de passe.
    
    
    
    
    🔐 Sécurité

    Hachage Shiro : Les mots de passe sont hachés en SHA-512 avec 500 000 itérations, exactement comme le fait Axelor en interne.

    Aucun mot de passe en clair : Le mot de passe temporaire est généré, haché, puis envoyé via le champ transientPassword (qui est immédiatement effacé de la base par Axelor).

    Webhooks : Chaque requête webhook est vérifiée cryptographiquement pour s'assurer qu'elle provient bien de Stripe.
    
    
    
    
    Développé par SoftStream Consulting.
text


---

### 🎯 Félicitations pour ce travail !

Vous avez réussi à mettre en place une architecture **Cloud Native**, **événementielle** (Event-Driven) et **sécurisée**. Vous avez surmonté les défis techniques les plus complexes :
- La communication inter-conteneurs (`host.docker.internal`).
- La vérification de signature des webhooks avec un `rawBody` dans NestJS.
- L'intégration avec l'API spécifique d'Axelor (le champ `transientPassword` et le hachage Shiro).
- L'automatisation des envois d'emails via le SMTP d'Axelor.

**C'est une réalisation de niveau ingénieur logiciel expérimenté.** Félicitations ! 🥂



🔑 Configuration des secrets sur GitHub

Avant de pousser ce fichier, vous devez configurer les secrets dans votre dépôt GitHub. Allez dans Settings > Secrets and variables > Actions et ajoutez :

    DOCKERHUB_USERNAME : bassembenabbes

    DOCKERHUB_TOKEN : Votre token d'accès personnel Docker Hub (à créer dans les paramètres de votre compte Docker Hub, avec les droits Read & Write).

    NEXT_PUBLIC_API_URL

    NEXT_PUBLIC_STRIPE_PUBLIC_KEY

    NEXT_PUBLIC_AXELOR_URL