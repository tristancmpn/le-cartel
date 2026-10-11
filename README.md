# Le Cartel

App de rangement de la coloc : https://tristancmpn.github.io/le-cartel/

- **Quotidien** : chacun note les petites tâches qu'il a faites (« Fait »).
- **Semaine** : grosses tâches de la semaine, on se nomine, on valide, on peut reprendre la tâche d'un autre.
- **Stats** : qui a fait quoi, par jour, semaine, semaine passée, mois, année ou depuis le début.
- **Rappels** : notifications iPhone, réglables par chacun.

## Comment ça marche

| Élément | Où | Rôle |
|---|---|---|
| `index.html`, `app.js`, `app.css` | GitHub Pages | L'app (PWA, sans étape de build) |
| `supabase/schema.sql` | Supabase (gratuit) | Base de données partagée |
| `notifier/` + `.github/workflows/notify.yml` | GitHub Actions | Envoie les rappels toutes les 15 min |
| `config.js` | — | URL et clé publique Supabase, clé publique des notifications |

Il n'y a pas de comptes : toute personne qui a le lien peut utiliser l'app. Chaque téléphone retient qui l'utilise.

## Mise en route (une seule fois)

1. Créer un projet gratuit sur [supabase.com](https://supabase.com) (région Europe, par ex. Zurich ou Francfort).
2. Dans Supabase, **SQL Editor › New query** : coller le contenu de `supabase/schema.sql` et cliquer **Run**.
3. Dans **Project Settings › API**, copier l'**URL du projet** et la clé **anon public**, et les mettre dans `config.js`.
4. Pousser sur `main` : le site se met à jour tout seul en une minute.

## Installer sur iPhone

Ouvrir le lien dans **Safari**, bouton **Partager › Sur l'écran d'accueil**. Ouvrir l'app depuis l'icône, choisir son prénom, puis **Réglages › Notifications › Activer**.

## Développement

- `tools/dev.html` : l'app avec une fausse base en mémoire (`python -m http.server` puis http://localhost:8000/tools/dev.html).
- `cd notifier && npm test` : tests des règles de rappel.
- `python tools/make_icons.py` : régénère les icônes.
- La clé privée des notifications est dans les secrets GitHub (`VAPID_PRIVATE_KEY`). Si elle est perdue, générer une nouvelle paire avec `npx web-push generate-vapid-keys`, mettre la publique dans `config.js` ; chacun devra réactiver les notifications.
- La maquette d'origine est dans `preview/`.
