# FilsZone : démo en ligne

Version de démonstration de la plateforme de vente de tickets Wi-Fi FilsZone. Elle reprend **le même front** que le projet complet (pages admin et client, styles, couleurs, logos), mais **sans PHP, sans MySQL et sans serveur d'API** : tout se passe dans le navigateur du visiteur.

- Les données (forfaits, tickets, connexions) sont **fictives** et gardées dans le `localStorage` du navigateur.
- Chaque visiteur a donc **sa propre démo** : plusieurs personnes peuvent l'essayer en même temps sans se gêner, et rien n'est enregistré sur l'hébergement.
- Un bandeau en haut des pages permet de **réinitialiser** la démo (retour aux données de départ).

## Comment ça marche

Dans le projet complet, le front appelle l'API PHP avec `get()`, `post()`, `patch()` et `del()` (fichier `js/api.js`). Ici, **seul ce fichier change** : il traite chaque appel dans le navigateur, avec les mêmes routes, les mêmes règles métier et les mêmes messages d'erreur que l'API PHP. Le reste du front est identique.

| Fichier | Rôle |
|---|---|
| `js/api.js` | Remplace l'API PHP : routes `/admin/…`, `/login`, `/me`, `/usage`… et règles métier (expiration, volume, un seul appareil par ticket…) |
| `js/demo-db.js` | « Base de données » : même structure que les tables MySQL, stockée dans le `localStorage`. Crée les données de départ : les 8 forfaits et une semaine d'activité fictive |
| `js/demo-banner.js` | Bandeau « Démo » : bouton pour passer de l'espace admin à l'espace client (et inversement), bouton Réinitialiser. Pré-remplit les connexions : le compte admin, et côté client le ticket utilisable le plus récent |
| `index.html` | Page d'accueil de la démo |

**Compte admin de démo :** identifiant `demo`, mot de passe `demo` (affiché et pré-rempli sur la page de connexion).

**Ticket client pré-rempli :** le ticket le plus récent encore utilisable (neuf, ou actif avec du temps et du volume). Juste après une génération dans l'espace admin, c'est donc un ticket du dernier lot.

**Limite connue :** la règle « un seul appareil par ticket » ne peut pas être testée, car dans la démo un navigateur correspond à un seul appareil. Une fenêtre de navigation privée a son propre `localStorage`, donc sa propre démo, sans les tickets de la fenêtre normale.

## Lancer en local

Les pages utilisent des modules JavaScript : elles doivent être ouvertes **via un serveur web**, pas en double-cliquant sur le fichier (`file://`). Avec XAMPP : http://localhost/filszone-demo/

## Mettre en ligne sur alwaysdata

C'est un site **statique** : il suffit de copier les fichiers.

1. Créer un compte alwaysdata (offre gratuite).
2. Envoyer les fichiers dans `~/www/filszone-demo/` :
   - **par git** (en SSH : *Accès distant > SSH*, activer la connexion par mot de passe) :
     ```bash
     ssh COMPTE@ssh-COMPTE.alwaysdata.net
     git clone URL_DU_DEPOT ~/www/filszone-demo
     ```
   - ou **par FTP/SFTP** (FileZilla), avec les identifiants de *Accès distant > FTP*.
3. *Web > Sites* : modifier le site, type **Fichiers statiques**, répertoire racine `/www/filszone-demo/`.
4. Ouvrir `https://COMPTE.alwaysdata.net/`.

Pour mettre à jour : `git pull` dans le dossier (en SSH), ou renvoyer les fichiers modifiés par FTP.

Aucune base de données ni tâche planifiée n'est nécessaire.
