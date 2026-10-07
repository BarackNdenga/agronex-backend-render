# AGRONEX — suivi des fonctionnalités sociales et paiements

## Réseau social
- [x] Fil social « Pour toi », « Suivis » et « Ami(e)s » — tri chronologique actuel, source personnalisée à faire évoluer avec l’usage.
- [x] Recherche de membres et de publications publiques.
- [x] Création de publications texte/photo, visibilité publique ou limitée aux connexions.
- [x] Photo de profil réelle via le stockage cloud, présentation du profil et modifications de bio/ville/nom.
- [x] Suivre / ne plus suivre; invitations de connexion, réponse/acceptation, listes de connexions.
- [x] Commentaires, réactions J’aime, sauvegarde, repartage simple ou avec citation, partage natif/lien direct.
- [x] Notifications internes des abonnements, demandes, acceptations, réactions, commentaires et repartages.
- [x] Confidentialité de profil et réglage des demandes de connexion.
- [x] Espace Moi avec enregistrements, relations, réglages et retour au marché.

## PWA et mobile
- [x] Interface pensée pour Android et iPhone avec navigation basse et zones sécurisées.
- [x] Installation PWA et icône/manifeste maintenus.
- [x] Suppression de la mise en cache hors ligne; nouveau service worker efface les anciens caches puis se désinscrit.

## Paiements — état actuel
- [x] Achats manuels Mobile Money (M-Pesa/Airtel Money) prêts en FC, avec répartition serveur 95 % vendeur / 5 % AGRONEX; arrondi de commission au FC le plus proche.
- [x] Achat en deux étapes, référence SMS vérifiée par un administrateur, journal de transaction et portefeuille vendeur avec demande de retrait.
- [x] Aucun paiement automatique, abonnement, boost ou retrait automatisé; les transferts de réception/remboursement/versement sont manuels via le téléphone de l’équipe.
- [x] Stock réservé à la création de demande; libéré si l’acheteur annule avant transfert ou si l’admin refuse; demande référencée non annulable par le client afin d’éviter de masquer un transfert déjà effectué.
- [x] Compte et numéro destinataire copiés sur la demande; une nouvelle configuration ne change pas les instructions historiques.
- [x] Services backend, API protégée, interfaces acheteur/vendeur/admin et migrations additives 0006 à 0008 alignés.
- [x] Références de versement uniques par opérateur; retries ne peuvent pas débiter deux fois le même SMS.
- [x] Commandes désactivées par défaut; le propriétaire est le seul à pouvoir configurer les comptes de réception et les activer depuis `/admin`.
- [x] Build/tests et capture pleine page du tableau admin mobile contrôlés; aucun transfert réel ni configuration de compte marchand n’a été fait.
- Le partage réel de 5 % se produit quand l’administrateur rapproche le transfert reçu sur son téléphone et valide la référence dans AGRONEX; la partie vendeur est créditée au portefeuille interne.

## Évolution éventuelle
- Les fournisseurs Google/Facebook/TikTok sont implémentés mais restent inactifs jusqu’à configuration de leurs identifiants serveur.
- Le fil Pour toi est actuellement chronologique; les recommandations personnalisées pourront évoluer avec l’usage et les garde-fous anti-abus.
- Essai pratique Android/iPhone à faire avant ouverture publique des paiements.


## Accès administrateur
- [x] Après connexion, tout compte dont le rôle serveur est `admin` est automatiquement redirigé vers `/admin`, indépendamment du choix local « Agriculteur ».
- [x] L’API refuse à un compte admin la création d’un profil agricole.
- [x] Le bouton du tableau admin déconnecte correctement avant le retour à l’accueil, sans boucle de redirection.
- [x] Un rôle admin est accordé par invitation privée validée et vérification serveur de l’e-mail associé; le choix d’un rôle dans l’interface ne peut pas conférer les droits admin.

## Connexion et inscription sociales
- [x] Suppression du parcours OTP WhatsApp/Turnstile dans l’interface et les routes; le téléphone de profil est facultatif.
- [x] Flux serveur Google, Facebook Login et TikTok Login Kit préparés avec state anti-CSRF, validation des identités côté serveur et callbacks statiques.
- [x] Manus OAuth conservé pour les membres déjà inscrits et l’administration; aucun compte n’est fusionné automatiquement par e-mail.
- [x] Boutons sociaux grisés tant que les six identifiants/secrets ne sont pas fournis; endpoints retournent HTTP 503 sans démarrer un flux.
- [x] Activation réelle conditionnée à la configuration des applications fournisseurs et à l’enregistrement de leurs callbacks exacts; les secrets n’ont pas été fournis.
- [x] Tables/colonne OTP vides conservées sans usage, car l’outil de base a bloqué la suppression destructive; le schéma Drizzle est maintenu aligné.
