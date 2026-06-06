# LINKS WIRELESS — Gestion Coupons WiFi

Application web de gestion des coupons WiFi générés par MikroTik User Manager.
Importez vos PDF de coupons, suivez les ventes par profil, et exportez les restants.

---

## Fonctionnalités

- **Import PDF** — glisser-déposer ou sélection du fichier export User Manager
- **Affichage scindé par profil** — onglets Forfait 100, Forfait 200, SEMAINE, etc.
- **Statistiques en temps réel** — total, restants, vendus, montant restant
- **Barre de progression** des ventes
- **Modal de vente** — cliquer une carte ouvre un détail avec bouton "Marquer comme vendu"
- **Copier le code** — en un clic depuis le modal
- **Recherche** avec debounce, filtres (Tous / Restants / Vendus), tri
- **Export TSV** des coupons restants (par profil si filtré)
- **Multi-import** — importer plusieurs PDF successivement sans doublons
- **Raccourci mobile** via PWA manifest (Chrome Android)

---

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | Python 3.11 + Flask |
| Base de données | SQLite (fichier `/data/coupons.db`) |
| PDF parsing | pypdf |
| Frontend | HTML / CSS / JS vanilla |
| Déploiement | Docker + Coolify |

---

## Installation locale

**Prérequis :** Python 3.11+

```bash
cd coupon_manager
pip install -r requirements.txt
mkdir -p data
python app.py
```

Ouvrir `http://localhost:5076`

---

## Déploiement Docker

```bash
docker-compose up --build
```

L'app tourne sur le port **5076**. La base de données est persistée dans le volume Docker `coupon_data`.

---

## Déploiement Coolify

1. Pousser ce dossier dans un repo Git
2. Dans Coolify → Nouveau service → **Docker Compose**
3. Pointer vers le repo, branche `main`
4. Coolify détecte le `docker-compose.yml` et déploie automatiquement
5. Le volume `coupon_data` persiste la DB entre les redémarrages

---

## Structure des fichiers

```
coupon_manager/
├── app.py              # Flask + routes API REST
├── database.py         # SQLite init, CRUD, parser PDF
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── static/
    ├── index.html      # Interface utilisateur
    ├── style.css       # Thème light
    ├── app.js          # Logique frontend
    └── manifest.json   # PWA — raccourci home screen
```

---

## API Reference

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/` | Interface web |
| `POST` | `/api/import` | Upload PDF → parse → insert coupons |
| `GET` | `/api/coupons` | Liste filtrée `?forfait=&vendu=&q=` |
| `GET` | `/api/stats` | Statistiques globales + par profil |
| `PATCH` | `/api/coupons/<id>` | Toggle vendu `{"vendu": true}` |
| `DELETE` | `/api/coupons` | Supprimer tous les coupons |
| `GET` | `/api/export` | Télécharger TSV des restants |

---

## Raccourci mobile (PWA)

Sur **Android Chrome** (connexion HTTPS requise) :
1. Ouvrir l'app dans Chrome
2. Menu → **Ajouter à l'écran d'accueil**
3. L'icône s'installe comme une app native (affichage plein écran)

Sur **iOS Safari** :
1. Ouvrir l'app
2. Bouton Partager → **Sur l'écran d'accueil**

> Aucun Service Worker requis — le manifest seul suffit pour le raccourci.

---

## Format PDF supporté

PDF généré par MikroTik User Manager avec la structure de coupon :

```
LINKS WIRELESS
FORFAIT 200
Temps  Validite  Prix
1d     2d        200.00 Fcfa
Username  Password
q5qi      q5qi
```

Les profils (100, 200, SEMAINE, Fêtes…), prix et durées sont extraits automatiquement.
