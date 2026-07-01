# Maquette V2 — Carré Cotons (page d'accueil)

Ébauche statique et responsive de la page d'accueil « nouvelle génération », générée à partir du prompt `../prompt-refonte-carre-cotons.md` et de la charte réelle de la marque.

## Ouvrir
Double-cliquer sur `index.html` (aucune installation, aucune dépendance). Fonctionne hors-ligne.

## Ce qui est implémenté
- **Charte réelle** : teal `#00646C`, vert sauge `#78A5A3`, fond crème `#F9F9F9`, accent magenta `#C8036F`.
- **Typo éditoriale 2026** : titres en serif *Fraunces* (via Google Fonts, repli Georgia), texte en *Work Sans* (police d'origine).
- **Layout éditorial** : hero full-bleed, grille catégories asymétrique, best-sellers avec notes ⭐, section marque, avis 4,9/5, newsletter, footer complet.
- **Bonnes pratiques de l'audit** : un seul H1, hiérarchie Hn propre, `loading="lazy"` sur les images hors premier écran, noms de produits en texte normal (zéro caractère Unicode stylisé), pas d'emoji dans les titres, contrastes AA, cibles tactiles ≥ 44px, micro-interactions désactivées si `prefers-reduced-motion`.
- **Accessibilité** : le contenu reste entièrement visible sans JavaScript (l'animation de scroll est une amélioration progressive).

## Images
Les visuels dans `assets/` sont de vraies photos produit du site actuel, incluses pour rendre la maquette réaliste. À remplacer par les fichiers sources haute définition (et à servir en WebP/AVIF) en production.

## Note
C'est une **maquette de démonstration** (front statique), pas un thème Shopify prêt à installer. Elle sert de base de discussion visuelle pour la refonte.
