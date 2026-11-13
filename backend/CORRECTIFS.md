# Correctifs du portail SaaS (backend)

> **Non compilé ni exécuté.** Ces fichiers ont été relus et vérifiés partiellement (équilibre des blocs, champs Prisma),
> mais pas compilés. Lancez `npm run build` et les tests de la fin avant tout usage.
> Fichiers que je n'ai pas vus et dont ces correctifs dépendent : `config.ts` (cfg, currencyForCountry, PLAN_KEYS),
> `mail/mail.service.ts`, `main.ts`, `app.module.ts`, `billing.service.ts` (inchangé), le frontend.

## Application
1. Copier les fichiers de `backend/` par-dessus ceux du projet. **Supprimer** `src/billing/billing.controller.ts`.
2. Schéma : en développement `npx prisma db push` ; en production une migration versionnée
   (`npx prisma migrate dev --name tenant_cycle_de_vie`). `Tenant.email` n'est plus unique.
3. `AppModule` : importer `CoreModule` UNE seule fois (il fournit PrismaService, AxelorService, MailService).
4. Variables : `AXELOR_CLIENT_GROUP_USER` ne doit plus être `N2F`. En développement seulement : `ALLOW_UNSAFE_GROUP=true`.
5. Enregistrer UTF-8 tous les fichiers (certains contenaient des caractères `�`).

## Ce qui est corrigé
| # | Problème | Correctif |
|---|---|---|
| 1 | Un webhook rejoué relançait le provisioning ; le 2e job échouait ("login existe déjà") et passait le tenant ACTIF en FAILED | Table `WebhookEvent` réellement utilisée ; `updateMany` sur les statuts autorisés ; job BullMQ à identifiant déterministe ; un tenant ACTIF n'est plus reprovisionné |
| 2 | `process()` avalait toutes les erreurs : les 5 tentatives BullMQ ne servaient à rien | L'erreur est relancée ; FAILED seulement à la dernière tentative ou erreur définitive (`UnrecoverableError`) |
| 3 | Aucune reprise : chaque tentative recréait un Partner | Chaque étape est enregistrée dans `Tenant` (partner, société, utilisateur) et sautée si déjà faite |
| 4 | **Code de société dérivé du nom, et société réutilisée si le code existe** : deux clients au nom proche partageaient une société | Code unique par tenant (`NOM-<6 car. de l'id>`), stocké une fois ; pas de réutilisation entre clients |
| 5 | `manage-access` ignoré par le processor et jamais appelé : **l'impayé et la résiliation ne bloquaient aucun utilisateur Axelor** | Job implémenté (aligne `blocked` sur le statut du tenant) et appelé par les webhooks |
| 6 | Le premier échec de paiement suspendait aussitôt le compte ; aucune réactivation | PAST_DUE (accès conservé) ; SUSPENDED + blocage sur `unpaid`/`canceled` ; `invoice.paid` rétablit l'accès |
| 7 | `checkout.session.completed` sans contrôle de `payment_status` / `mode` | Contrôlés ; `checkout.session.async_payment_succeeded` géré |
| 8 | `register()` supprimait les inscriptions en cours d'autres personnes (même login/e-mail) : paiement reçu, tenant effacé, webhook en erreur | Purge limitée aux demandes abandonnées depuis plus de 24 h |
| 9 | Messages d'erreur distincts : énumération des logins/e-mails de l'ERP | Un seul message ; logins réservés refusés |
| 10 | Si Stripe échouait, login et e-mail restaient bloqués | Le tenant créé est supprimé en cas d'échec |
| 11 | `GET /api/signup/:id/status` renvoyait login, e-mail, société | Ne renvoie que le statut |
| 12 | `POST /api/billing/checkout` public (n'importe quel tenantId) | Route supprimée |
| 13 | `Math.random()` pour le mot de passe temporaire | `crypto.randomInt`, 16 caractères |
| 14 | Plusieurs instances de PrismaService/AxelorService (3 sessions Axelor) | `AxelorModule` unique ; CoreModule global |
| 15 | Groupe `N2F` donné à tous les abonnés | Refusé par défaut (garde-fou), voir ci-dessous |

## Ce qui N'EST PAS corrigé (indispensable avant la vente)
- **Le groupe et le rôle des abonnés.** Il faut un rôle construit de zéro, avec une condition de société sur chaque objet
  des notes de frais, et SANS droit sur `User`, `Group`, `Role`, `Permission`, `App*`, `MetaMenu` global, etc.
- Le provisionnement ne crée toujours pas la séquence de notes de frais, la `HRConfig` ni la fiche employé.
- Aucune limitation de débit ni CAPTCHA sur `POST /api/signup`, aucune vérification de l'e-mail avant la création du client Stripe.
- Pas de portail client Stripe (changer de carte, résilier) ; pas d'alerte quand un client payé reste en FAILED.
- Le webhook exige que `main.ts` applique `express.raw({ type: "application/json" })` à `/api/webhooks/stripe`.
- Votre page de succès : si elle affichait le login ou l'e-mail renvoyés par `/status`, ils n'y sont plus.

## Tests à faire (Stripe en mode test)
1. **Rejeu** : `stripe events resend <evt_id>` après un provisioning réussi : aucun second job, tenant toujours ACTIVE.
2. **Panne en cours de route** : arrêter Axelor pendant un provisioning, le relancer : le job reprend, un seul Partner, une seule société.
3. **Même nom de société** pour deux inscriptions : deux sociétés distinctes dans Axelor.
4. **Garde-fou** : avec `AXELOR_CLIENT_GROUP_USER=N2F` et sans `ALLOW_UNSAFE_GROUP`, le tenant passe en FAILED avec un message explicite.
5. **Impayé** : `stripe trigger invoice.payment_failed` => PAST_DUE, utilisateur toujours actif ; passer l'abonnement en `unpaid`
   (`customer.subscription.updated`) => SUSPENDED et `blocked=true` dans Axelor ; `invoice.paid` => débloqué.
6. **Annulation** : `customer.subscription.deleted` => CANCELLED et utilisateur bloqué.
7. **Inscription concurrente** : deux navigateurs, même login : le second reçoit le message générique, le premier n'est pas perturbé.
