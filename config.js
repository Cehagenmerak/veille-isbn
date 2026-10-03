// Configuration de l'application. C'est ici qu'on ajoute des champs :
// le formulaire, la liste, le CSV et le mail se construisent à partir de ce fichier.
// Le destinataire du mail n'est volontairement pas ici (dépôt public) :
// il se saisit dans l'application et reste sur le téléphone.

const CONFIG = {
  objetMail: "Veille acquisitions",

  // Champs de saisie (l'ISBN et la date sont gérés à part).
  //   type : "text" (défaut) ou "select"
  //   options : liste des choix pour un "select"
  //
  // Exemple de menu déroulant à ajouter plus tard :
  //   { id: "type", label: "Type de document", type: "select",
  //     options: ["R", "RSF", "RX", "ER", "EBD"] },
  champs: [
    { id: "titre", label: "Titre" },
    { id: "auteur", label: "Auteur" },
    { id: "illustrateur", label: "Illustrateur" },
    { id: "editeur", label: "Maison d'édition" },
  ],
};
