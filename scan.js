"use strict";
// Caméra et lecture des codes-barres.
// Lecteur natif (BarcodeDetector) quand le navigateur le propose : rapide et capable de lire
// plusieurs codes à la fois. Sinon ZXing, avec un découpage de l'image en tuiles pour la pile.

const Camera = {
  flux: null,

  async demarrer(video) {
    this.flux = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: "continuous" }],
      },
    });
    video.srcObject = this.flux;
    await video.play();
    const t = this.piste();
    const caps = t && t.getCapabilities ? t.getCapabilities() : {};
    return { torche: !!caps.torch, zoom: caps.zoom || null };
  },

  piste() {
    return this.flux && this.flux.getVideoTracks()[0];
  },

  torche(allume) {
    const t = this.piste();
    if (t) t.applyConstraints({ advanced: [{ torch: allume }] }).catch(() => {});
  },

  zoom(v) {
    const t = this.piste();
    if (t) t.applyConstraints({ advanced: [{ zoom: v }] }).catch(() => {});
  },

  arreter(video) {
    if (this.flux) this.flux.getTracks().forEach((t) => t.stop());
    this.flux = null;
    if (video) video.srcObject = null;
  },
};

const Lecteur = (() => {
  let natif = null; // BarcodeDetector, ou null
  const pret = (async () => {
    try {
      if ("BarcodeDetector" in window) {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats.includes("ean_13")) natif = new BarcodeDetector({ formats: ["ean_13"] });
      }
    } catch {}
  })();

  const zx = new ZXing.MultiFormatReader();
  const indices = new Map([
    [ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13]],
    [ZXing.DecodeHintType.TRY_HARDER, true],
  ]);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const tuile = document.createElement("canvas");
  const ctxTuile = tuile.getContext("2d", { willReadFrequently: true });

  // Décode une zone du canvas de travail ; renvoie {text, box} en coordonnées du canvas, ou null.
  function zxDecoder(x0, y0, w, h) {
    let c = canvas;
    if (x0 || y0 || w !== canvas.width || h !== canvas.height) {
      tuile.width = w;
      tuile.height = h;
      ctxTuile.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
      c = tuile;
    }
    try {
      const src = new ZXing.HTMLCanvasElementLuminanceSource(c);
      const r = zx.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src)), indices);
      const pts = r.getResultPoints() || [];
      const xs = pts.map((p) => p.getX()), ys = pts.map((p) => p.getY());
      const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : w;
      const larg = Math.max(40, maxX - minX), haut = larg * 0.4;
      const my = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : h / 2;
      return { text: r.getText(), box: { x: x0 + minX, y: y0 + my - haut / 2, w: larg, h: haut } };
    } catch {
      return null;
    }
  }

  // Copie la source dans le canvas de travail, réduite à `max` px de large.
  function copier(source, sw, sh, max, rect) {
    const r = rect || { x: 0, y: 0, w: sw, h: sh };
    const k = Math.min(1, max / r.w);
    canvas.width = Math.round(r.w * k);
    canvas.height = Math.round(r.h * k);
    ctx.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
    return { k, r };
  }

  const versSource = (res, { k, r }) =>
    res && { text: res.text, box: { x: r.x + res.box.x / k, y: r.y + res.box.y / k, w: res.box.w / k, h: res.box.h / k } };

  let passe = 0;

  // Lit la source (vidéo, image, canvas). multi = tous les codes visibles.
  // Renvoie [{text, box:{x,y,w,h}}] en pixels de la source.
  async function lire(source, sw, sh, multi) {
    await pret;
    if (natif) {
      try {
        const codes = await natif.detect(source);
        const res = codes.map((c) => ({ text: c.rawValue, box: { x: c.boundingBox.x, y: c.boundingBox.y, w: c.boundingBox.width, h: c.boundingBox.height } }));
        return multi ? res : res.slice(0, 1);
      } catch {
        return [];
      }
    }
    if (!multi) {
      // En alternance : image entière réduite, puis zone du viseur en pleine résolution.
      const centre = passe++ % 2 === 1;
      const rect = centre ? { x: sw * 0.15, y: sh * 0.25, w: sw * 0.7, h: sh * 0.5 } : null;
      const t = copier(source, sw, sh, centre ? 2000 : 1280, rect);
      const res = versSource(zxDecoder(0, 0, canvas.width, canvas.height), t);
      return res ? [res] : [];
    }
    // Pile : image entière puis tuiles qui se chevauchent (ZXing ne lit qu'un code par passage).
    const t = copier(source, sw, sh, 1600);
    const W = canvas.width, H = canvas.height;
    const vus = new Map();
    const ajouter = (res) => {
      if (res && !vus.has(res.text)) vus.set(res.text, versSource(res, t));
    };
    ajouter(zxDecoder(0, 0, W, H));
    for (const [n, f] of [[2, 0.5], [3, 0.4]]) {
      const tw = Math.round(W * f), th = Math.round(H * f);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const x = Math.round(((W - tw) * i) / (n - 1)), y = Math.round(((H - th) * j) / (n - 1));
          ajouter(zxDecoder(x, y, tw, th));
        }
      }
    }
    return [...vus.values()];
  }

  async function lireVideo(video, multi) {
    if (!video.videoWidth) return [];
    return lire(video, video.videoWidth, video.videoHeight, multi);
  }

  // Photo prise avec l'appareil photo du téléphone : plusieurs tailles, la lecture est parfois meilleure réduite.
  async function lireFichier(fichier, multi) {
    const bmp = await createImageBitmap(fichier);
    await pret;
    if (natif) return lire(bmp, bmp.width, bmp.height, multi);
    for (const max of [2000, 1280, 800]) {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k);
      c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const res = await lire(c, c.width, c.height, multi);
      if (res.length) return res;
    }
    return [];
  }

  return { lireVideo, lireFichier, pret, natif: () => !!natif };
})();
