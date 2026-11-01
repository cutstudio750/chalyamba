# Taxi Saint-Irénée · site et espace client

Site de Taxi Saint-Irénée, taxi conventionné à Lyon et dans la métropole depuis 2014.
Charte graphique respectée : logos vectoriels extraits de la charte (jamais retapés), palette noir / taupe / sable / crème, typographie Jost.

## Ce qu'il y a dedans

| Page | Adresse |
|---|---|
| Accueil, avec réservation rapide | `/` |
| Prestations (ville, longues distances, mise à disposition, entreprises) | `/prestations` |
| Aéroport & gares | `/aeroport-gares` |
| Transport conventionné CPAM | `/conventionne` |
| À propos | `/a-propos` |
| Contact, formulaire et questions fréquentes | `/contact` |
| Réservation en 3 étapes, avec ou sans compte | `/reserver` |
| Espace client : aperçu, trajets, factures, assistant, profil | `/compte` |
| Facture imprimable / PDF | `/facture?id=…` |
| Espace chauffeur (privé) | `/chauffeur` |
| Mentions légales et confidentialité | `/mentions-legales` |

**Fonctionnement d'une réservation**

1. Le client fait sa demande en ligne (sans compte, ou avec compte : ses coordonnées et adresses sont pré-remplies). Aucune estimation de prix, aucun paiement en ligne.
2. Salim reçoit une notification sur son téléphone et voit la demande dans `/chauffeur`. Il rappelle le client, puis clique sur **Confirmer** (il peut ajuster l'heure et laisser une note).
3. Après la course, il clique sur **Terminer · facture** et saisit le montant du compteur. La facture (numérotée F2026-0001, F2026-0002…) apparaît dans l'espace du client et lui est envoyée par e-mail.
4. Une course prise par téléphone peut aussi être saisie dans `/chauffeur` et rattachée au compte du client.

**Fidélité** : chaque course terminée (hors transport conventionné) compte. Au bout de `LOYALTY_STEP` courses, l'avantage `LOYALTY_REWARD` est disponible ; Salim le coche au moment de la facture.

**Assistant** : il analyse les trajets du client (lieux fréquents, trajets réguliers par jour et heure, aller-retour, dépenses, fidélité) et propose de réserver le prochain trajet habituel en un geste. Sans clé API, il fonctionne avec l'analyse intégrée ; avec une clé Claude, il répond en langage naturel à n'importe quelle question du client sur ses déplacements.

## Lancer le site sur un ordinateur

Il faut Node.js 20 ou plus récent.

```bash
cd taxi-saint-irenee
npm install
cp .env.example .env      # puis remplir au moins DRIVER_PASSWORD
npm start                 # → http://localhost:3000
```

### Essayer avec des données de démonstration

```bash
DATA_FILE=demo.json npm run seed:demo
DATA_FILE=demo.json npm start
```

Espace client : `claire.martin@exemple.fr` / `demo-taxi-2026` (une patiente qui va en radiothérapie chaque mardi, avec des trajets aéroport et gare).
Les vraies données (`data/db.json`) ne sont pas touchées.

## Mise en ligne

Le site est une application Node.js sans base de données à installer : tout est enregistré dans `data/db.json`. N'importe quel hébergeur Node convient (Render, Railway, Fly.io, un VPS, ou l'outil « Setup Node.js App » de cPanel / o2switch).

- Commande de démarrage : `npm start`
- Le dossier `data/` doit être **persistant** (disque permanent) et **sauvegardé** régulièrement : il contient les comptes, réservations et factures.
- Définir les variables de `.env.example` dans l'interface de l'hébergeur, notamment `SITE_URL`, `SECURE_COOKIES=1` et `DRIVER_PASSWORD`.

## À configurer

| Variable | Rôle |
|---|---|
| `DRIVER_PASSWORD` | Accès à `/chauffeur`. Obligatoire. |
| `NTFY_URL` | Notification instantanée des nouvelles demandes sur le téléphone de Salim : installer l'application gratuite **ntfy**, s'abonner au même sujet que dans l'URL. |
| `RESEND_API_KEY`, `MAIL_FROM`, `DRIVER_EMAIL` | E-mails : demande reçue, course confirmée, facture, mot de passe oublié (compte gratuit sur resend.com, avec le nom de domaine du site). |
| `ANTHROPIC_API_KEY` | Assistant rédigé par Claude. Facultatif. Modèle réglable avec `ASSISTANT_MODEL`. |
| `COMPANY_*` | Mentions légales et pied des factures : adresse, SIRET, TVA, numéro ADS, numéro de conventionnement CPAM. |
| `VAT_RATE` | TVA transport de voyageurs, 10 % par défaut ; `0` si franchise en base (la mention art. 293 B s'affiche alors). |
| `LOYALTY_STEP`, `LOYALTY_REWARD` | Règle de fidélité. |

**À compléter avant la mise en ligne** : les champs `[à compléter]` de `/mentions-legales` (via les variables `COMPANY_*`) et le nom de l'hébergeur dans `views/mentions-legales.html`. Relire aussi les textes des pages : ils décrivent le service tel que présenté dans la charte, à ajuster si un détail ne correspond pas.

## Organisation du code

```
server/        serveur HTTP, API, comptes, analyse des habitudes, assistant, notifications
views/         pages (contenu) + partials/ (en-tête, pied de page, gabarit)
public/        styles, scripts, logos, icônes
data/          base de données JSON (créée au premier lancement)
```

Pour modifier un texte, éditer le fichier de `views/` correspondant. L'en-tête et le pied de page sont communs à toutes les pages (`views/partials/`).

## Sécurité et données

- Mots de passe chiffrés (scrypt), session par cookie `HttpOnly`, protection contre les requêtes d'autres sites, limites de tentatives sur la connexion et les formulaires.
- Politique de sécurité du contenu stricte : aucun script externe, seule la police Jost vient de Google Fonts.
- Autocomplétion des adresses par la Base Adresse Nationale (service public, sans clé).
- Le client peut supprimer son compte ; ses factures sont conservées dix ans, comme l'exige la loi.
