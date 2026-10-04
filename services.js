"use strict";
// Services sans interface : stockage, ISBN, BnF, PMB, photos, mail.

// ---------- Outils ----------

const MIN = 60000;
const PRIO = { 1: "À voir", 2: "Intéressant", 3: "Indispensable" };

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
const pl = (n) => (n > 1 ? "s" : "");
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

function isbnValide(s) {
  if (!/^97[89]\d{10}$/.test(s)) return false;
  let somme = 0;
  for (let i = 0; i < 12; i++) somme += +s[i] * (i % 2 ? 3 : 1);
  return (10 - (somme % 10)) % 10 === +s[12];
}

function formaterIsbn(s) {
  return s && s.length === 13 ? `${s.slice(0, 3)}-${s.slice(3, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12)}` : s || "";
}

function formaterPoids(n) {
  return n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(n / 1024)) + " Ko";
}

function formaterDate(ts) {
  const d = new Date(ts), n = new Date();
  const hm = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === n.toDateString()) return "auj. " + hm;
  const hier = new Date(n);
  hier.setDate(n.getDate() - 1);
  if (d.toDateString() === hier.toDateString()) return "hier " + hm;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function libelleJour(ts) {
  const d = new Date(ts), n = new Date();
  if (d.toDateString() === n.toDateString()) return "Aujourd'hui";
  const hier = new Date(n);
  hier.setDate(n.getDate() - 1);
  if (d.toDateString() === hier.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

const CHAMPS = CONFIG.champs.map((c) => ({ type: "text", ...c }));
const COTES = CONFIG.cotes.map(([v, l, pub]) => ({ v, l, pub }));
const PUBLICS = (CHAMPS.find((c) => c.id === "public") || { options: [] }).options;

// ---------- Stockage local ----------

const CLE_LIVRES = "veille-isbn:livres2";
const CLE_ANCIENS = "veille-isbn:livres"; // format de la première version, gardé en sauvegarde
const CLE_REGLAGES = "veille-isbn:reglages";

function nouveauLivre(isbn, extra) {
  return Object.assign(
    {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      isbn, ts: Date.now(), sent: false, sentAt: null,
      bnf: isbn ? "none" : "na", bnfData: null, cover: null,
      fields: {}, src: {}, extra: [], dismissed: {},
      prio: 2, fonds: null, fondsInfo: null, photo: null,
    },
    extra || {}
  );
}

// Reprend les livres de la première version (titre, auteur, illustrateur, editeur à plat).
function convertirAnciens(anciens) {
  return anciens.map((a) => {
    const l = nouveauLivre(a.isbn || "", { id: a.id, ts: Date.parse(a.date) || Date.now(), sent: !!a.envoye });
    for (const k of ["titre", "auteur", "illustrateur", "editeur"]) {
      if (a[k]) {
        l.fields[k] = a[k];
        l.src[k] = "user";
        if (!CHAMPS.find((c) => c.id === k)?.toujours) l.extra.push(k);
      }
    }
    return l;
  });
}

const CLE_IMPORTES = "veille-isbn:importes"; // livres de la première version déjà repris

// Reprend, à chaque ouverture, les livres de la première version pas encore repris
// (utile si l'on revient un temps à l'ancienne version). Un livre repris puis supprimé ne revient pas.
function chargerLivres() {
  let livres = [];
  try {
    const v = JSON.parse(localStorage.getItem(CLE_LIVRES));
    if (Array.isArray(v)) livres = v.map((l) => (l.bnf === "loading" ? { ...l, bnf: "none" } : l));
  } catch {}
  try {
    const anciens = JSON.parse(localStorage.getItem(CLE_ANCIENS)) || [];
    const importes = new Set(JSON.parse(localStorage.getItem(CLE_IMPORTES)) || []);
    const ids = new Set(livres.map((l) => l.id));
    const isbns = new Set(livres.map((l) => l.isbn).filter(Boolean));
    const nouveaux = anciens.filter((a) => !importes.has(a.id) && !ids.has(a.id) && !(a.isbn && isbns.has(a.isbn)));
    livres.push(...convertirAnciens(nouveaux));
    for (const a of anciens) importes.add(a.id);
    localStorage.setItem(CLE_IMPORTES, JSON.stringify([...importes]));
  } catch {}
  return livres;
}

function sauverLivres(livres) {
  try {
    localStorage.setItem(CLE_LIVRES, JSON.stringify(livres.filter((l) => !l.draft)));
  } catch {
    toast("Mémoire du téléphone pleine : exportez et videz la liste.");
  }
}

function chargerReglages() {
  let r = {};
  try {
    r = JSON.parse(localStorage.getItem(CLE_REGLAGES)) || {};
  } catch {}
  const favs = {};
  for (const k of CONFIG.favorisParDefaut) favs[k] = true;
  return {
    email: localStorage.getItem("veille-isbn:destinataire") || "",
    pmbUrl: "", fondsMode: "both", theme: null, favs,
    groupe: "none", formatMail: "html", afficherEnvoyes: false,
    ...r,
  };
}

function sauverReglages(r) {
  localStorage.setItem(CLE_REGLAGES, JSON.stringify(r));
}

if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

// ---------- Photos (IndexedDB : trop lourdes pour localStorage) ----------

const photos = (() => {
  let ouverture = null;
  const ouvrir = () =>
    ouverture ||
    (ouverture = new Promise((ok, ko) => {
      const r = indexedDB.open("veille-isbn", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("photos");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    }));
  const tx = (mode, fn) =>
    ouvrir().then(
      (db) =>
        new Promise((ok, ko) => {
          const t = db.transaction("photos", mode);
          const req = fn(t.objectStore("photos"));
          t.oncomplete = () => ok(req && req.result);
          t.onerror = () => ko(t.error);
        })
    );
  const urls = new Map();
  return {
    get: (id) => tx("readonly", (s) => s.get(id)),
    put: (id, blob) => {
      if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
      urls.delete(id);
      return tx("readwrite", (s) => s.put(blob, id));
    },
    del: (id) => {
      if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
      urls.delete(id);
      return tx("readwrite", (s) => s.delete(id)).catch(() => {});
    },
    // Adresse affichable, ou null tant qu'elle n'est pas chargée (rappel quand elle l'est).
    url(id, quandPrete) {
      if (urls.has(id)) return urls.get(id);
      if (!urls.has(id + ":charge")) {
        urls.set(id + ":charge", true);
        this.get(id).then((b) => {
          urls.delete(id + ":charge");
          if (b) {
            urls.set(id, URL.createObjectURL(b));
            quandPrete && quandPrete();
          }
        });
      }
      return null;
    },
  };
})();

// Réduit la photo (côté le plus long = CONFIG.photo.taille) et la compresse en JPEG.
async function reduirePhoto(fichier) {
  const bmp = await createImageBitmap(fichier);
  const M = CONFIG.photo.taille;
  const k = Math.min(1, M / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", CONFIG.photo.qualite));
  return { blob, meta: { w, h, ow: bmp.width, oh: bmp.height, orig: fichier.size, size: blob.size } };
}

function blobEnDataUrl(blob) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => ko(r.error);
    r.readAsDataURL(blob);
  });
}

// ---------- BnF : SRU du Catalogue général, notice UNIMARC ----------

function urlCouvertureBnf(ark) {
  return `${CONFIG.bnf.base}/couverture?&appName=NE&idArk=${encodeURIComponent(ark)}&couverture=1`;
}

// Renvoie { statut: "found" | "notfound" | "error", data? }.
async function interrogerBnf(isbn) {
  const requete = `bib.isbn adj "${isbn}"`;
  const url =
    `${CONFIG.bnf.base}/api/SRU?version=1.2&operation=searchRetrieve` +
    `&query=${encodeURIComponent(requete)}&recordSchema=unimarcxchange&maximumRecords=1`;
  let texte;
  try {
    const ctrl = new AbortController();
    const minuterie = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(minuterie);
    if (!r.ok) return { statut: "error" };
    texte = await r.text();
  } catch {
    return { statut: "error" };
  }
  const xml = new DOMParser().parseFromString(texte, "application/xml");
  const enregistrement = xml.getElementsByTagNameNS("*", "record")[0];
  const nb = +(xml.getElementsByTagNameNS("*", "numberOfRecords")[0]?.textContent || 0);
  if (!nb || !enregistrement) return { statut: "notfound" };
  return { statut: "found", data: lireUnimarc(enregistrement) };
}

function lireUnimarc(rec) {
  const zones = [...rec.getElementsByTagNameNS("*", "datafield")];
  const zone = (tag) => zones.filter((z) => z.getAttribute("tag") === tag);
  const sous = (z, code) =>
    z ? [...z.getElementsByTagNameNS("*", "subfield")].filter((s) => s.getAttribute("code") === code).map((s) => s.textContent.trim()) : [];
  const un = (tag, code) => {
    for (const z of zone(tag)) {
      const v = sous(z, code)[0];
      if (v) return v;
    }
    return "";
  };
  const nettoyer = (s) => s.replace(/\s*[\/:;,.]\s*$/, "").replace(/\s+/g, " ").trim();
  const personne = (z) => [sous(z, "b")[0], sous(z, "a")[0]].filter(Boolean).join(" ");

  const t200 = zone("200")[0];
  let titre = nettoyer(sous(t200, "a")[0] || "");
  const numero = sous(t200, "h")[0], partie = sous(t200, "i")[0];
  if (numero) titre += `. ${nettoyer(numero)}`;
  if (partie) titre += `, ${nettoyer(partie)}`;

  const z700 = zone("700")[0] || zone("701")[0];
  let auteur = z700 ? personne(z700) : un("710", "a");
  if (!auteur) auteur = nettoyer(sous(t200, "f")[0] || "");

  // 702 avec code de fonction 440 = illustrateur.
  const zIllus = zone("702").find((z) => sous(z, "4").includes("440"));
  const illustrateur = zIllus ? personne(zIllus) : "";

  const editeur = nettoyer(un("214", "c") || un("210", "c"));
  const date = (un("214", "d") || un("210", "d")).replace(/[^\d]/g, "").slice(0, 4);
  const collection = nettoyer(un("225", "a"));
  const prixBrut = un("010", "d");
  const prix = prixBrut
    ? prixBrut.replace(/\s*EUR\b/i, " €").replace(/(\d)\.(\d)/, "$1,$2").trim()
    : "";

  const brut = new XMLSerializer().serializeToString(rec);
  const ark = (brut.match(/ark:\/12148\/[a-z0-9]+/i) || [])[0] || "";

  const d = { titre, auteur, illustrateur, editeur, prix, date, collection, ark };
  for (const k of Object.keys(d)) if (!d[k]) delete d[k];
  return d;
}

// Vérifie qu'une couverture existe (l'image se charge et n'est pas un pixel vide).
function testerCouverture(url) {
  return new Promise((ok) => {
    const img = new Image();
    const fin = (v) => {
      clearTimeout(m);
      ok(v);
    };
    const m = setTimeout(() => fin(false), 15000);
    img.onload = () => fin(img.naturalWidth > 10 && img.naturalHeight > 10);
    img.onerror = () => fin(false);
    img.src = url;
  });
}

// ---------- PMB : connecteur sortant JSON-RPC ----------

async function appelPmb(url, methode, params) {
  const ctrl = new AbortController();
  const m = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: methode, params, id: Date.now() }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || "Erreur PMB");
    return j.result;
  } finally {
    clearTimeout(m);
  }
}

// Renvoie { fonds: true/false, info } ou null si la vérification est impossible.
async function verifierFonds(url, isbn) {
  if (!url || !isbn || !navigator.onLine) return null;
  try {
    const res = await appelPmb(url, CONFIG.pmb.methode, [CONFIG.pmb.typeRecherche, isbn]);
    const n = +(res && (res.nbResults ?? res.nb_results ?? res.count) || 0);
    return n > 0 ? { fonds: true, info: `${n} notice${pl(n)}` } : { fonds: false, info: null };
  } catch {
    return null;
  }
}

async function testerPmb(url) {
  if (!navigator.onLine) return "offline";
  if (!/^https:\/\/.+/.test(url)) return "bad";
  try {
    await appelPmb(url, CONFIG.pmb.methode, [CONFIG.pmb.typeRecherche, "9782070360024"]);
    return "ok";
  } catch (e) {
    return e instanceof TypeError ? "unreachable" : "refused";
  }
}

// ---------- Mail ----------

function sousLigneMail(l) {
  const f = l.fields;
  return [f.auteur, f.editeur, f.cote, f.motif, f.prix, f.commentaire].filter(Boolean).join(" · ");
}

function corpsTexte(livres) {
  const lignes = livres.map((l) => {
    const parts = [`[${PRIO[l.prio]}]`, l.isbn ? formaterIsbn(l.isbn) : "(sans ISBN)"];
    for (const c of CHAMPS) if (l.fields[c.id]) parts.push(c.toujours ? l.fields[c.id] : `${c.label} : ${l.fields[c.id]}`);
    return "• " + parts.join(" — ");
  });
  const n = livres.length;
  return `Bonjour,\n\nVoici ${n} titre${pl(n)} repéré${pl(n)} pour les acquisitions :\n\n${lignes.join("\n")}\n`;
}

const COULEURS_PRIO_MAIL = { 1: ["#a9c4e6", "#14181d"], 2: ["#3f78b5", "#fff"], 3: ["#173f74", "#fff"] };

// Tableau HTML autonome : photos intégrées (réduites), couvertures BnF en lien.
async function documentHtml(livres) {
  const n = livres.length;
  const avecCouv = livres.some((l) => !l.photo && l.cover && l.bnfData?.ark);
  const lignes = [];
  for (const l of livres) {
    let vignette = `<div style="width:60px;height:88px;border:1px dashed #c5ccd4;border-radius:3px"></div>`;
    if (l.photo) {
      const b = await photos.get(l.id);
      if (b) vignette = `<img src="${await blobEnDataUrl(b)}" alt="" width="60" style="border-radius:3px;display:block">`;
    } else if (l.cover && l.bnfData?.ark) {
      vignette = `<img src="${esc(urlCouvertureBnf(l.bnfData.ark))}" alt="" width="60" style="border-radius:3px;display:block">`;
    }
    const [fond, encre] = COULEURS_PRIO_MAIL[l.prio];
    lignes.push(`<tr>
<td style="padding:8px;border-bottom:1px solid #eceff2;vertical-align:top">${vignette}</td>
<td style="padding:8px;border-bottom:1px solid #eceff2;vertical-align:top;font-size:14px;line-height:1.4">
<b style="font-size:15px">${esc(l.fields.titre || "(titre à compléter)")}</b><br>
<span style="color:#56606b">${esc(sousLigneMail(l))}</span><br>
<span style="color:#56606b;font-family:monospace">${esc(l.isbn ? formaterIsbn(l.isbn) : "sans ISBN")}</span></td>
<td style="padding:8px;border-bottom:1px solid #eceff2;vertical-align:top"><span style="display:inline-block;padding:3px 7px;border-radius:5px;background:${fond};color:${encre};font-size:12px;font-weight:600;white-space:nowrap">${PRIO[l.prio]}</span></td>
</tr>`);
  }
  const credit = avecCouv
    ? `<p style="font-size:12px;color:#56606b">Couvertures : BnF, Catalogue général, récupérées le ${new Date().toLocaleDateString("fr-FR")}.</p>`
    : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(CONFIG.objetMail)}</title></head>
<body style="font-family:Arial,sans-serif;color:#14181d;margin:16px">
<p>Bonjour, voici ${n} titre${pl(n)} repéré${pl(n)} pour les acquisitions, classés par priorité.</p>
<table style="border-collapse:collapse;width:100%;max-width:720px">
<tr style="background:#eceff2;font-size:11px;text-transform:uppercase;color:#56606b"><th style="padding:6px 8px;text-align:left">Couv.</th><th style="padding:6px 8px;text-align:left">Livre</th><th style="padding:6px 8px;text-align:left">Priorité</th></tr>
${lignes.join("\n")}
</table>
${credit}
</body></html>`;
}

// ---------- CSV ----------

function csvCellule(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function fichierCsv(livres) {
  const entetes = ["isbn", ...CHAMPS.map((c) => c.id), "priorite", "au_fonds", "bnf", "date", "envoye"];
  const lignes = [entetes.join(";")];
  for (const l of livres) {
    lignes.push(
      [
        l.isbn, ...CHAMPS.map((c) => l.fields[c.id]), PRIO[l.prio],
        l.fonds === true ? "oui" : l.fonds === false ? "non" : "", l.bnf,
        new Date(l.ts).toISOString(), l.sent ? "oui" : "non",
      ].map(csvCellule).join(";")
    );
  }
  // BOM pour qu'Excel/LibreOffice reconnaissent l'UTF-8.
  return new File(["﻿" + lignes.join("\r\n")], `veille-isbn-${new Date().toISOString().slice(0, 10)}.csv`, { type: "text/csv" });
}

async function partagerOuTelecharger(fichier, titre) {
  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: titre });
      return true;
    } catch (e) {
      if (e.name === "AbortError") return false;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(fichier);
  a.download = fichier.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}
