# AGRONEX — migration Cloudflare : état et prochaines étapes

## Décisions produit confirmées

- Aucun Supabase.
- Les administrateurs s’authentifient avec Manus; les membres avec Google/Gmail ou TikTok.
- Les secrets restent dans les secrets du Worker, jamais dans GitHub.
- Les changements restent isolés sur `cloudflare-migration`; `main` n’a pas été modifiée.
- Le portage ne doit pas activer de paiements automatiques.

## État actuel — aucun déploiement distant effectué

Le code de cette branche prépare le backend AGRONEX pour Cloudflare Workers et D1. **Aucune base, bucket, Worker ou Pages n’a été créé ou modifié dans le compte Cloudflare pendant cette phase.** Les appels au compte ont été en lecture seule.

L’inventaire Cloudflare a révélé une base D1 nommée `my-binding` et trois Workers existants, sans indice qu’ils appartiennent à AGRONEX; ils ne seront pas réutilisés ni écrasés. Aucun projet Pages n’est présent. L’API R2 répond `10042` et demande d’activer R2 depuis le tableau de bord Cloudflare. Le Wrangler CLI de cet environnement n’est pas encore authentifié.

## Travail réalisé sur `cloudflare-migration`

- Politique d’authentification : Manus seul peut établir une session administrateur; Google et TikTok restent membres uniquement.
- Schéma SQLite dédié dans `drizzle/schema.d1.ts`, configuration Drizzle et migration initiale D1 couvrant les tables applicatives; les valeurs d’enum sont contrôlées par des `CHECK` SQLite.
- Portage des couches profils, social, invitations, commandes et paiements vers des écritures SQLite/D1 conditionnelles et des batches atomiques.
- Adaptateur de médias par binding R2; les URL présignées non prises en charge ne sont pas présentées comme fonctionnelles.
- Entrée Workers et bootstrap des bindings D1/R2; séparation de l’API Express des middlewares Vite réservés au serveur Node.
- Frontend et API prévus sur **un même Worker** avec Workers Static Assets, afin d’utiliser le même domaine et éviter une configuration CORS inutile.
- Correctif pnpm versionné pour `iconv-lite@0.4.24`: son champ `browser` désactivait `streams` dans le bundle Workers et faisait échouer le démarrage Express.
- `.gitignore` protège maintenant `.wrangler/`, `wrangler.local.toml`, `.dev.vars` et `.env.production`.

## Validation locale effectuée

- Migration D1 locale : **46 commandes SQL exécutées**; la base simulée contient les tables applicatives, `PRAGMA foreign_key_check` ne relève aucune violation et une valeur de rôle invalide est rejetée.
- Wrangler `deploy --dry-run` : bundle Worker produit avec succès.
- Wrangler `dev --local` : démarrage réussi avec les bindings locaux `DB`, `MEDIA` et `ASSETS`.
- `GET /healthz` : **HTTP 200**, `{"ok":true,"service":"agronex-api"}`.
- Workers Assets : `/` et une route SPA inconnue renvoient tous deux l’application, **HTTP 200**.
- TypeScript : `pnpm check` passe.
- Tests : **46 tests dans 10 fichiers passent** en excluant les deux tests d’intégration exigeant une base réelle et l’identité propriétaire de production.
- Build Node existant : `pnpm build` passe; Vite signale encore que les variables analytiques optionnelles ne sont pas définies.

Le test Wrangler local signale naturellement l’absence de `OAUTH_SERVER_URL` dans l’environnement local; les routes de santé et les assets restent opérationnels. Ce message ne valide pas encore les parcours OAuth de production.

## Prérequis bloquants pour le déploiement

1. **Activer R2** dans le tableau de bord Cloudflare. La création de buckets est actuellement refusée par l’API (`10042`).
2. **Autoriser Wrangler CLI** dans l’environnement de déploiement (`wrangler login`). `wrangler whoami` indique que le CLI n’est pas authentifié; il faut cette autorisation pour créer/appliquer les ressources et publier le Worker sans transporter les secrets dans des appels API ou le dépôt.
3. Le fichier de production remis contient le secret JWT, l’URL OAuth Manus et les identifiants Google/TikTok, mais **ne contient pas** `VITE_APP_ID` ni `VITE_OAUTH_PORTAL_URL`. Ces deux valeurs sont nécessaires au bouton de connexion Manus côté navigateur et doivent être obtenues auprès du projet OAuth Manus, puis injectées uniquement au build.
   `AGRONEX_OWNER_OPEN_ID` n’est pas fourni non plus. Quatre adresses sont présentes dans `AGRONEX_ADMIN_EMAILS`; l’autorisation Manus reposera donc sur une adresse e-mail correspondante renvoyée par le fournisseur. Si Manus ne renvoie pas cet e-mail, il faudra aussi fournir l’OpenID propriétaire.
4. `DATABASE_URL` et `DRIZZLE_DATABASE_URL` sont vides dans le fichier remis. Il n’y a donc aucune source de données de production à importer. Le déploiement prévu créerait une **nouvelle base D1 vide**; aucun profil, publication, commande ou compte existant ne sera transféré par cette migration.
5. Après création du domaine Worker, `AGRONEX_PUBLIC_BASE_URL` devra être remplacée par son URL HTTPS finale. Il faudra également enregistrer les callbacks Google et TikTok de ce domaine :
   - `/api/oauth/social/google/callback`
   - `/api/oauth/social/tiktok/callback`
6. Créer des ressources dédiées AGRONEX (par exemple D1 `agronex-prod` et R2 `agronex-media-prod`), sans toucher à `my-binding` ou aux Workers existants; appliquer ensuite `drizzle/d1-migrations` à D1 distante.
7. Définir les secrets Worker depuis le fichier de production par une commande locale sécurisée (pas de valeur dans Git, un log ou le chat), puis déployer le Worker avec les assets `dist/public`.

## Configuration cible

Un seul Worker servira `server/_core/worker.ts` et `dist/public` avec `assets.not_found_handling = "single-page-application"`; `assets.run_worker_first` devra inclure `/api/*`, `/healthz` et `/manus-storage/*`. Une fois les ressources créées, `wrangler.toml` devra déclarer les bindings `DB` et `MEDIA` avec les identifiants propres à AGRONEX. Aucun identifiant de ressource n’est encore inscrit dans le dépôt.

Les parcours Google/TikTok et Manus devront être testés sur le domaine final avant d’annoncer la mise en production. Les identifiants de paiement restent désactivés comme dans l’environnement actuel.

## Références techniques

- [Cloudflare — déployer Express sur Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/)
- [Cloudflare — compatibilité Node.js des Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [Cloudflare — Static Assets et `run_worker_first`](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare — routage SPA](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Cloudflare Workers SDK — erreur `require_streams` et contournement `iconv-lite`](https://github.com/cloudflare/workers-sdk/issues/9309)
- [Drizzle — connecter Cloudflare D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1)
- [Drizzle — batch API](https://orm.drizzle.team/docs/sqlite/batch-api)
- [Cloudflare — API D1 et batch atomique](https://developers.cloudflare.com/d1/worker-api/d1-database/)
