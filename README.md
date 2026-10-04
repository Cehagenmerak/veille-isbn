# veille-isbn
Petite appli de lecture d'ISBN sur le terrain pour veille bibliographique.

Application web installable (PWA), sans serveur ni compte : les données restent sur le téléphone.

## Fonctions
- **Scan** : un livre, « au kilomètre » (caméra ouverte, compteur, doublons signalés, annuler le dernier) ou « en pile » (tous les codes visibles d'un coup).
- **Fiche** : Titre, Auteur, Public, Cote, Motif d'office ; Éditeur, Prix indicatif, Commentaire en favoris ; photo de couverture réduite à 800 px.
- **Priorité** : balayer une ligne vers la droite (monte) ou la gauche (baisse) : À voir, Intéressant, Indispensable.
- **BnF** : complète les champs vides (SRU du Catalogue général) et récupère la couverture, livre par livre ou en lot.
- **Fonds PMB** : signale les livres déjà possédés, au scan et/ou avant l'envoi (adresse du connecteur dans Réglages).
- **Envoi** : tableau HTML partagé vers la messagerie, ou texte simple ; les livres envoyés sont masqués mais toujours reconnus au scan.

## Configuration
Tout se règle dans `config.js` : champs, cotes, motifs, taille des photos, adresse BnF (ou d'un relais), méthode PMB.
Le destinataire du mail et l'adresse PMB se saisissent dans l'application.

Après chaque modification des fichiers, changer `VERSION` dans `sw.js` pour forcer la mise à jour sur le téléphone.

## Licences
ZXing (`vendor/`) : Apache 2.0. Polices Atkinson Hyperlegible (`vendor/fonts/`) : SIL OFL 1.1.
