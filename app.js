"use strict";

const CLE_STOCKAGE = "veille-isbn:livres";
const $ = (id) => document.getElementById(id);

// ---------- Stockage local ----------

function charger() {
  try {
    return JSON.parse(localStorage.getItem(CLE_STOCKAGE)) || [];
  } catch {
    return [];
  }
}

let livres = charger();

function sauver() {
  localStorage.setItem(CLE_STOCKAGE, JSON.stringify(livres));
}

// Demande au navigateur de ne pas effacer les données automatiquement.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

// ---------- Destinataire (saisi dans l'appli, stocké sur le téléphone) ----------

const CLE_DEST = "veille-isbn:destinataire";

function demanderDestinataire() {
  const actuel = localStorage.getItem(CLE_DEST) || "";
  const saisie = prompt("Adresse e-mail qui recevra la liste :", actuel);
  if (saisie === null) return actuel;
  const adresse = saisie.trim();
  if (adresse && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) {
    toast("Adresse invalide.");
    return actuel;
  }
  localStorage.setItem(CLE_DEST, adresse);
  return adresse;
}

$("btn-reglages").addEventListener("click", () => {
  if (demanderDestinataire()) toast("Destinataire enregistré");
});

// ---------- ISBN ----------

// Ne garde que les chiffres et valide un EAN-13 commençant par 978/979.
function isbnValide(s) {
  if (!/^97[89]\d{10}$/.test(s)) return false;
  let somme = 0;
  for (let i = 0; i < 12; i++) somme += +s[i] * (i % 2 ? 3 : 1);
  return (10 - (somme % 10)) % 10 === +s[12];
}

function formaterIsbn(s) {
  return s.length === 13 ? `${s.slice(0, 3)}-${s.slice(3)}` : s;
}

// ---------- Affichage de la liste ----------

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3000);
}

function afficher() {
  const ul = $("liste");
  ul.replaceChildren();
  // Les plus récents en premier.
  for (const l of [...livres].reverse()) {
    const li = document.createElement("li");
    if (l.envoye) li.className = "envoye";
    const t = document.createElement("div");
    t.className = "t";
    t.textContent = l.titre || (l.isbn ? formaterIsbn(l.isbn) : "(sans titre)");
    const m = document.createElement("div");
    m.className = "m";
    const details = [l.titre && l.isbn ? formaterIsbn(l.isbn) : "", l.auteur, l.editeur].filter(Boolean);
    if (l.envoye) details.push("envoyé");
    m.textContent = details.join(" · ");
    li.append(t, m);
    li.addEventListener("click", () => ouvrirFormulaire(l));
    ul.append(li);
  }
  const aEnvoyer = livres.filter((l) => !l.envoye).length;
  $("vide").hidden = livres.length > 0;
  $("compteur").textContent = livres.length ? `${aEnvoyer} à envoyer / ${livres.length}` : "";
  $("btn-envoyer").textContent = aEnvoyer ? `✉️ Envoyer (${aEnvoyer})` : "✉️ Envoyer la liste";
}

// ---------- Formulaire ----------

let enEdition = null; // livre modifié, ou null pour un ajout

function construireChamps() {
  const zone = $("champs");
  for (const c of CONFIG.champs) {
    const label = document.createElement("label");
    label.textContent = c.label;
    let el;
    if (c.type === "select") {
      el = document.createElement("select");
      el.append(new Option("—", ""));
      for (const o of c.options) el.append(new Option(o, o));
    } else {
      el = document.createElement("input");
      el.autocomplete = "off";
    }
    el.id = "f-" + c.id;
    label.append(el);
    zone.append(label);
  }
}

function ouvrirFormulaire(livre, isbnInitial = "") {
  enEdition = livre || null;
  $("dlg-titre").textContent = livre ? "Modifier" : "Nouveau livre";
  $("f-isbn").value = livre ? livre.isbn : isbnInitial;
  for (const c of CONFIG.champs) $("f-" + c.id).value = livre ? livre[c.id] || "" : "";
  $("btn-suppr").hidden = !livre;
  $("dlg-erreur").hidden = true;
  $("dlg").showModal();
}

function erreurFormulaire(msg) {
  const e = $("dlg-erreur");
  e.textContent = msg;
  e.hidden = false;
}

$("form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const isbn = $("f-isbn").value.replace(/[\s-]/g, "");
  const valeurs = {};
  for (const c of CONFIG.champs) valeurs[c.id] = $("f-" + c.id).value.trim();

  if (isbn && !isbnValide(isbn)) return erreurFormulaire("ISBN invalide (13 chiffres commençant par 978 ou 979).");
  if (!isbn && !valeurs.titre) return erreurFormulaire("Saisissez un ISBN ou au moins un titre.");
  if (isbn && livres.some((l) => l.isbn === isbn && l !== enEdition)) return erreurFormulaire("Cet ISBN est déjà dans la liste.");

  if (enEdition) {
    Object.assign(enEdition, valeurs, { isbn });
  } else {
    livres.push({ id: Date.now().toString(36), date: new Date().toISOString(), envoye: false, isbn, ...valeurs });
  }
  sauver();
  afficher();
  $("dlg").close();
  toast("Enregistré");
});

$("btn-annuler").addEventListener("click", () => $("dlg").close());
$("btn-suppr").addEventListener("click", () => {
  if (!enEdition || !confirm("Supprimer ce livre de la liste ?")) return;
  livres = livres.filter((l) => l !== enEdition);
  sauver();
  afficher();
  $("dlg").close();
});

// ---------- Scanner ----------


function bip() {
  if (navigator.vibrate) navigator.vibrate(80);
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = 1000;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {}
}

const MSG_SCAN = "Cadrez le code-barres du livre";
const MSG_CONSEILS =
  "Pas de lecture : reculez à 15-20 cm, évitez les reflets, éclairez (🔦) ou utilisez « 📸 Photo ».";
let minuterieConseils = null;
let derniereAlerte = 0;
let torcheAllumee = false;

function piste() {
  const flux = $("video").srcObject;
  return flux && flux.getVideoTracks()[0];
}

// Réglages caméra facultatifs : torche et zoom, si le téléphone les propose.
function preparerReglagesCamera() {
  const t = piste();
  const caps = t && t.getCapabilities ? t.getCapabilities() : {};
  $("btn-torche").hidden = !caps.torch;
  const zoom = $("zoom");
  zoom.hidden = !caps.zoom;
  if (caps.zoom) {
    zoom.min = caps.zoom.min;
    zoom.max = caps.zoom.max;
    zoom.step = caps.zoom.step || 0.1;
    zoom.value = caps.zoom.min;
  }
}

$("btn-torche").addEventListener("click", () => {
  const t = piste();
  if (!t) return;
  torcheAllumee = !torcheAllumee;
  const allume = torcheAllumee;
  t.applyConstraints({ advanced: [{ torch: allume }] }).catch(() => {});
});

$("zoom").addEventListener("input", (e) => {
  const t = piste();
  if (t) t.applyConstraints({ advanced: [{ zoom: +e.target.value }] }).catch(() => {});
});

function resultatLu(isbn) {
  if (!isbnValide(isbn)) {
    // Code lu mais qui n'est pas un ISBN : on le dit (utile pour comprendre), sans bloquer.
    const maintenant = Date.now();
    if (maintenant - derniereAlerte > 2000) {
      derniereAlerte = maintenant;
      $("scan-msg").textContent = `Code lu (${isbn}) mais ce n'est pas un ISBN (978/979).`;
    }
    return false;
  }
  bip();
  const existant = livres.find((l) => l.isbn === isbn);
  if (existant) {
    toast("Déjà dans la liste");
    ouvrirFormulaire(existant);
  } else {
    ouvrirFormulaire(null, isbn);
  }
  return true;
}

// Lecture d'une image (canvas). On n'utilise pas la boucle vidéo de la bibliothèque :
// elle n'arrêtait pas la caméra et alternait des images inversées inutiles.
const lecteurEan = new ZXing.MultiFormatReader();
const indicesLecture = new Map([
  [ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13]],
  [ZXing.DecodeHintType.TRY_HARDER, true],
]);

function lireCanvas(canvas) {
  try {
    const source = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
    return lecteurEan.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source)), indicesLecture).getText();
  } catch {
    return null;
  }
}

let flux = null;
let boucle = null;

async function demarrerScan() {
  $("scanner").hidden = false;
  $("scan-msg").textContent = MSG_SCAN;
  clearTimeout(minuterieConseils);
  minuterieConseils = setTimeout(() => ($("scan-msg").textContent = MSG_CONSEILS), 10000);
  try {
    flux = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: "continuous" }],
      },
    });
    const video = $("video");
    video.srcObject = flux;
    await video.play();
    preparerReglagesCamera();
  } catch (e) {
    arreterScan();
    const refuse = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
    toast(refuse ? "Accès à la caméra refusé : vérifiez l'autorisation du site." : "Caméra indisponible : essayez « Photo ».");
    return;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let passe = 0;
  const essai = () => {
    if (!flux) return;
    const v = $("video");
    if (v.videoWidth) {
      let texte;
      if (passe++ % 2 === 0) {
        // Image entière, réduite pour aller vite.
        const k = Math.min(1, 1280 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * k);
        canvas.height = Math.round(v.videoHeight * k);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      } else {
        // Zone centrale (celle du viseur) en pleine résolution : plus de détail pour un code éloigné.
        const w = Math.round(v.videoWidth * 0.7);
        const h = Math.round(v.videoHeight * 0.5);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(v, (v.videoWidth - w) / 2, (v.videoHeight - h) / 2, w, h, 0, 0, w, h);
      }
      texte = lireCanvas(canvas);
      if (texte) {
        if (isbnValide(texte)) {
          arreterScan();
          resultatLu(texte);
          return;
        }
        resultatLu(texte); // affiche « pas un ISBN »
      }
    }
    boucle = setTimeout(essai, 60);
  };
  essai();
}

function arreterScan() {
  clearTimeout(minuterieConseils);
  clearTimeout(boucle);
  if (flux) flux.getTracks().forEach((t) => t.stop());
  flux = null;
  $("video").srcObject = null;
  torcheAllumee = false;
  $("scanner").hidden = true;
}

// Plan B : photo prise avec l'application appareil photo du téléphone (vraie mise au point),
// puis lecture du code sur l'image.
async function lirePhoto(fichier) {
  const bmp = await createImageBitmap(fichier);
  // Essais à plusieurs tailles : la lecture est parfois meilleure en réduisant l'image.
  for (const largeurMax of [2000, 1280, 800]) {
    const k = Math.min(1, largeurMax / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d", { willReadFrequently: true }).drawImage(bmp, 0, 0, c.width, c.height);
    const texte = lireCanvas(c);
    if (texte) return texte;
  }
  return null;
}

$("btn-photo").addEventListener("click", () => $("fichier-photo").click());
$("fichier-photo").addEventListener("change", async (e) => {
  const fichier = e.target.files[0];
  e.target.value = "";
  if (!fichier) return;
  $("scan-msg").textContent = "Lecture de la photo…";
  const isbn = await lirePhoto(fichier);
  if (isbn && isbnValide(isbn)) {
    arreterScan();
    resultatLu(isbn);
  } else {
    $("scan-msg").textContent = isbn
      ? `Code lu (${isbn}) mais ce n'est pas un ISBN (978/979).`
      : "Aucun code lu sur la photo : rapprochez-vous, code bien net et à plat.";
  }
});

$("btn-scan").addEventListener("click", demarrerScan);
$("btn-scan-annuler").addEventListener("click", arreterScan);
$("btn-isbn-clavier").addEventListener("click", () => {
  arreterScan();
  ouvrirFormulaire(null);
});
$("btn-manuel").addEventListener("click", () => ouvrirFormulaire(null));

// ---------- Export / envoi ----------

function ligneTexte(l) {
  const parts = [l.isbn ? formaterIsbn(l.isbn) : "(sans ISBN)"];
  for (const c of CONFIG.champs) if (l[c.id]) parts.push(`${c.label} : ${l[c.id]}`);
  return "- " + parts.join(" | ");
}

function envoyer() {
  const aEnvoyer = livres.filter((l) => !l.envoye);
  if (!aEnvoyer.length) return toast("Rien de nouveau à envoyer.");
  const destinataire = localStorage.getItem(CLE_DEST) || demanderDestinataire();
  if (!destinataire) return;
  const corps = aEnvoyer.map(ligneTexte).join("\n");
  const url =
    `mailto:${destinataire}` +
    `?subject=${encodeURIComponent(CONFIG.objetMail + " (" + aEnvoyer.length + ")")}` +
    `&body=${encodeURIComponent(corps + "\n")}`;
  if (url.length > 6000 && !confirm("La liste est longue : le mail risque d'être tronqué. Continuer ? (sinon, utilisez « Exporter CSV »)")) return;
  window.location.href = url;
  // Le navigateur ne sait pas si le mail est réellement parti : on demande.
  setTimeout(() => {
    if (confirm(`Avez-vous bien envoyé le mail ?\nOK : marquer ces ${aEnvoyer.length} livre(s) comme envoyés.`)) {
      for (const l of aEnvoyer) l.envoye = true;
      sauver();
      afficher();
    }
  }, 1500);
}

function csvCellule(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

async function exporterCsv() {
  if (!livres.length) return toast("Liste vide.");
  const entetes = ["isbn", ...CONFIG.champs.map((c) => c.id), "date", "envoye"];
  const lignes = [entetes.join(";")];
  for (const l of livres) {
    lignes.push([l.isbn, ...CONFIG.champs.map((c) => l[c.id]), l.date, l.envoye ? "oui" : "non"].map(csvCellule).join(";"));
  }
  // BOM pour qu'Excel/LibreOffice reconnaissent l'UTF-8.
  const fichier = new File(["﻿" + lignes.join("\r\n")], `veille-isbn-${new Date().toISOString().slice(0, 10)}.csv`, { type: "text/csv" });
  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: "Veille ISBN" });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(fichier);
  a.download = fichier.name;
  a.click();
  URL.revokeObjectURL(a.href);
}

$("btn-envoyer").addEventListener("click", envoyer);
$("btn-csv").addEventListener("click", exporterCsv);

// ---------- Démarrage ----------

construireChamps();
afficher();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
