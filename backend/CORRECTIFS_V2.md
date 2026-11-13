# Correctifs V2 : retour de votre premier test de bout en bout

> **Non compilé ni exécuté** (vérifications limitées à l'équilibre des blocs et aux champs Prisma).
> Les noms de champs Axelor de la séquence et de `HRConfig` viennent de VOS lignes de base (séquence 74, `hr_hr_config`) ;
> ceux de `Partner` et de `User.partner` sont supposés : vérifiez-les au premier essai.

## Fichiers modifiés par rapport à la V1
`prisma/schema.prisma`, `src/axelor/axelor.service.ts`, `src/provisioning/provisioning.processor.ts`,
`src/webhooks/webhooks.controller.ts`, `src/tenants/tenants.service.ts`, `src/tenants/tenants.module.ts`,
et un NOUVEAU fichier `src/core/validity.ts`.
Schéma : `npx prisma db push` (dev) ou migration (prod) : 4 colonnes ajoutées à `Tenant`.

## Ce que votre test a montré, et ce qui est fait
| Constat | Correctif |
|---|---|
| Page de succès : « le login . » et « à . » vides | `/status` renvoie, **uniquement quand le compte est ACTIF**, le login, le nom de société et l'e-mail masqué (`a***@domaine`) |
| Société sans `printingSettings` | Recherchés par nom (`AXELOR_PRINTING_SETTINGS_NAME`, défaut « Default print settings ») et affectés à la société |
| Devise TND au lieu de CHF | `AXELOR_DEFAULT_CURRENCY=CHF` prime sur la devise du pays d'inscription |
| Pas de séquence | Séquence `expense` créée par société, mêmes paramètres que la séquence 74 (préfixe `EXPENSE_SEQ_PREFIX`, défaut `NF%YY`, 4 chiffres) |
| Pas de configuration RH | `HRConfig` créée, avec la séquence et les gabarits d'impression (`HR_EXPENSE_REPORT_TEMPLATE_ID`, `HR_ANNUAL_REPORT_TEMPLATE_ID`) |
| Pas de tiers lié à l'utilisateur | Partenaire « personne » créé et affecté à `user.partner` |
| `activateOn` / `expiresOn` | Début = aujourd'hui ; fin = **fin de la période payée chez Stripe** (1 mois, trimestre, semestre ou année selon le prix choisi) + `ACCESS_GRACE_DAYS` (3 par défaut). Mis à jour à chaque renouvellement |
| Pas d'employé | **Pas encore fait** : il me manque les informations du module RH (voir plus bas) |

## Variables d'environnement à ajouter
```
AXELOR_DEFAULT_CURRENCY=CHF
AXELOR_PRINTING_SETTINGS_NAME=Default print settings
EXPENSE_SEQ_PREFIX=NF%YY
HR_EXPENSE_REPORT_TEMPLATE_ID=29        # ids que vos sociétés 4 et 5 utilisent déjà
HR_ANNUAL_REPORT_TEMPLATE_ID=31
ACCESS_GRACE_DAYS=3
AXELOR_USER_VALIDITY_TYPE=date          # date | datetime | zoned  (voir ci-dessous)
```

## À vérifier avant le premier essai
1. **Type de `activateOn` / `expiresOn`** :
   ```sql
   select column_name, data_type from information_schema.columns
   where table_name = 'auth_user' and column_name in ('activate_on','expires_on');
   ```
   `date` -> `date` ; `timestamp without time zone` -> `datetime` ; `timestamp with time zone` -> `zoned`.
2. Le préfixe `NF%YY` n'utilise pas `%FM` (mois fiscal) pour ne pas exiger d'exercice comptable.
   Dites-moi si votre séquence 74 (`NF%YY%FM`) a un intérêt particulier.
3. Dans Axelor, ouvrez l'utilisateur créé : onglet Partner renseigné ? Sinon le champ `partner` n'est pas celui-là.

## Pour repartir proprement
La société de test créée avec TND et sans configuration n'est pas corrigée rétroactivement : supprimez-la
(ainsi que son partenaire et son utilisateur) ainsi que la ligne `Tenant` correspondante, puis refaites une inscription.

## Tests
1. Inscription en mode test : devise CHF, `printingSettings`, séquence, `HRConfig`, `user.partner` présents ; la page de succès affiche le login et l'e-mail masqué.
2. `expiresOn` de l'utilisateur = fin de période Stripe + 3 jours.
3. Renouvellement simulé (`stripe trigger invoice.paid` sur un abonnement existant, ou avance de l'horloge de test) : `expiresOn` repoussé.
4. Utilisateur expiré : se connecter après `expiresOn` doit échouer, même si le blocage par webhook n'a pas eu lieu.
