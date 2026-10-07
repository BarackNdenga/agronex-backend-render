# Migration AGRONEX vers Cloudflare

## Décisions confirmées

- **Aucun Supabase.**
- **Administrateurs : OAuth Manus uniquement.**
- **Membres : OAuth Google/Gmail ou TikTok uniquement.**
- Les secrets OAuth, JWT et les clés de service restent dans les variables secrètes Cloudflare, jamais dans GitHub.
- La branche `cloudflare-migration` isole le travail; `main` n’est pas modifiée.

## État du dépôt

Le backend actuel utilise Express et tRPC, Drizzle avec MySQL, et l’API de stockage Forge de Manus, qui fournit des URLs S3 présignées derrière le proxy `/manus-storage`. Le schéma principal est dans `drizzle/schema.ts`; les comportements métier sont notamment dans `server/db.ts`, `server/social.ts` et `server/payment-db.ts`.

Les parcours d’authentification Google et TikTok existent déjà pour les membres. Le premier changement de cette branche impose la séparation demandée : Manus seul peut établir une session admin; Google/TikTok restent des fournisseurs membres et une adresse configurée administrateur ne peut pas obtenir un compte admin par ces fournisseurs.

Le premier schéma SQLite/D1 est maintenant séparé dans `drizzle/schema.d1.ts`, avec sa configuration Drizzle et une migration initiale couvrant 20 tables. Les anciennes colonnes MySQL `ENUM` deviennent du texte contrôlé par 20 contraintes SQLite `CHECK`; un rôle invalide est rejeté. La migration a été exécutée sur SQLite local et les clés étrangères passent `PRAGMA foreign_key_check`. Cette étape ne connecte ni n’altère encore la base D1 distante.

Le module médias possède maintenant un adaptateur de binding R2 et valide les clés d’objet; le proxy conserve `Cache-Control: no-store`. Le bootstrap Worker doit encore lui injecter le binding `MEDIA`. Le fallback Forge est conservé uniquement pour les déploiements Node existants; les URLs signées ne sont pas prétendues compatibles R2 et le chemin correspondant échoue explicitement.

## Cible proposée

- **Frontend :** Cloudflare Pages.
- **API :** Cloudflare Workers. La documentation Cloudflare décrit l’exécution d’Express sur Workers avec `nodejs_compat` et `httpServerHandler`, ce qui permet de préserver le routage Express/tRPC au début.
- **Données :** Cloudflare D1 (SQLite) avec des migrations versionnées.
- **Médias :** Cloudflare R2 via un binding Worker, plutôt qu’une base SQL ou des credentials S3 exposés au client.
- **Queues et WebSockets :** différés. Les Queues seront ajoutées seulement pour les tâches asynchrones; les WebSockets nécessiteront un besoin produit précis, généralement via Durable Objects.

## Portage D1 requis avant déploiement

Ce backend ne peut pas être basculé sans adaptation SQL. L’audit trouve dans le code serveur :

- 10 blocs `.transaction()`;
- 14 verrous `.for("update")`;
- 11 usages d’upsert ou de résultats d’écriture propres à MySQL (`onDuplicateKeyUpdate`, `affectedRows`, erreurs de doublon).

D1 repose sur SQLite et expose une API `batch()` atomique, mais cela ne rend pas automatiquement compatibles les transactions conditionnelles MySQL existantes. Les commandes, réservations de stock, confirmations de paiements, écritures de portefeuille, versements et invitations admin devront être repensés avec des contraintes uniques, des mises à jour conditionnelles et des batches D1, puis couverts par des tests de concurrence et d’échec/rollback.

Les colonnes `mysqlEnum`, les types MySQL et la stratégie de migrations Drizzle doivent aussi être convertis. Le portage doit conserver les règles de paiement manuel actuelles; il ne doit pas activer des paiements automatiques.

## Étapes d’exécution

1. **Auth et rôles** — appliquer Manus-admin / Google-TikTok-membre; valider les callbacks, les sessions et les tests.
2. **D1** — créer un schéma SQLite dédié et les migrations initiales; adapter tous les upserts, transactions et écritures conditionnelles; tester localement avec Wrangler/D1.
3. **R2** — remplacer l’adaptateur S3 par un stockage via binding R2; valider les uploads, types de contenu, limites de taille et URL de lecture.
4. **Worker/API** — conserver l’API existante autant que possible, fournir les bindings D1/R2 et déplacer la configuration runtime vers l’environnement Worker, sans clés intégrées au code.
5. **Pages et validation** — vérifier les callbacks OAuth HTTPS, le parcours complet des rôles, les profils, le fil social, les médias, les commandes et les paiements manuels.
6. **Ressources et déploiement** — ne créer/appliquer les ressources Cloudflare qu’après avoir les accès de compte et les choix de domaine. Exécuter d’abord les migrations sur un environnement de test, vérifier les sauvegardes, puis déployer.

## Accès et configuration nécessaires au moment du déploiement

À ajouter côté Cloudflare — pas dans Git : identifiants Google OAuth et TikTok, configuration OAuth Manus requise, secret JWT, identifiant OAuth/App Manus, identifiant admin propriétaire ou liste admin, URL publique canonique, et bindings D1/R2. Les URI de callback Google et TikTok devront pointer vers le domaine final, par exemple `/api/oauth/social/google/callback` et `/api/oauth/social/tiktok/callback`.

Aucune donnée utilisateur existante n’est copiée par cette première phase. Si une base de production AGRONEX contient déjà des profils, publications ou commandes, la migration de données devra être planifiée séparément avec export, mapping des identités et validation avant bascule.

## Références techniques

- [Cloudflare — déployer Express sur Workers avec D1](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/)
- [Drizzle — connecter Cloudflare D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1)
- [Drizzle — batch API pour D1](https://orm.drizzle.team/docs/sqlite/batch-api)
- [Cloudflare — API D1 et batch atomique](https://developers.cloudflare.com/d1/worker-api/d1-database/)
