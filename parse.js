/* parse.js — kelime listesi okuyucu: .md .txt .csv .tsv .json .xlsx .docx -> ortak liste modeli.
 * Tarayicida ve Node'da (testler) ayni kod calisir; dis kutuphane yok.
 *
 * Liste: { ad, baslik, dil, alanlar:[{k, ad, rol}], kartlar:[{o, f:{k: html}, t?:[test]}], sorunlar:[{satir, neden}] }
 *   alanlar  dosyada bulunan alanlar; bilinen roller wort, satz, anlam, ceviri, not, es, zit, dogru, celAnlam,
 *            celWort; digerleri serbest
 *   kartlar  o = oturum basligi ("" = oturumsuz), f = alan anahtari -> guvenli HTML
 *   test     { tur, soru, dogru:[..], yanlis:[..], aciklama } duz metin (markdown satir ici), yanlis bos = yazarak
 *            Bicim tarifi: ~/.agent-skills/dil-koclugu/references/kelime-listesi-bicimi.md
 *   sorunlar okunamayan satirlar; is durdurulmaz, yalniz bilgi olarak gosterilir
 */
(function (kok) {
  "use strict";

  // ------------------------------------------------------------ alan adlari
  const ROLLER = {
    wort: ["wort", "kelime", "kelime kalip", "kalip", "word", "term", "terim", "begriff", "vokabel", "ausdruck",
      "ifade", "palabra", "woord", "front", "on yuz", "soru", "question"],
    satz: ["satz", "beispiel", "beispielsatz", "ornek", "ornek cumle", "cumle", "cumle icinde kullanimi",
      "kullanim", "example", "sentence", "frase", "ejemplo", "voorbeeld", "zin"],
    anlam: ["anlam", "anlami", "bedeutung", "meaning", "definition", "tanim", "turkce", "back", "arka yuz",
      "cevap", "answer", "significado", "betekenis"],
    ceviri: ["ceviri", "cevirisi", "cumle cevirisi", "ubersetzung", "translation", "tr", "traduccion", "vertaling"],
    not: ["not", "notlar", "notiz", "note", "notes", "aciklama", "kisa aciklama", "erklarung", "hinweis",
      "bemerkung", "kommentar", "comment", "nota"],
    es: ["es anlamli", "es anlam", "es anlamlilar", "es anlamlisi", "synonym", "synonyme", "synonyms", "sinonim",
      "sinonimler", "sinonimo", "sinonimos", "synoniem"],
    zit: ["zit anlamli", "zit anlam", "zit anlamlilar", "zit anlamlisi", "karsit anlam", "antonym", "antonyme",
      "antonyms", "antonimo", "antonimos", "antoniem"],
    dogru: ["diger dogrular", "diger dogru", "diger dogru cevaplar", "kabul edilen", "alternatif", "alternatifler",
      "auch richtig", "also correct"],
    celAnlam: ["celdirici anlam", "celdiriciler anlam", "anlam celdirici", "distraktor anlam", "distractor meaning"],
    celWort: ["celdirici wort", "celdirici kelime", "celdiriciler wort", "wort celdirici", "distraktor wort",
      "distractor word"],
  };
  const TEST_ADI = new Set(["test", "testler", "quiz", "alistirma"]);
  const OTURUM = ["oturum", "tarih", "konu", "thema", "lektion", "kapitel", "session", "topic", "date", "ders",
    "unit", "kategorie", "category", "bolum"];
  const ROL_ADI = { wort: "Wort", satz: "Satz", anlam: "Anlam", ceviri: "Çeviri", not: "Not", es: "Eş anlamlı",
    zit: "Zıt anlamlı", dogru: "Diğer doğrular", celAnlam: "Çeldirici Anlam", celWort: "Çeldirici Kelime" };
  const ROL_SIRA = ["wort", "satz", "anlam", "ceviri", "not", "es", "zit", "dogru", "celAnlam", "celWort"];

  /** Karsilastirma bicimi: kucuk harf, aksansiz, i/ı ayni, noktalama bosluk. */
  function sade(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/İ/g, "i")
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  const ROL_BUL = new Map();
  for (const [rol, adlar] of Object.entries(ROLLER)) for (const a of adlar) ROL_BUL.set(a, rol);
  const OTURUM_BUL = new Set(OTURUM);

  /** Alan kaydi: ayni etiket hep ayni anahtari verir. */
  function alanDefteri() {
    const alanlar = new Map();
    return {
      bul(etiket) {
        const s = sade(etiket);
        const rol = ROL_BUL.get(s) || null;
        const k = rol || "x_" + (s.replace(/ /g, "_") || "alan");
        if (!alanlar.has(k)) alanlar.set(k, { k, ad: rol ? ROL_ADI[rol] : String(etiket).trim(), rol });
        return alanlar.get(k);
      },
      liste() {
        const hepsi = [...alanlar.values()];
        const bilinen = ROL_SIRA.filter((r) => alanlar.has(r)).map((r) => alanlar.get(r));
        return bilinen.concat(hepsi.filter((a) => !a.rol));
      },
    };
  }

  // ------------------------------------------------------------ satir ici bicim
  function kacis(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  /** Markdown satir ici -> guvenli HTML: once kacis, sonra `kod`, **kalin**, *italik*. */
  function satirIci(metin) {
    let t = kacis(String(metin).trim());
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(^|[^\p{L}\p{N}*])\*(?!\s)(.+?)(?<!\s)\*(?![\p{L}\p{N}*])/gu, "$1<em>$2</em>");
    return t;
  }
  function hucre(metin) {
    return String(metin).split(/\r?\n/).map((s) => satirIci(s)).filter(Boolean).join("<br>");
  }
  function italikSoy(s) {
    const m = /^\*(.+)\*$/.exec(s.trim());
    return m ? m[1].trim() : s.trim();
  }
  /** "Tur | Soru | Dogru(lar) | Yanlislar | Aciklama" -> test; eksikse null. Listeler ";" ile ayrilir. */
  const parcala = (s) => String(s || "").split(";").map((x) => x.trim()).filter(Boolean);
  function testOlustur(tur, soru, dogru, yanlis, aciklama) {
    const t = { tur: String(tur || "").trim() || "Test", soru: String(soru || "").trim(), dogru: parcala(dogru),
      yanlis: parcala(yanlis), aciklama: String(aciklama || "").trim() };
    return t.soru && t.dogru.length ? t : null;
  }
  function testSatiri(metin) {
    const p = String(metin).split("|");
    return testOlustur(p[0], p[1], p[2], p[3], p.slice(4).join("|"));
  }
  function testEkle(kart, t) { (kart.t = kart.t || []).push(t); }
  /** HTML -> karsilastirma icin duz metin (DOM yok; Node testinde de calisir). */
  function htmlDuz(h) {
    return String(h || "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  }
  function ekle(kart, k, html) {
    if (!html) return;
    kart.f[k] = kart.f[k] ? kart.f[k] + " " + html : html;
  }

  // ------------------------------------------------------------ baslik ve dil
  const DILLER = [
    [/alman|deutsch|german/i, "de-DE"], [/ispanyol|espa|spanisch|spanish/i, "es-ES"],
    [/holland|nederland|dutch|niederl/i, "nl-NL"], [/ingiliz|english|englisch/i, "en-GB"],
    [/fransiz|fransız|fran[cç]ais|french|franz/i, "fr-FR"], [/italyan|italian|italien/i, "it-IT"],
  ];
  function dilTahmin(...metinler) {
    const t = metinler.filter(Boolean).join(" ");
    for (const [re, dil] of DILLER) if (re.test(t)) return dil;
    return "de-DE";
  }
  function govde(ad) {
    return String(ad).replace(/\.[^.]+$/, "");
  }
  function kisaBaslik(baslik, ad) {
    if (baslik) {
      const ilk = baslik.split(/\s+[—–-]\s+/)[0].trim();
      return ilk && ilk.length <= 40 ? ilk : baslik;
    }
    return govde(ad).replace(/[_]+/g, " ");
  }
  function sonuc(ad, baslik, defter, kartlar, sorunlar) {
    return {
      ad, baslik: kisaBaslik(baslik, ad), dil: dilTahmin(baslik, ad),
      alanlar: defter.liste(), kartlar, sorunlar,
    };
  }

  // ------------------------------------------------------------ markdown
  const MADDE = /^\s*[-*+]\s+\*\*(.+?):?\*\*:?\s*(.*)$/;
  const ESKI = /^\s*[-*+]\s+(.+?)\s+(?:—|–|-|=)\s+(.+)$/;

  function mdOku(metin, ad) {
    const defter = alanDefteri();
    const wort = defter.bul("wort");
    let baslik = null, oturum = "", oturumVar = false, kart = null, alan = null, cit = false;
    const kartlar = [], sorunlar = [];
    const satirlar = metin.split(/\r?\n/);
    for (let i = 0; i < satirlar.length; i++) {
      const no = i + 1;
      const s = satirlar[i].normalize("NFC").replace(/\s+$/, "");
      if (/^\s*```/.test(s)) { cit = !cit; continue; }
      if (cit) continue;
      if (/^#\s/.test(s) && baslik === null) { baslik = s.slice(2).trim(); continue; }
      if (/^##\s/.test(s)) { oturum = s.replace(/^##\s+/, "").trim(); oturumVar = true; kart = alan = null; continue; }
      if (/^###\s/.test(s)) {
        kart = { o: oturum, f: {} };
        ekle(kart, wort.k, satirIci(s.replace(/^###\s+/, "")));
        if (kart.f[wort.k]) kartlar.push(kart);
        else { sorunlar.push({ satir: no, neden: "kelime başlığı boş" }); kart = null; }
        alan = null; continue;
      }
      if (!s.trim()) { alan = null; continue; }
      if (kart) {
        const m = MADDE.exec(s);
        if (m && TEST_ADI.has(sade(m[1]))) {
          const t = testSatiri(m[2]);
          if (t) testEkle(kart, t); else sorunlar.push({ satir: no, neden: "test satırı eksik (Tür | Soru | Doğru | Yanlış | Açıklama)" });
          alan = null; continue;
        }
        if (m) {
          alan = defter.bul(m[1].replace(/:$/, ""));
          let deger = m[2].trim();
          if (alan.rol === "satz") {
            deger = italikSoy(deger);
            if (/^\(.*\)$/.test(deger)) {                  // "(bu cumlenin kendisi ornektir)" gibi not
              const not = defter.bul("not");
              kart.f[not.k] = (satirIci(deger) + " " + (kart.f[not.k] || "")).trim();
              alan = null; continue;
            }
          }
          ekle(kart, alan.k, satirIci(deger));
          continue;
        }
        if (/^[ \t]/.test(s) && alan) {
          const devam = s.trim();
          if (alan.rol === "satz" && /^\*.+\*$/.test(devam)) {
            const cev = defter.bul("ceviri");
            if (!kart.f[cev.k]) { ekle(kart, cev.k, satirIci(italikSoy(devam))); alan = cev; continue; }
          }
          ekle(kart, alan.k, satirIci(devam)); continue;
        }
        if (/^\s*([-*+]|\d+\.)\s/.test(s)) sorunlar.push({ satir: no, neden: "madde biçime uymadı: " + s.trim().slice(0, 60) });
        continue;
      }
      // kart disinda: eski tek satirlik bicim "- kelime — anlam"
      if (oturumVar) {
        const e = ESKI.exec(s);
        if (e && !/^\s*[-*+]\s+\*\*/.test(s)) {
          const k = { o: oturum, f: {} };
          ekle(k, wort.k, satirIci(e[1]));
          ekle(k, defter.bul("anlam").k, satirIci(e[2]));
          kartlar.push(k); continue;
        }
        if (/^\s*[-*+]\s/.test(s)) sorunlar.push({ satir: no, neden: "satır biçime uymadı: " + s.trim().slice(0, 60) });
      }
    }
    return sonuc(ad, baslik, defter, kartlar, sorunlar);
  }

  // ------------------------------------------------------------ tablolar (csv, xlsx, docx, json ortak)
  /** satirlar: [{no, hucreler:[...]}]; varsayilanOturum: sayfa/tablo adi (bos olabilir) */
  function tabloOku(satirlar, ad, baslik, sorunlar, defter) {
    defter = defter || alanDefteri();
    sorunlar = sorunlar || [];
    const kartlar = [];
    const dolu = satirlar.filter((r) => r.hucreler.some((h) => String(h).trim()));
    if (!dolu.length) return { defter, kartlar, sorunlar };
    const ilk = dolu[0].hucreler.map(sade);
    const basliklı = ilk.some((h) => ROL_BUL.has(h) || OTURUM_BUL.has(h));
    let sutunlar;
    if (basliklı) {
      sutunlar = dolu[0].hucreler.map((h, j) => {
        const s = sade(h);
        if (OTURUM_BUL.has(s)) return { oturum: true };
        if (!s) return null;
        return defter.bul(String(h).trim());
      });
      if (!sutunlar.some((a) => a && a.rol === "wort")) {      // kelime sutunu adlandirilmamis: ilk alan sutunu
        const j = sutunlar.findIndex((a) => a && !a.oturum);
        if (j >= 0) {
          const eski = sutunlar[j];
          sutunlar[j] = defter.bul("wort");
          if (eski && !eski.rol) sorunlar.push({ satir: dolu[0].no, neden: `"${eski.ad}" sütunu kelime olarak alındı` });
        }
      }
    } else {
      const sira = ["wort", "anlam", "satz", "ceviri", "not"];
      const en = Math.max(...dolu.map((r) => r.hucreler.length));
      sutunlar = [];
      for (let j = 0; j < en; j++) sutunlar.push(defter.bul(sira[j] || `Sütun ${j + 1}`));
    }
    const wortK = "wort";
    for (const r of basliklı ? dolu.slice(1) : dolu) {
      const kart = { o: r.oturum || "", f: {} };
      r.hucreler.forEach((h, j) => {
        const a = sutunlar[j];
        const t = String(h ?? "").trim();
        if (!a || !t) return;
        if (a.oturum) { kart.o = t; return; }
        ekle(kart, a.k, hucre(t));
      });
      const doluAlan = Object.keys(kart.f).length;
      if (!doluAlan) continue;
      if (!kart.f[wortK]) { sorunlar.push({ satir: r.no, neden: "kelime hücresi boş" }); continue; }
      kartlar.push(kart);
    }
    return { defter, kartlar, sorunlar };
  }

  /** Test tablosu: baslikta "Soru" ve "Dogru" var. Sutunlar: Wort, Tur, Soru, Dogru, Yanlis, Aciklama. */
  const TEST_SUTUN = { tur: ["tur", "test turu", "art", "type"], soru: ["soru", "frage", "question"],
    dogru: ["dogru", "dogrular", "dogru cevap", "dogru cevaplar", "richtig", "correct"],
    yanlis: ["yanlis", "yanlislar", "yanlis cevaplar", "secenekler", "falsch", "wrong"],
    aciklama: ["aciklama", "erklarung", "explanation", "neden", "gerekce"] };
  function testTablosuMu(hucreler) {
    const h = hucreler.map(sade);
    return h.some((x) => TEST_SUTUN.soru.includes(x)) && h.some((x) => TEST_SUTUN.dogru.includes(x));
  }
  /** -> [{no, w, t}] ; w = kelime metni (duz) */
  function testTablosuOku(satirlar, sorunlar, yer) {
    const dolu = satirlar.filter((r) => r.hucreler.some((h) => String(h).trim()));
    const bas = dolu[0].hucreler.map(sade);
    const sut = (adlar) => bas.findIndex((x) => adlar.includes(x));
    const j = { w: bas.findIndex((x) => ROL_BUL.get(x) === "wort" && !TEST_SUTUN.soru.includes(x)), tur: sut(TEST_SUTUN.tur),
      soru: sut(TEST_SUTUN.soru), dogru: sut(TEST_SUTUN.dogru), yanlis: sut(TEST_SUTUN.yanlis), aciklama: sut(TEST_SUTUN.aciklama) };
    const al = (r, k) => (j[k] >= 0 ? String(r.hucreler[j[k]] ?? "").trim() : "");
    const cikti = [];
    for (const r of dolu.slice(1)) {
      const t = testOlustur(al(r, "tur"), al(r, "soru"), al(r, "dogru"), al(r, "yanlis"), al(r, "aciklama"));
      const w = al(r, "w");
      if (!w) { sorunlar.push({ satir: yer + "satır " + r.no, neden: "testin kelimesi (Wort) boş" }); continue; }
      if (!t) { sorunlar.push({ satir: yer + "satır " + r.no, neden: "test eksik: Soru ve Doğru dolu olmalı" }); continue; }
      cikti.push({ no: r.no, w, t });
    }
    return cikti;
  }
  /** Tablodan gelen testleri kelimeye gore kartlara baglar. */
  function testleriBagla(kartlar, testler, sorunlar, yer) {
    const harita = new Map(kartlar.map((k) => [sade(htmlDuz(k.f.wort)), k]));
    for (const x of testler) {
      const k = harita.get(sade(x.w));
      if (k) testEkle(k, x.t); else sorunlar.push({ satir: yer + "satır " + x.no, neden: `test kelimesi listede yok: ${x.w.slice(0, 40)}` });
    }
  }

  /** RFC 4180 CSV; ayrac verilmezse ilk dolu satirdan sezilir. */
  function csvSatirlari(metin, ayrac) {
    if (!ayrac) {
      const ornek = metin.split(/\r?\n/).find((s) => s.trim()) || "";
      const say = (c) => ornek.split(c).length - 1;
      ayrac = say("\t") ? "\t" : say(";") >= Math.max(1, say(",")) ? ";" : ",";
    }
    const satirlar = [];
    let r = [], h = "", tirnak = false, no = 1, basNo = 1;
    for (let i = 0; i < metin.length; i++) {
      const c = metin[i];
      if (tirnak) {
        if (c === '"') { if (metin[i + 1] === '"') { h += '"'; i++; } else tirnak = false; }
        else { if (c === "\n") no++; h += c; }
        continue;
      }
      if (c === '"' && h === "") { tirnak = true; continue; }
      if (c === ayrac) { r.push(h); h = ""; continue; }
      if (c === "\r") continue;
      if (c === "\n") { r.push(h); satirlar.push({ no: basNo, hucreler: r }); r = []; h = ""; no++; basNo = no; continue; }
      h += c;
    }
    if (h !== "" || r.length) { r.push(h); satirlar.push({ no: basNo, hucreler: r }); }
    return satirlar;
  }

  /** Duz metin, blok bicimi: her kelime "Alan: deger" satirlari, kelimeler arasinda bos satir; "Test: ..." satirlari. */
  const BLOK = /^\s*(wort|kelime|kelime\/kalip|word|begriff|vokabel|palabra|woord)\s*:/im;
  function txtBlokOku(metin, ad) {
    const defter = alanDefteri();
    const kartlar = [], sorunlar = [];
    let oturum = "", baslik = null, kart = null, alan = null;
    metin.split(/\r?\n/).forEach((ham, i) => {
      const no = i + 1, s = ham.normalize("NFC").replace(/\s+$/, "");
      if (!s.trim()) { kart = null; alan = null; return; }
      if (/^#\s/.test(s) && baslik === null && !kartlar.length) { baslik = s.slice(2).trim(); return; }
      if (/^#+\s/.test(s)) { oturum = s.replace(/^#+\s+/, "").trim(); kart = alan = null; return; }
      const m = /^\s*[-*•]?\s*([^:|]{1,40}?)\s*:\s*(.*)$/.exec(s);
      if (m && TEST_ADI.has(sade(m[1]))) {
        const t = testSatiri(m[2]);
        if (!kart) sorunlar.push({ satir: no, neden: "test satırı bir kelimeye bağlı değil" });
        else if (t) testEkle(kart, t); else sorunlar.push({ satir: no, neden: "test satırı eksik (Tür | Soru | Doğru | Yanlış | Açıklama)" });
        alan = null; return;
      }
      if (m) {
        const a = defter.bul(m[1]);
        if (a.rol === "wort") {
          kart = { o: oturum, f: {} };
          ekle(kart, a.k, satirIci(m[2]));
          if (kart.f[a.k]) kartlar.push(kart); else { sorunlar.push({ satir: no, neden: "kelime boş" }); kart = null; }
          alan = null; return;
        }
        if (!kart) { sorunlar.push({ satir: no, neden: "kelime satırından önce: " + s.trim().slice(0, 60) }); return; }
        alan = a; ekle(kart, a.k, satirIci(m[2])); return;
      }
      if (kart && alan) { ekle(kart, alan.k, satirIci(s.trim())); return; }
      sorunlar.push({ satir: no, neden: "satır biçime uymadı: " + s.trim().slice(0, 60) });
    });
    return sonuc(ad, baslik, defter, kartlar, sorunlar);
  }

  /** Duz metin: "kelime — anlam" / "kelime - anlam" / "kelime: anlam" / "kelime = anlam" satirlari. */
  function txtOku(metin, ad) {
    if (BLOK.test(metin)) return txtBlokOku(metin, ad);
    const defter = alanDefteri();
    const wort = defter.bul("wort"), anlam = defter.bul("anlam");
    const kartlar = [], sorunlar = [];
    let oturum = "";
    metin.split(/\r?\n/).forEach((ham, i) => {
      const s = ham.normalize("NFC").trim().replace(/^[-*+•]\s+/, "");
      if (!s) return;
      if (/^#+\s/.test(s)) { oturum = s.replace(/^#+\s+/, ""); return; }
      const m = /^(.+?)\s+(?:—|–|-|=)\s+(.+)$/.exec(s) || /^([^:]+?):\s+(.+)$/.exec(s);
      if (!m) { sorunlar.push({ satir: i + 1, neden: "ayraç yok (— - : =): " + s.slice(0, 60) }); return; }
      const k = { o: oturum, f: {} };
      ekle(k, wort.k, satirIci(m[1])); ekle(k, anlam.k, satirIci(m[2]));
      kartlar.push(k);
    });
    return sonuc(ad, null, defter, kartlar, sorunlar);
  }

  function csvOku(metin, ad, ayrac) {
    const t = tabloOku(csvSatirlari(metin, ayrac), ad);
    return sonuc(ad, null, t.defter, t.kartlar, t.sorunlar);
  }

  // ------------------------------------------------------------ json
  function jsonOku(metin, ad) {
    let veri;
    try { veri = JSON.parse(metin); } catch (e) { throw new Error("JSON okunamadı: " + e.message); }
    let baslik = null;
    if (veri && !Array.isArray(veri) && typeof veri === "object") {
      baslik = veri.baslik || veri.title || veri.ad || veri.name || null;
      veri = veri.kartlar || veri.cards || veri.items || veri.words || veri.kelimeler || veri.data || [];
    }
    if (!Array.isArray(veri)) throw new Error("JSON'da kart dizisi bulunamadı");
    // nesnelerde "testler": [{tur, soru, dogru, yanlis, aciklama}] ya da ["Tur | Soru | ..."]
    const jsonTest = new Map();
    veri.forEach((x, i) => {
      if (!x || typeof x !== "object" || Array.isArray(x)) return;
      const tk = Object.keys(x).find((k) => TEST_ADI.has(sade(k)));
      if (!tk) return;
      const liste = (Array.isArray(x[tk]) ? x[tk] : [x[tk]]).map((y) => (typeof y === "string" ? testSatiri(y)
        : y && typeof y === "object" ? testOlustur(y.tur || y.type, y.soru || y.question, [].concat(y.dogru || y.correct || []).join(";"),
          [].concat(y.yanlis || y.wrong || []).join(";"), y.aciklama || y.explanation) : null));
      jsonTest.set(i, liste.filter(Boolean));
      if (liste.some((y) => !y)) jsonTest.get(i).eksik = true;
      veri[i] = { ...x }; delete veri[i][tk];
    });
    let satirlar;
    if (veri.every((x) => Array.isArray(x))) {
      satirlar = veri.map((x, i) => ({ no: i + 1, hucreler: x.map(deger) }));
    } else {
      const anahtarlar = [];
      for (const x of veri) if (x && typeof x === "object") for (const k of Object.keys(x)) if (!anahtarlar.includes(k)) anahtarlar.push(k);
      satirlar = [{ no: 0, hucreler: anahtarlar }].concat(veri.map((x, i) => ({
        no: i + 1, hucreler: anahtarlar.map((k) => (x && typeof x === "object" ? deger(x[k]) : "")),
      })));
    }
    const t = tabloOkuBaslikli(satirlar, ad, !veri.every((x) => Array.isArray(x)));
    for (const k of t.kartlar) {
      const l = jsonTest.get(k.sira);
      if (l) { l.forEach((y) => testEkle(k, y)); if (l.eksik) t.sorunlar.push({ satir: k.sira + 1, neden: "eksik test atlandı" }); }
      delete k.sira;
    }
    t.sorunlar.forEach((s) => (s.satir = "kart " + s.satir));
    return sonuc(ad, baslik, t.defter, t.kartlar, t.sorunlar);
  }
  function deger(v) {
    if (v == null) return "";
    if (Array.isArray(v)) return v.map(deger).filter(Boolean).join(", ");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }
  /** JSON nesnelerinde ilk satir her zaman basliktir (anahtar adlari). */
  function tabloOkuBaslikli(satirlar, ad, baslikZorunlu) {
    if (!baslikZorunlu) return tabloOku(satirlar, ad);
    const defter = alanDefteri(), sorunlar = [], kartlar = [];
    const sutunlar = satirlar[0].hucreler.map((h) => (OTURUM_BUL.has(sade(h)) ? { oturum: true } : defter.bul(h)));
    if (!sutunlar.some((a) => a.rol === "wort")) {
      const j = sutunlar.findIndex((a) => !a.oturum);
      if (j >= 0) sutunlar[j] = defter.bul("wort");
    }
    for (const r of satirlar.slice(1)) {
      const kart = { o: "", f: {} };
      r.hucreler.forEach((h, j) => {
        const a = sutunlar[j], t = String(h).trim();
        if (!t) return;
        if (a.oturum) kart.o = t; else ekle(kart, a.k, hucre(t));
      });
      if (!Object.keys(kart.f).length) continue;
      if (!kart.f.wort) { sorunlar.push({ satir: r.no, neden: "kelime boş" }); continue; }
      kart.sira = r.no - 1;
      kartlar.push(kart);
    }
    return { defter, kartlar, sorunlar };
  }

  // ------------------------------------------------------------ zip (xlsx, docx)
  async function zipAc(bayt) {
    const dv = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);
    let eocd = -1;
    for (let i = bayt.length - 22; i >= Math.max(0, bayt.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("dosya bir zip/Office belgesi değil ya da bozuk");
    const adet = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dosyalar = new Map();
    const td = new TextDecoder();
    for (let n = 0; n < adet; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("zip dizini bozuk");
      const yontem = dv.getUint16(p + 10, true), boy = dv.getUint32(p + 20, true);
      const adBoy = dv.getUint16(p + 28, true), ekBoy = dv.getUint16(p + 30, true), notBoy = dv.getUint16(p + 32, true);
      const yerel = dv.getUint32(p + 42, true);
      const ad = td.decode(bayt.subarray(p + 46, p + 46 + adBoy));
      dosyalar.set(ad, { yontem, boy, yerel });
      p += 46 + adBoy + ekBoy + notBoy;
    }
    return {
      var: (ad) => dosyalar.has(ad),
      async metin(ad) {
        const d = dosyalar.get(ad);
        if (!d) return null;
        const bas = d.yerel + 30 + dv.getUint16(d.yerel + 26, true) + dv.getUint16(d.yerel + 28, true);
        const veri = bayt.subarray(bas, bas + d.boy);
        if (d.yontem === 0) return td.decode(veri);
        if (d.yontem !== 8) throw new Error("desteklenmeyen sıkıştırma: " + d.yontem);
        const akis = new Blob([veri]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return td.decode(await new Response(akis).arrayBuffer());
      },
    };
  }
  function xmlCoz(s) {
    return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e) => {
      const t = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e.toLowerCase()];
      if (t) return t;
      return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    });
  }

  async function xlsxOku(bayt, ad) {
    const z = await zipAc(bayt);
    const paylasilan = [];
    const ss = await z.metin("xl/sharedStrings.xml");
    if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      paylasilan.push(xmlCoz([...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
    }
    const kitap = (await z.metin("xl/workbook.xml")) || "";
    const iliski = (await z.metin("xl/_rels/workbook.xml.rels")) || "";
    const hedef = new Map([...iliski.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
      (/Id="([^"]+)"/.exec(m[0]) || [])[1], (/Target="([^"]+)"/.exec(m[0]) || [])[1]]));
    const sayfalar = [...kitap.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
      ad: xmlCoz((/name="([^"]*)"/.exec(m[0]) || [])[1] || ""),
      yol: (() => { const t = hedef.get((/r:id="([^"]+)"/.exec(m[0]) || [])[1]) || ""; return t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, ""); })(),
    }));
    if (!sayfalar.length) throw new Error("Excel dosyasında sayfa bulunamadı");
    const defter = alanDefteri(), kartlar = [], sorunlar = [], testler = [];
    const okunan = [];
    for (const sy of sayfalar) {
      const xml = await z.metin(sy.yol);
      if (!xml) continue;
      const satirlar = [];
      for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const no = +((/\br="(\d+)"/.exec(rm[1]) || [])[1] || satirlar.length + 1);
        const hucreler = [];
        for (const cm of (rm[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = (/\br="([A-Z]+)\d+"/.exec(cm[1]) || [])[1];
          const tur = (/\bt="([^"]+)"/.exec(cm[1]) || [])[1];
          const ic = cm[2] || "";
          let v = "";
          if (tur === "s") v = paylasilan[+((/<v>([\s\S]*?)<\/v>/.exec(ic) || [])[1])] ?? "";
          else if (tur === "inlineStr") v = xmlCoz([...ic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
          else v = xmlCoz((/<v>([\s\S]*?)<\/v>/.exec(ic) || [])[1] || "");
          const j = ref ? [...ref].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1 : hucreler.length;
          hucreler[j] = v;
        }
        for (let j = 0; j < hucreler.length; j++) if (hucreler[j] === undefined) hucreler[j] = "";
        satirlar.push({ no, hucreler });
      }
      const ilk = satirlar.find((r) => r.hucreler.some((h) => String(h).trim()));
      if (ilk && testTablosuMu(ilk.hucreler)) { testler.push(...testTablosuOku(satirlar, sorunlar, sy.ad + " ")); continue; }
      okunan.push({ sy, satirlar });
    }
    for (const { sy, satirlar } of okunan) {
      for (const r of satirlar) r.oturum = okunan.length > 1 ? sy.ad : "";
      const t = tabloOku(satirlar, ad, null, [], alanDefteri());
      // sayfalar ayri basliklara sahip olabilir: alanlari ortak deftere tasi
      for (const k of t.kartlar) {
        const yeni = { o: k.o, f: {} };
        for (const a of t.defter.liste()) if (k.f[a.k] !== undefined) yeni.f[defter.bul(a.rol ? a.rol : a.ad).k] = k.f[a.k];
        kartlar.push(yeni);
      }
      for (const s of t.sorunlar) sorunlar.push({ satir: (okunan.length > 1 ? sy.ad + " " : "") + "satır " + s.satir, neden: s.neden });
    }
    testleriBagla(kartlar, testler, sorunlar, "Testler ");
    return sonuc(ad, null, defter, kartlar, sorunlar);
  }

  async function docxOku(bayt, ad) {
    const z = await zipAc(bayt);
    const xml = await z.metin("word/document.xml");
    if (!xml) throw new Error("Word belgesinde metin bulunamadı");
    const paragrafMetni = (p) => xmlCoz(p.replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n")
      .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<[^>]+>/g, (_, t) => t || ""));
    const tablolar = [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)];
    if (!tablolar.length) {
      const metin = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((m) => paragrafMetni(m[0])).join("\n");
      const l = txtOku(metin, ad);
      l.sorunlar.forEach((s) => (s.satir = "paragraf " + s.satir));
      return l;
    }
    const defter = alanDefteri(), kartlar = [], sorunlar = [], testler = [];
    const okunan = [];
    tablolar.forEach((tm, ti) => {
      const satirlar = [...tm[1].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((rm, ri) => ({
        no: ri + 1,
        hucreler: [...rm[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cm) =>
          [...cm[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => paragrafMetni(p[0])).join("\n")),
      }));
      const ilk = satirlar.find((r) => r.hucreler.some((h) => String(h).trim()));
      if (ilk && testTablosuMu(ilk.hucreler)) testler.push(...testTablosuOku(satirlar, sorunlar, `tablo ${ti + 1} `));
      else okunan.push(satirlar);
    });
    okunan.forEach((satirlar, ti) => {
      for (const r of satirlar) r.oturum = okunan.length > 1 ? `Tablo ${ti + 1}` : "";
      const t = tabloOku(satirlar, ad, null, [], alanDefteri());
      for (const k of t.kartlar) {
        const yeni = { o: k.o, f: {} };
        for (const a of t.defter.liste()) if (k.f[a.k] !== undefined) yeni.f[defter.bul(a.rol ? a.rol : a.ad).k] = k.f[a.k];
        kartlar.push(yeni);
      }
      for (const s of t.sorunlar) sorunlar.push({ satir: (okunan.length > 1 ? `tablo ${ti + 1} ` : "") + "satır " + s.satir, neden: s.neden });
    });
    testleriBagla(kartlar, testler, sorunlar, "Testler ");
    return sonuc(ad, null, defter, kartlar, sorunlar);
  }

  // ------------------------------------------------------------ giris noktasi
  function metneCevir(bayt) {
    let t;
    try { t = new TextDecoder("utf-8", { fatal: true }).decode(bayt); }
    catch (e) { t = new TextDecoder("windows-1252").decode(bayt); }   // Windows Excel CSV
    return t.replace(/^﻿/, "");
  }

  const DESTEK = ["md", "markdown", "txt", "csv", "tsv", "json", "xlsx", "docx"];

  /** Dosya adi + baytlar -> Liste. Desteklenmeyen bicimde Error firlatir (aciklamali). */
  async function oku(ad, bayt) {
    const uzanti = (/\.([^.]+)$/.exec(ad) || [])[1]?.toLowerCase() || "";
    if (uzanti === "doc" || uzanti === "xls" || uzanti === "numbers" || uzanti === "pages" || uzanti === "odt" || uzanti === "ods")
      throw new Error(`.${uzanti} okunamıyor; dosyayı .docx ya da .xlsx olarak kaydedip yeniden açın`);
    let l;
    if (uzanti === "xlsx") l = await xlsxOku(bayt, ad);
    else if (uzanti === "docx") l = await docxOku(bayt, ad);
    else {
      const metin = metneCevir(bayt);
      if (uzanti === "md" || uzanti === "markdown") l = mdOku(metin, ad);
      else if (uzanti === "csv") l = csvOku(metin, ad);
      else if (uzanti === "tsv") l = csvOku(metin, ad, "\t");
      else if (uzanti === "json") l = jsonOku(metin, ad);
      else if (uzanti === "txt" || uzanti === "") {
        if (/^###\s/m.test(metin)) l = mdOku(metin, ad);
        else if (/\t/.test(metin)) l = csvOku(metin, ad, "\t");
        else l = txtOku(metin, ad);
      } else throw new Error(`.${uzanti} desteklenmiyor; desteklenenler: ${DESTEK.map((x) => "." + x).join(" ")}`);
    }
    return l;
  }

  const api = { oku, mdOku, csvOku, txtOku, jsonOku, xlsxOku, docxOku, satirIci, sade, htmlDuz, DESTEK };
  kok.KKParse = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    // Komut satiri (ajanlar icin denetim): node parse.js DOSYA... -> kart, test, okunamayan satir, eksik kart, kalite.
    // Kurallar: ~/.agent-skills/dil-koclugu/references/kelime-listesi-bicimi.md (bolum 3, 4, 8). Sorun varsa cikis 1.
    if (typeof require !== "undefined" && require.main === module) {
      const fs = require("fs"), path = require("path");
      (async () => {
        let kod = 0;
        for (const f of process.argv.slice(2)) {
          try {
            const bayt = fs.readFileSync(f);
            const l = await oku(path.basename(f), new Uint8Array(bayt));
            const test = l.kartlar.reduce((s, k) => s + (k.t ? k.t.length : 0), 0);
            // .md: dosyadaki satir sayilari ile okunani karsilastir (yanlis yere yazilan satir sayilir ama okunmaz)
            let baslik = null, testSatiri = null;
            if (/\.(md|markdown)$/i.test(f)) {
              let cit = false; baslik = 0; testSatiri = 0;
              for (const s of bayt.toString("utf8").split(/\r?\n/)) {
                if (/^\s*```/.test(s)) { cit = !cit; continue; }
                if (cit) continue;
                if (/^###\s/.test(s)) baslik++;
                if (/^\s*[-*+]\s+\*\*Test:?\*\*/.test(s)) testSatiri++;
              }
            }
            const eksik = [], kalite = [];
            for (const k of l.kartlar) {
              const t = k.t || [], ad = htmlDuz(k.f.wort);
              const yok = ["anlam", "satz", "celAnlam", "celWort"].filter((x) => !k.f[x]);
              if (t.length < 2) yok.push("en az 2 test");
              if (yok.length) eksik.push(`${ad}: ${yok.join(", ")}`);
              const neden = [];
              if (t.length && new Set(t.map((x) => x.tur)).size < 2) neden.push("tek test türü");
              if (t.length && !t.some((x) => x.yanlis.length)) neden.push("seçmeli test yok");
              if (t.filter((x) => x.tur === "Boşluk").length > 1) neden.push("birden çok Boşluk");
              if (t.some((x) => /Karttaki ifadeyi|^\*?(?:Ich|Man|Er|Sie|Wir|Du) ___\.\*?/.test(x.soru))) neden.push("bağlamsız soru");
              if (neden.length) kalite.push(`${ad}: ${neden.join(", ")}`);
            }
            const sayi = (a, b) => (b === null ? `${a}` : `${a}/${b}`);
            console.log(`${f}: ${sayi(l.kartlar.length, baslik)} kart, ${sayi(test, testSatiri)} test, ` +
              `${l.sorunlar.length} okunamayan satır, ${eksik.length} eksik kart, ${kalite.length} kalite sorunu`);
            for (const x of l.sorunlar) console.log(`  satır ${x.satir}: ${x.neden}`);
            for (const x of eksik) console.log(`  eksik: ${x}`);
            for (const x of kalite) console.log(`  kalite: ${x}`);
            if (!l.kartlar.length || l.sorunlar.length || eksik.length || kalite.length ||
                (baslik !== null && (baslik !== l.kartlar.length || testSatiri !== test))) kod = 1;
          } catch (e) { console.log(`${f}: HATA ${e.message}`); kod = 1; }
        }
        process.exit(kod);
      })();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
