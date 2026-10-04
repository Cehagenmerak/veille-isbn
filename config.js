// Configuration de l'application. C'est ici qu'on ajoute ou modifie des champs :
// la fiche, la liste, le CSV et le mail se construisent à partir de ce fichier.
// Le destinataire du mail et l'adresse PMB ne sont volontairement pas ici (dépôt public) :
// ils se saisissent dans Réglages et restent sur le téléphone.

const CONFIG = {
  objetMail: "Veille acquisitions",

  // Champs de la fiche (l'ISBN, la date et la priorité sont gérés à part).
  //   type : "text" (défaut) ou "select"
  //   toujours : affiché sur chaque fiche, sans étoile possible
  //   options : liste des choix d'un "select" (la cote utilise la liste `cotes` ci-dessous)
  champs: [
    { id: "titre", label: "Titre", toujours: true, placeholder: "Titre du livre" },
    { id: "auteur", label: "Auteur", toujours: true, placeholder: "Nom de l'auteur" },
    { id: "public", label: "Public", type: "select", toujours: true, options: ["Adulte", "Enfant", "Ado", "Bébé"] },
    { id: "cote", label: "Cote", type: "select", toujours: true },
    {
      id: "motif", label: "Motif", type: "select", toujours: true,
      options: [
        "Complément de série", "Demande usager", "Rentrée littéraire", "Classique ou incontournable",
        "Auteur suivi", "Rachat ou remplacement", "Sélection prix littéraire", "Thématique", "Coup de coeur",
      ],
    },
    { id: "editeur", label: "Éditeur", placeholder: "Maison d'édition" },
    { id: "prix", label: "Prix indicatif", placeholder: "ex. 22,50 €" },
    { id: "commentaire", label: "Commentaire", placeholder: "Pour l'acquéreur" },
    { id: "illustrateur", label: "Illustrateur" },
  ],

  // Champs non obligatoires affichés d'office (modifiable ensuite dans Réglages, étoile).
  favorisParDefaut: ["editeur", "prix", "commentaire"],

  // Cotes PMB : [cote, libellé, public]. Public null = « à déterminer » (pas de filtre).
  cotes: [
    ["R", "Roman adulte", "Adulte"],
    ["RX", "Roman policier adulte", "Adulte"],
    ["RSF", "Roman science-fiction adulte", "Adulte"],
    ["ABD", "Bande dessinée adulte", "Adulte"],
    ["DOC", "Documentaire adulte", "Adulte"],
    ["GC", "Gros caractères", "Adulte"],
    ["EBD", "Bande dessinée enfant", "Enfant"],
    ["ER", "Roman enfant", "Enfant"],
    ["JR", "Roman ado", "Ado"],
    ["JRX", "Roman policier ado", "Ado"],
    ["JRSF", "Roman science-fiction ado", "Ado"],
    ["JBD", "Bande dessinée ado", "Ado"],
    ["MAN", "Manga", null],
    ["ERX", "Roman policier enfant", "Enfant"],
    ["ERSF", "Roman science-fiction enfant", "Enfant"],
    ["TER", "Terroir", "Adulte"],
    ["EA", "Album enfant", "Enfant"],
    ["PL", "Première lecture", "Enfant"],
    ["EDOC", "Documentaire enfant", "Enfant"],
    ["EABB", "Album bébé", "Bébé"],
    ["ADET", "À déterminer", null],
  ],

  // Photo de couverture : réduite avant l'envoi (côté le plus long, en pixels ; qualité JPEG).
  photo: { taille: 800, qualite: 0.72 },

  // BnF. Si le navigateur bloque l'appel direct (CORS), remplacer `base` par l'adresse
  // d'un petit relais (ex. Cloudflare Worker) qui transmet les chemins /api/SRU et /couverture.
  bnf: {
    base: "https://catalogue.bnf.fr",
    couvertures: true,
  },

  // PMB : connecteur sortant JSON-RPC. Méthode et type de recherche à confirmer
  // avec l'administrateur PMB (0 = tous les champs).
  pmb: {
    methode: "pmbesOPACAnonymous_simpleSearch",
    typeRecherche: 0,
  },

  // Mode « au kilomètre » : délai minimal entre deux lectures (ms).
  pauseKilometre: 1500,
};
