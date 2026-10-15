/* app.js — Kelime Karti arayuzu. Veri cihazdan cikmaz: dosya tarayicida okunur, tarayicinin deposunda tutulur. */
"use strict";
const SURUM = "2.2.1";
const $ = (s, k = document) => k.querySelector(s);
const $$ = (s, k = document) => [...k.querySelectorAll(s)];

// ------------------------------------------------------------ depo (tarayici; erisilemezse bellekte)
const bellek = new Map();
const depo = {
  al(k, vars) {
    try { const v = localStorage.getItem(k); return v == null ? vars : JSON.parse(v); }
    catch (e) { return bellek.has(k) ? bellek.get(k) : vars; }
  },
  koy(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { bellek.set(k, v); bildir("Tarayıcı deposuna yazılamadı; işaretler bu oturumla sınırlı kalır."); }
  },
  sil(k) { try { localStorage.removeItem(k); } catch (e) { bellek.delete(k); } },
};

// ------------------------------------------------------------ durum
const D = {
  liste: null,        // acik liste (parse.js modeli)
  id: null,           // listenin depo kimligi
  ayar: null,         // {grup:{k:1|2|0}, acik:{1,2}, suzgec, dil, tur}
  isaret: {},         // {kelimeMetni: {d:'ok'|'sik'|'seyrek', fav:true}}
  ozel: new Map(),    // kart basina bolge acik/kapali (gecici): anahtar -> {1:bool, 2:bool}
  sira: null,         // karistirma sirasi: anahtar -> sayi
  ara: "",
  odak: -1,
};

const duz = (html) => { const d = document.createElement("div"); d.innerHTML = html || ""; return d.textContent.trim(); };
const kimlik = (ad) => KKParse.sade(String(ad).replace(/\.[^.]+$/, "")).replace(/ /g, "-") || "liste";
const anahtar = (kart) => duz(kart.f.wort);

// ------------------------------------------------------------ listeler
function listeler() { return depo.al("kk.listeler", []); }

function listeKaydet(liste) {
  const id = kimlik(liste.ad);
  const eski = depo.al("kk.liste." + id, null);
  depo.koy("kk.liste." + id, liste);
  const hepsi = listeler().filter((x) => x.id !== id);
  hepsi.unshift({ id, ad: liste.ad, baslik: liste.baslik, n: liste.kartlar.length, t: Date.now() });
  depo.koy("kk.listeler", hepsi);
  let yeni = liste.kartlar.length;
  if (eski) { const var_ = new Set(eski.kartlar.map(anahtar)); yeni = liste.kartlar.filter((k) => !var_.has(anahtar(k))).length; }
  return { id, guncelleme: !!eski, yeni };
}

function listeAc(id) {
  const liste = depo.al("kk.liste." + id, null);
  if (!liste) { karsilama(); return; }
  D.liste = liste; D.id = id; D.ozel.clear(); D.sira = null; D.ara = ""; D.odak = -1;
  $("#ara").value = ""; $("#ara").hidden = true;
  const ayar = depo.al("kk.ayar." + id, {});
  ayar.grup = ayar.grup || {};
  for (const a of liste.alanlar) if (!(a.k in ayar.grup)) ayar.grup[a.k] = a.rol === "wort" || a.rol === "satz" ? 1 : META.has(a.rol) ? 0 : 2;
  ayar.acik = ayar.acik || { 1: true, 2: true };
  ayar.suzgec = ayar.suzgec || "hepsi";
  ayar.dil = ayar.dil || liste.dil || "de-DE";
  ayar.tur = ayar.tur || 0;
  D.ayar = ayar;
  D.isaret = depo.al("kk.isaret." + id, {});
  depo.koy("kk.son", id);
  $("#ust").hidden = false;
  $("#listeBtn").textContent = (liste.baslik || liste.ad) + " ▾";
  document.title = (liste.baslik || liste.ad) + " — Kelime Kartı";
  ciz();
}
const ayarKaydet = () => depo.koy("kk.ayar." + D.id, D.ayar);
const isaretKaydet = () => depo.koy("kk.isaret." + D.id, D.isaret);

async function dosyalariAc(dosyalar) {
  let son = null;
  for (const f of dosyalar) {
    try {
      const liste = await KKParse.oku(f.name, new Uint8Array(await f.arrayBuffer()));
      son = yukle(liste);
    } catch (e) { bildir(`${f.name}: ${e.message}`, null, 8000); }
  }
  if (son) listeAc(son);
}

/** Okunan listeyi kaydeder, kullaniciya kisa sonuc soyler; kimligi dondurur. */
function yukle(liste) {
  if (!liste.kartlar.length) {
    bildir(`${liste.ad}: hiç kart bulunamadı` + (liste.sorunlar.length ? ` (${liste.sorunlar.length} satır biçime uymadı)` : ""), null, 8000);
    return null;
  }
  const s = liste.kartlar.length, r = listeKaydet(liste);
  let m = `${liste.ad}: ${s} kart` + (r.guncelleme ? (r.yeni ? `, ${r.yeni} yeni` : ", güncellendi") : "");
  if (liste.sorunlar.length) m += ` · ${liste.sorunlar.length} satır okunamadı (ⓘ)`;
  bildir(m);
  return r.id;
}

// ------------------------------------------------------------ gorunum
function gorunurMu(kart) {
  const i = D.isaret[anahtar(kart)] || {};
  const s = D.ayar.suzgec;
  if (s === "ok") return i.d === "ok";
  if (i.d === "ok") return false;
  if (s === "fav") return !!i.fav;
  if (s === "tekrar") return i.d === "sik" || (i.d === "seyrek" && D.ayar.tur % 3 === 1);
  return true;
}
function aramaUyar(kart) {
  if (!D.ara) return true;
  const q = KKParse.sade(D.ara);
  return Object.values(kart.f).some((h) => KKParse.sade(duz(h)).includes(q));
}
function bolgeAcik(k, g) {
  const o = D.ozel.get(k);
  return o && g in o ? o[g] : D.ayar.acik[g];
}

const ETIKETSIZ = new Set(["wort", "satz", "anlam", "ceviri", "not"]);   // bunlar renginden tanınır; digerleri adiyla
function alanHtml(a, html) {
  if (ETIKETSIZ.has(a.rol)) return `<div class="f-${a.rol}">${html}</div>`;
  return `<div class="f-x"><span class="ad">${KKParse.satirIci(a.ad)}</span>${html}</div>`;
}

function kartHtml(kart, n) {
  const k = anahtar(kart), i = D.isaret[k] || {};
  let bolgeler = "";
  for (const g of [1, 2]) {
    const ic = D.liste.alanlar.filter((a) => D.ayar.grup[a.k] === g && kart.f[a.k]).map((a) => alanHtml(a, kart.f[a.k])).join("");
    if (!ic) continue;
    const acik = bolgeAcik(k, g);
    bolgeler += `<div class="bolge${acik ? "" : " kapali"}" data-g="${g}" role="button" tabindex="0"
      aria-label="Grup ${g} ${acik ? "gizle" : "göster"}"><div class="ic">${ic}</div><div class="ort">👆 Grup ${g}</div></div>`;
  }
  const d = (x, t, s) => `<button data-a="${x}" title="${t}" class="${s ? "secili" : ""}">${{ ok: "✓", sik: "↻", seyrek: "◌", fav: "★", ses: "🔊" }[x]}</button>`;
  return `<article class="kart" data-n="${n}">
    <div class="bolgeler">${bolgeler}</div>
    <div class="isaretler">${d("ses", "Sesli oku (S)")}${d("ok", "Öğrenildi (1)", i.d === "ok")}${d("sik", "Sık tekrar (2)", i.d === "sik")}${d("seyrek", "Seyrek tekrar (3)", i.d === "seyrek")}${d("fav", "Favori (4)", i.fav)}</div>
  </article>`;
}

function ciz() {
  const ana = $("#ana");
  const kartlar = D.liste.kartlar.map((k, n) => ({ k, n })).filter((x) => gorunurMu(x.k) && aramaUyar(x.k));
  const gruplar = new Map();
  for (const x of kartlar) { if (!gruplar.has(x.k.o)) gruplar.set(x.k.o, []); gruplar.get(x.k.o).push(x); }
  if (D.sira) for (const g of gruplar.values()) g.sort((a, b) => D.sira.get(a.n) - D.sira.get(b.n));
  let html = "";
  for (const [o, xs] of gruplar) {
    const kartHtmlleri = xs.map((x) => kartHtml(x.k, x.n)).join("");
    if (!o) { html += `<div class="kartlar">${kartHtmlleri}</div>`; continue; }
    const m = /^(\d{4}-\d{2}-\d{2})\s*[—–-]?\s*(.*)$/.exec(o);
    const tarih = m ? m[1] : "", konu = m ? m[2] : o;
    html += `<section class="oturum"><div class="oturum-bas"><span class="tarih">${KKParse.satirIci(tarih)}</span>
      <h2>${KKParse.satirIci(konu)}</h2><span class="ok">▾</span></div><div class="kartlar">${kartHtmlleri}</div></section>`;
  }
  if (!kartlar.length) html = `<div class="bos-durum">${bosMetin()}</div>`;
  ana.innerHTML = html;
  D.odak = -1;
  ustGuncelle();
}
function bosMetin() {
  if (D.ara) return "Aramaya uyan kart yok.";
  return {
    tekrar: "Tekrar için işaretli kart yok.<br>Kartın yanındaki ↻ (sık) ya da ◌ (seyrek) ile işaretleyin.",
    fav: "Favori kart yok. Kartın yanındaki ★ ile işaretleyin.",
    ok: "Öğrenildi işaretli kart yok.",
  }[D.ayar.suzgec] || "Bütün kartlar öğrenildi. ✓ süzgecinden görebilir, ⚙ → Reset ile yeniden başlatabilirsiniz.";
}

function ustGuncelle() {
  const say = { tekrar: 0, fav: 0, ok: 0 };
  for (const k of D.liste.kartlar) {
    const i = D.isaret[anahtar(k)] || {};
    if (i.d === "ok") say.ok++;
    else { if (i.d === "sik" || i.d === "seyrek") say.tekrar++; if (i.fav) say.fav++; }
  }
  for (const b of $$("#suzgec button")) {
    b.classList.toggle("secili", b.dataset.s === D.ayar.suzgec);
    const sm = $("small", b); if (sm) sm.textContent = say[b.dataset.s] || "";
  }
  for (const b of $$(".grupkutu button")) b.classList.toggle("secili", D.ayar.acik[b.dataset.grup] === (b.dataset.acik === "1") && !ozelVar(b.dataset.grup));
  $("#bilgiBtn").classList.toggle("nokta", D.liste.sorunlar.length > 0);
}
function ozelVar(g) { for (const o of D.ozel.values()) if (g in o) return true; return false; }

// ------------------------------------------------------------ kart olaylari
$("#ana").addEventListener("click", (e) => {
  const bas = e.target.closest(".oturum-bas");
  if (bas) { bas.parentElement.classList.toggle("kapali"); return; }
  const kartEl = e.target.closest(".kart");
  if (!kartEl) return;
  const kart = D.liste.kartlar[+kartEl.dataset.n];
  const btn = e.target.closest("button[data-a]");
  if (btn) { isaretle(kart, kartEl, btn.dataset.a); return; }
  const b = e.target.closest(".bolge");
  if (b) { if (window.getSelection && String(window.getSelection()).length) return; bolgeCevir(kart, kartEl, +b.dataset.g); }
});
$("#ana").addEventListener("keydown", (e) => {
  const b = e.target.closest(".bolge");
  if (b && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault(); e.stopPropagation();
    const kartEl = b.closest(".kart");
    bolgeCevir(D.liste.kartlar[+kartEl.dataset.n], kartEl, +b.dataset.g);
  }
});

function bolgeCevir(kart, kartEl, g) {
  const k = anahtar(kart);
  const o = D.ozel.get(k) || {};
  o[g] = !bolgeAcik(k, g);
  D.ozel.set(k, o);
  const b = $(`.bolge[data-g="${g}"]`, kartEl);
  if (b) { b.classList.toggle("kapali", !o[g]); b.setAttribute("aria-label", `Grup ${g} ${o[g] ? "gizle" : "göster"}`); }
  ustGuncelle();
}

/** ✓ ↻ ◌ ★ isaretini degistirir; yeni isareti dondurur. */
function isaretDegis(kart, a) {
  const k = anahtar(kart);
  const i = { ...(D.isaret[k] || {}) };
  if (a === "fav") i.fav = !i.fav || undefined;
  else i.d = i.d === a ? undefined : a;
  if (!i.d) delete i.d; if (!i.fav) delete i.fav;
  if (Object.keys(i).length) D.isaret[k] = i; else delete D.isaret[k];
  isaretKaydet();
  return i;
}
function isaretle(kart, kartEl, a) {
  if (a === "ses") { oku(kart); return; }
  const k = anahtar(kart);
  const once = JSON.stringify(D.isaret[k] || {});
  const i = isaretDegis(kart, a);
  for (const x of ["ok", "sik", "seyrek"]) $(`button[data-a="${x}"]`, kartEl).classList.toggle("secili", i.d === x);
  $(`button[data-a="fav"]`, kartEl).classList.toggle("secili", !!i.fav);
  if (!gorunurMu(kart) && (a === "ok" || D.ayar.suzgec === "ok")) {
    kartEl.classList.add("gidiyor");
    setTimeout(() => { kartEl.remove(); if (!$(".kart")) ciz(); }, 250);
    bildir(a === "ok" && i.d === "ok" ? `“${k}” öğrenildi; Reset'e kadar gösterilmez.` : `“${k}” geri alındı.`, ["Geri al", () => {
      const eski = JSON.parse(once);
      if (Object.keys(eski).length) D.isaret[k] = eski; else delete D.isaret[k];
      isaretKaydet(); ciz();
    }]);
  }
  ustGuncelle();
}

// ------------------------------------------------------------ sesli okuma
// Ses secimi cihaz basinadir (kk.ses = {dil: voiceURI}); liste ayari degildir.
// Cevrimici ses (localService false) internet ister; yoksa ya da hata verirse ayni dilin cihaz sesine dusulur.
const SES_ORNEK = { de: "Guten Morgen! Wie geht es dir heute?", en: "Good morning! How are you today?",
  es: "¡Buenos días! ¿Cómo estás hoy?", fr: "Bonjour ! Comment vas-tu aujourd'hui ?",
  it: "Buongiorno! Come stai oggi?", nl: "Goedemorgen! Hoe gaat het vandaag?", tr: "Günaydın! Bugün nasılsın?" };
const dilSesleri = (dil) => ("speechSynthesis" in window ? speechSynthesis.getVoices() : [])
  .filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(dil.slice(0, 2).toLowerCase()));
const cihazSesi = (dil) => {
  const l = dilSesleri(dil).filter((v) => v.localService);
  return l.find((v) => v.lang.replace("_", "-") === dil && v.default) || l.find((v) => v.lang.replace("_", "-") === dil) || l[0] || null;
};
// Otomatik: dilde cevrimici ses yoksa ses verilmez, yalniz dil verilir; sistem o dil icin secili sesi kullanir.
// Safari/iPhone (WebKit) sayfaya dil basina tek, sade ses gosterir (14.10.2026 olcum: Mac'te 11 Almanca ses, sayfada 1);
// dil verilince WebKit sistemin o dil icin sectigi sesi aliyor (AVSpeechSynthesisVoice(language:) Mac'te Yannick (Enhanced)).
// Cevrimici ses varsa (Edge) internet istememek icin cihaz sesi acikca secilir.
function sesBul(dil) {
  const uri = (depo.al("kk.ses", {}) || {})[dil];
  const secili = uri && dilSesleri(dil).find((v) => v.voiceURI === uri);
  if (secili && !secili.localService && navigator.onLine === false) return { ses: cihazSesi(dil), dustu: true };
  if (secili) return { ses: secili, dustu: false };
  return { ses: dilSesleri(dil).some((v) => !v.localService) ? cihazSesi(dil) : null, dustu: false };
}
function seslendir(metin, dil) {
  if (!("speechSynthesis" in window)) { bildir("Bu tarayıcıda sesli okuma yok."); return; }
  speechSynthesis.cancel();
  const soyle = (ses, ikinci) => {
    const u = new SpeechSynthesisUtterance(metin);
    u.lang = dil; u.rate = 0.95;
    if (ses) u.voice = ses;
    u.onerror = (e) => {
      if (ikinci || !ses || ses.localService || e.error === "interrupted" || e.error === "canceled") return;
      bildir("Çevrimiçi ses kullanılamadı; cihaz sesiyle okunuyor.");
      soyle(cihazSesi(dil), true);
    };
    speechSynthesis.speak(u);
  };
  const { ses, dustu } = sesBul(dil);
  if (dustu) bildir("İnternet yok; cihaz sesiyle okunuyor.");
  soyle(ses, dustu);
}
function oku(kart) {
  seslendir([kart.f.wort, kart.f.satz].filter(Boolean).map(duz).join(". "), D.ayar.dil);
}
const kac = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function sesNotu(dil) {
  const n = dilSesleri(dil).length;
  return n !== 1 ? "" : "Bu tarayıcı sayfalara bu dil için yalnız bir ses gösteriyor (Safari ve iPhone'daki bütün tarayıcılar böyle). “Otomatik” sistem ayarlarında bu dil için seçili sesi kullanır: Mac'te Sistem Ayarları → Erişilebilirlik → Seslendirilen İçerik → Sistem sesi; iPhone'da Ayarlar → Erişilebilirlik → Seslendirilen İçerik → Sesler.";
}
function sesSecenekleri(dil) {
  const uri = (depo.al("kk.ses", {}) || {})[dil] || "";
  const l = dilSesleri(dil).sort((a, b) => (b.localService - a.localService) || a.name.localeCompare(b.name));
  const ad = (v) => `${v.name}${v.lang.replace("_", "-") !== dil ? ` (${v.lang})` : ""}${v.localService ? "" : " · çevrimiçi"}`;
  return `<option value="">Otomatik: sistemin sesi</option>` + l.map((v) =>
    `<option value="${kac(v.voiceURI)}" ${v.voiceURI === uri ? "selected" : ""}>${kac(ad(v))}</option>`).join("");
}

// ------------------------------------------------------------ ust cubuk
$("#suzgec").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  D.ayar.suzgec = b.dataset.s;
  if (b.dataset.s === "tekrar") D.ayar.tur++;
  ayarKaydet(); ciz(); scrollTo(0, 0);
});
$$(".grupkutu button").forEach((b) => b.addEventListener("click", () => {
  const g = b.dataset.grup;
  D.ayar.acik[g] = b.dataset.acik === "1";
  for (const o of D.ozel.values()) delete o[g];
  ayarKaydet();
  for (const el of $$(`.bolge[data-g="${g}"]`)) el.classList.toggle("kapali", !D.ayar.acik[g]);
  ustGuncelle();
}));
$("#araBtn").addEventListener("click", () => {
  const a = $("#ara"); a.hidden = !a.hidden;
  if (!a.hidden) a.focus(); else if (D.ara) { D.ara = ""; a.value = ""; ciz(); }
});
$("#ara").addEventListener("input", (e) => { D.ara = e.target.value.trim(); ciz(); });
$("#karBtn").addEventListener("click", () => {
  D.sira = new Map(D.liste.kartlar.map((_, n) => [n, Math.random()]));
  ciz();
  bildir("Kartlar karıştırıldı.", ["Sırayı geri al", () => { D.sira = null; ciz(); }]);
});
$("#listeBtn").addEventListener("click", listePaneli);
$("#ayarBtn").addEventListener("click", ayarPaneli);
$("#bilgiBtn").addEventListener("click", bilgiPaneli);
$("#calisBtn").addEventListener("click", calisPaneli);
for (const d of $$("dialog")) d.addEventListener("click", (e) => { if (e.target === d) d.close(); });

// ------------------------------------------------------------ klavye
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select, textarea") || $("dialog[open]") || !D.liste) {
    if (e.key === "Escape" && e.target.id === "ara") { e.target.blur(); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const kartlar = $$(".kart");
  const odakla = (n) => {
    if (!kartlar.length) return;
    D.odak = Math.max(0, Math.min(kartlar.length - 1, n));
    kartlar.forEach((k, i) => k.classList.toggle("odak", i === D.odak));
    kartlar[D.odak].scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const el = kartlar[D.odak];
  const kart = el && D.liste.kartlar[+el.dataset.n];
  switch (e.key) {
    case "ArrowDown": case "j": e.preventDefault(); odakla(D.odak + 1); break;
    case "ArrowUp": case "k": e.preventDefault(); odakla(D.odak - 1); break;
    case " ": if (kart) { e.preventDefault(); bolgeCevir(kart, el, e.shiftKey ? 1 : 2); } break;
    case "1": if (kart) isaretle(kart, el, "ok"); break;
    case "2": if (kart) isaretle(kart, el, "sik"); break;
    case "3": if (kart) isaretle(kart, el, "seyrek"); break;
    case "4": if (kart) isaretle(kart, el, "fav"); break;
    case "s": if (kart) oku(kart); break;
    case "/": e.preventDefault(); $("#ara").hidden = false; $("#ara").focus(); break;
    case "c": calisPaneli(); break;
  }
});

// ------------------------------------------------------------ paneller
function panelAc(id, html) {
  const d = $("#" + id);
  $(".panel", d).innerHTML = `<button class="ikon kapat" data-kapat>✕</button>` + html;
  $("[data-kapat]", d).onclick = () => d.close();
  if (!d.open) d.showModal();
  return d;
}

function ayarPaneli() {
  const a = D.liste.alanlar;
  const bos = (k) => D.liste.kartlar.filter((x) => !x.f[k]).length;
  const alanSatir = (x) => `<div class="alan-satir"><span class="ad">${KKParse.satirIci(x.ad)}
      ${bos(x.k) ? `<span class="bos">· ${bos(x.k)} boş</span>` : ""}</span>
    <span class="segment" data-alan="${x.k}">${[[1, "Grup 1"], [2, "Grup 2"], [0, "Kapalı"]].map(([g, t]) =>
      `<button data-g="${g}" class="${D.ayar.grup[x.k] === g ? "secili" : ""}">${t}</button>`).join("")}</span></div>`;
  const diller = [["de-DE", "Almanca"], ["en-GB", "İngilizce"], ["es-ES", "İspanyolca"], ["fr-FR", "Fransızca"],
    ["it-IT", "İtalyanca"], ["nl-NL", "Hollandaca"], ["tr-TR", "Türkçe"]];
  const mac = depo.al("kk.mac", null);
  const d = panelAc("ayarPanel", `<h3>Ayarlar</h3>
    <h4>Alanlar ve gruplar</h4>${a.map(alanSatir).join("")}
    <div class="dugmeler" style="margin-top:10px"><button id="degisBtn">⇄ Grupları değiştir</button></div>
    <h4>Sesli okuma</h4>
    <div class="ses-satir"><select id="dilSec" aria-label="Dil">${diller.map(([v, t]) => `<option value="${v}" ${v === D.ayar.dil ? "selected" : ""}>${t}</option>`).join("")}</select>
      <select id="sesSec" aria-label="Ses">${sesSecenekleri(D.ayar.dil)}</select>
      <button id="sesDene">▶ Dene</button></div>
    <p class="soluk" id="sesNot"></p>
    <p class="soluk">🔊 kelimeyi ve örnek cümleyi okur. Cihaz sesleri internetsiz çalışır; ▶ Dene seçili sesle örnek cümle okur. “Çevrimiçi” sesler daha doğal olabilir ama internet ister; internet yoksa cihaz sesi kullanılır. Ses seçimi bu cihaz ve tarayıcı için geçerlidir.</p>
    <h4>İşaretler</h4>
    <div class="dugmeler"><button id="disaBtn">Dışa aktar</button><button id="iceBtn">İçe aktar</button><button id="resetBtn">Reset</button></div>
    <p class="soluk">Dışa/içe aktarma işaretleri başka bir cihaza ya da tarayıcıya taşır. Reset bu listedeki ✓ ↻ ◌ işaretlerini siler; ★ favoriler kalır.</p>
    ${hataMetni().n ? `<h4>Hatalı testler (${hataMetni().n})</h4>
      <div class="dugmeler"><button id="hataKopyala">Kopyala</button><button id="hataTemizle">Temizle</button></div>
      <p class="soluk">⚑ ile işaretlediğiniz testler. Kopyalayıp listeyi hazırlayan yapay zekâya yapıştırın; düzeltilmiş listeyi yeniden açınca test yenilenir.</p>` : ""}
    ${mac ? `<h4>Mac'te açan tarayıcı</h4><p>${KKParse.satirIci(mac)} · <a href="kelimekarti://tarayici" id="tarayiciLink">Değiştir</a></p>
      <p class="soluk">Finder'daki “Kelime kartı yap” (⌃⌥⌘L) bu tarayıcıyı açar.</p>` : ""}
    <h4>Liste</h4>
    <div class="dugmeler"><button id="kaldirBtn">Bu listeyi kaldır</button></div>
    <p class="soluk">Kelime Kartı ${SURUM} · Dosyalar cihazdan çıkmaz; her şey bu tarayıcıda saklanır.</p>`);
  $$(".segment[data-alan]", d).forEach((s) => s.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    D.ayar.grup[s.dataset.alan] = +b.dataset.g;
    $$("button", s).forEach((x) => x.classList.toggle("secili", x === b));
    ayarKaydet(); ciz();
  }));
  $("#degisBtn", d).onclick = () => {
    for (const k in D.ayar.grup) if (D.ayar.grup[k]) D.ayar.grup[k] = 3 - D.ayar.grup[k];
    D.ayar.acik = { 1: D.ayar.acik[2], 2: D.ayar.acik[1] };
    D.ozel.clear(); ayarKaydet(); ciz(); ayarPaneli();
  };
  $("#dilSec", d).onchange = (e) => { D.ayar.dil = e.target.value; ayarKaydet(); $("#sesSec", d).innerHTML = sesSecenekleri(D.ayar.dil); $("#sesNot", d).textContent = sesNotu(D.ayar.dil); };
  $("#sesNot", d).textContent = sesNotu(D.ayar.dil);
  $("#sesSec", d).onchange = (e) => {
    const s = depo.al("kk.ses", {}) || {};
    if (e.target.value) s[D.ayar.dil] = e.target.value; else delete s[D.ayar.dil];
    depo.koy("kk.ses", s);
  };
  $("#sesDene", d).onclick = () => seslendir(SES_ORNEK[D.ayar.dil.slice(0, 2)] || "1, 2, 3", D.ayar.dil);
  // ses listesi bazi tarayicilarda gec gelir (Chrome, Edge): gelince secenekleri tazele
  if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => {
    const el = $("#sesSec"); if (el && $("#ayarPanel").open) { el.innerHTML = sesSecenekleri(D.ayar.dil); $("#sesNot").textContent = sesNotu(D.ayar.dil); }
  };
  $("#disaBtn", d).onclick = isaretDisa;
  if ($("#hataKopyala", d)) {
    $("#hataKopyala", d).onclick = async () => {
      try { await navigator.clipboard.writeText(hataMetni().metin); bildir("Hatalı testler panoya kopyalandı."); }
      catch (e) { prompt("Kopyalayın:", hataMetni().metin); }
    };
    $("#hataTemizle", d).onclick = () => {
      const h = hataListesi(); for (const k of Object.keys(h)) if (h[k].liste === D.id) delete h[k];
      depo.koy("kk.hata", h); ayarPaneli(); bildir("Hatalı test işaretleri temizlendi.");
    };
  }
  $("#iceBtn", d).onclick = isaretIce;
  $("#resetBtn", d).onclick = () => {
    if (!confirm("Bu listedeki öğrenildi, sık ve seyrek işaretleri silinsin mi?\nFavoriler kalır.")) return;
    for (const k of Object.keys(D.isaret)) {
      const i = D.isaret[k]; delete i.d;
      if (!i.fav) delete D.isaret[k];
    }
    isaretKaydet(); ciz(); d.close(); bildir("İşaretler sıfırlandı.");
  };
  $("#kaldirBtn", d).onclick = () => {
    if (!confirm(`“${D.liste.baslik || D.liste.ad}” listesi kaldırılsın mı?\nİşaretler de silinir. Dosyanızın kendisine dokunulmaz.`)) return;
    listeKaldir(D.id); d.close();
  };
}

function listeKaldir(id) {
  depo.sil("kk.liste." + id); depo.sil("kk.ayar." + id); depo.sil("kk.isaret." + id);
  const kalan = listeler().filter((x) => x.id !== id);
  depo.koy("kk.listeler", kalan);
  if (D.id === id) { D.liste = null; kalan.length ? listeAc(kalan[0].id) : karsilama(); }
}

function bilgiPaneli() {
  const L = D.liste, n = L.kartlar.length;
  const oturum = new Set(L.kartlar.map((k) => k.o).filter(Boolean)).size;
  const eksik = L.kartlar.filter((k) => L.alanlar.some((a) => !k.f[a.k])).length;
  const say = { ok: 0, sik: 0, seyrek: 0, fav: 0 };
  for (const k of L.kartlar) { const i = D.isaret[anahtar(k)] || {}; if (i.d) say[i.d]++; if (i.fav) say.fav++; }
  const testSayisi = L.kartlar.reduce((s, k) => s + (k.t ? k.t.length : 0), 0);
  panelAc("bilgiPanel", `<h3>${KKParse.satirIci(L.baslik || L.ad)}</h3>
    <p class="soluk">${KKParse.satirIci(L.ad)}</p>
    <p><b>${n}</b> kart${oturum ? ` · ${oturum} oturum` : ""}${eksik ? ` · ${eksik} kartta boş alan var` : ""}</p>
    <p>✓ ${say.ok} öğrenildi · ↻ ${say.sik} sık · ◌ ${say.seyrek} seyrek · ★ ${say.fav} favori</p>
    <p class="soluk">↻ süzgeci sık tekrar kartlarını her seferinde, seyrek tekrar kartlarını üç açılışta bir gösterir.</p>
    ${L.sorunlar.length ? `<h4>Okunamayan satırlar (${L.sorunlar.length})</h4>
      <p class="soluk">Bu satırlar karta alınmadı; geri kalanı çalışılabilir. Dosyada düzeltip yeniden açarsanız eklenir.</p>
      ${L.sorunlar.map((s) => `<div class="sorun"><b>${KKParse.satirIci(String(s.satir))}</b>: ${KKParse.satirIci(s.neden)}</div>`).join("")}` : ""}
    <h4>Klavye</h4>
    <p class="soluk">↑ ↓ kart seç · Boşluk Grup 2 aç/kapa · ⇧ Boşluk Grup 1 · 1 öğrenildi · 2 sık · 3 seyrek · 4 favori · S sesli oku · / ara · C çalış</p>
    <p class="soluk">Çalışırken: Boşluk cevabı aç · 1 ya da ${kac(BS_ETIKET)} bildim/doğruydu · 2 ya da V bilemedim/yanlıştı · 1–4 ya da A S D F seçenekler · Enter kontrol/sonraki · Esc çık</p>
    ${testSayisi ? `<p>${testSayisi} test</p>` : ""}`);
}

function listePaneli() {
  const L = listeler();
  const d = panelAc("listePanel", `<h3>Listeler</h3>
    ${L.map((x) => `<div class="liste-satir"><span class="ad" data-id="${x.id}"><b>${KKParse.satirIci(x.baslik || x.ad)}</b>
      <small>${KKParse.satirIci(x.ad)} · ${x.n} kart</small></span>
      <button class="ikon" data-sil="${x.id}" title="Listeyi kaldır">🗑</button></div>`).join("")}
    <div class="dugmeler" style="margin-top:14px"><button class="ana" id="yeniBtn">＋ Dosya aç</button></div>
    <p class="soluk">${KKParse.DESTEK.map((x) => "." + x).join(" ")} · Aynı adlı dosyayı yeniden açmak listeyi günceller; işaretler kalır.</p>`);
  $$(".liste-satir .ad", d).forEach((s) => (s.onclick = () => { d.close(); listeAc(s.dataset.id); }));
  $$("[data-sil]", d).forEach((b) => (b.onclick = () => {
    const x = L.find((y) => y.id === b.dataset.sil);
    if (!confirm(`“${x.baslik || x.ad}” listesi kaldırılsın mı?\nİşaretler de silinir. Dosyanızın kendisine dokunulmaz.`)) return;
    listeKaldir(x.id); listeler().length ? listePaneli() : d.close();
  }));
  $("#yeniBtn", d).onclick = () => { d.close(); $("#dosya").click(); };
}

// ------------------------------------------------------------ isaret aktarma
function isaretDisa() {
  const veri = { uygulama: "kelime-karti", surum: 1, tarih: new Date().toISOString(), isaretler: {} };
  for (const x of listeler()) { const i = depo.al("kk.isaret." + x.id, {}); if (Object.keys(i).length) veri.isaretler[x.id] = i; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(veri, null, 1)], { type: "application/json" }));
  a.download = `kelime-karti-isaretler-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  bildir(`${Object.keys(veri.isaretler).length} listenin işaretleri dışa aktarıldı.`);
}
function isaretIce() {
  const g = document.createElement("input"); g.type = "file"; g.accept = ".json,application/json";
  g.onchange = async () => {
    try {
      const veri = JSON.parse(await g.files[0].text());
      if (veri.uygulama !== "kelime-karti" || !veri.isaretler) throw new Error("bu bir Kelime Kartı işaret dosyası değil");
      let n = 0;
      for (const [id, isaretler] of Object.entries(veri.isaretler)) {
        const mevcut = depo.al("kk.isaret." + id, {});
        Object.assign(mevcut, isaretler); n += Object.keys(isaretler).length;
        depo.koy("kk.isaret." + id, mevcut);
      }
      D.isaret = depo.al("kk.isaret." + D.id, {});
      ciz(); $("#ayarPanel").close();
      bildir(`${n} işaret alındı.`);
    } catch (e) { bildir("İçe aktarılamadı: " + e.message, null, 8000); }
  };
  g.click();
}

// ------------------------------------------------------------ karsilama ve ornek
function karsilama() {
  $("#ust").hidden = true;
  document.title = "Kelime Kartı";
  $("#ana").innerHTML = `<div class="karsilama"><h1>🧠 Kelime Kartı</h1>
    <p>Kelime listenizi üstü örtülü kartlara çevirir. Dokununca açılır; öğrendiklerinizi işaretlersiniz.</p>
    <p><button class="ana" id="ilkAc">Dosya aç</button><button id="ornekAc">Örnek listeyi aç</button></p>
    <p class="soluk" style="font-size:13px">${KKParse.DESTEK.map((x) => "." + x).join(" ")}<br>
    Dosya cihazınızdan çıkmaz; tarayıcıda okunur ve burada saklanır.<br>
    Telefonda: paylaş menüsünden “Ana Ekrana Ekle” ile uygulama gibi açılır.</p></div>`;
  $("#ilkAc").onclick = () => $("#dosya").click();
  $("#ornekAc").onclick = async () => {
    const l = await KKParse.oku("Ornek_Almanca.md", new TextEncoder().encode(ORNEK));
    const id = yukle(l); if (id) listeAc(id);
  };
}
const ORNEK = `# Almanca — Örnek liste

## 2026-10-14 — Günlük hayat

### ruhig
- **Anlam:** sakin, sessiz
- **Cümle içinde kullanımı:** *Ich bin meistens ruhig, auch wenn es stressig wird.*
  *Stresli olsa bile genelde sakinimdir.*
- **Eş anlamlı:** gelassen
- **Zıt anlamlı:** unruhig; nervös
- **Çeldirici Anlam:** durgun; çekingen; yavaş
- **Test:** Cümlede yerine | *Ich bin meistens ___.* Hangileri olur? | gelassen; entspannt | leise; still | „leise“ yalnız ses için; „still“ ortam ya da kişinin konuşmaması için, mizaç için değil
- **Test:** Boşluk | *Mein Kollege ist ___, er wird nie laut.* | ruhig | | Sıfat yüklemde çekimsiz kalır

### jemandem Bescheid geben
- **Anlam:** birine haber vermek
- **Cümle içinde kullanımı:** *Ich gebe dir Bescheid, sobald ich fertig bin.*
  *Bitirir bitirmez sana haber veririm.*
- **Kısa açıklama:** \`jemandem\` Dativ alır.

### der Termin
- **Anlam:** randevu
- **Cümle içinde kullanımı:** *Ich habe morgen einen Termin beim Arzt.*
  *Yarın doktorda randevum var.*
- **Eş anlamlı:** die Verabredung
- **Test:** Artikel | ___ Termin | der | die; das | Termin erkektir: der Termin, die Termine
`;

// ------------------------------------------------------------ tek kart modu (calis)
// Kipler: acbak (cevabi ac, Bildim/Bilemedim), yaz (cevabi yaz, Kontrol, kullanici karar verir), sec (dort secenek,
// uygulama degerlendirir), test (dosyadaki yapay zeka testleri). Yanlis -> kart "sik" (↻). Soru Grup 1, cevap Grup 2;
// yon ⚙ -> ⇄ ile degisir. Tuslar FIZIKSEL konumla (Dosya Inceleme ile ayni, 09.10.2026): \ (e.code Backslash; Almanca
// klavyede #) = Bildim, V = Bilemedim, A S D F G H J K = secenekler. Rakamlar da calisir (kullanici karari 15.10.2026,
// harfler herkese tanidik gelmeyebilir): 1 Bildim, 2 Bilemedim, 1-8 secenekler.
const META = new Set(["dogru", "celAnlam", "celWort"]);
const SECENEK_TUS = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK"];
const SECENEK_HARF = ["a", "s", "d", "f", "g", "h", "j", "k"];
const RAKAM_TUS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8"];
const rakamNo = (e) => { const i = RAKAM_TUS.indexOf(e.code); if (i >= 0) return i; return e.key && e.key.length === 1 ? "12345678".indexOf(e.key) : -1; };
let BS_ETIKET = "\\";
(async () => { try { const m = await navigator.keyboard.getLayoutMap(), c = m.get("Backslash"); if (c) BS_ETIKET = c; } catch (e) { /* Safari: yok */ } })();
const C = { acik: false };
const KIP_ADI = { acbak: "Aç-bak", yaz: "Yaz", sec: "Seç", test: "Test" };

const karistir = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const listeAyir = (h) => duz(h).split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let o = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const y = [i];
    for (let j = 1; j <= n; j++) y[j] = Math.min(o[j] + 1, y[j - 1] + 1, o[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    o = y;
  }
  return o[n];
}
const benzerlik = (a, b) => { a = KKParse.sade(a); b = KKParse.sade(b); return 1 - lev(a, b) / Math.max(1, a.length, b.length); };

function calisKartlari() {
  const xs = D.liste.kartlar.map((k, n) => ({ k, n })).filter((x) => gorunurMu(x.k) && aramaUyar(x.k));
  if (D.sira) xs.sort((a, b) => D.sira.get(a.n) - D.sira.get(b.n));
  return xs;
}
function testTurleri(xs) {
  const say = new Map();
  for (const x of xs) for (const t of x.k.t || []) say.set(t.tur, (say.get(t.tur) || 0) + 1);
  return [...say.entries()];
}
/** Cevap alani: Grup 2'deki ilk dolu alan (META haric). */
function hedefAlan(kart) {
  return D.liste.alanlar.find((a) => D.ayar.grup[a.k] === 2 && kart.f[a.k] && !META.has(a.rol)) || null;
}
function grupHtml(kart, g) {
  return D.liste.alanlar.filter((a) => D.ayar.grup[a.k] === g && kart.f[a.k] && !META.has(a.rol)).map((a) => alanHtml(a, kart.f[a.k])).join("");
}

// ---- secenekler: once dosyadaki celdiriciler, eksikse listedeki kartlardan benzerlikle
function kelimeTuru(s) {
  const t = s.trim();
  if (/^(der|die|das|ein|eine)\s/i.test(t)) return "ad";
  if (/\S+m[ae]k$/i.test(t)) return "fiil";
  if (/^[a-zäöüß]+(en|ern|eln)$/.test(t) || /^(sich|jemandem|jemanden|etw)\b/i.test(t)) return "fiil";
  if (/^[A-ZÄÖÜ]/.test(t) && !/\s/.test(t)) return "ad";
  return /\s/.test(t) ? "kalip" : "diger";
}
function benzerSecenekler(kart, alan, dogru, adet) {
  const d = KKParse.sade(dogru), dk = new Set(d.split(" ").filter((x) => x.length >= 3)), tur = kelimeTuru(dogru);
  const adaylar = [];
  for (const k of D.liste.kartlar) {
    if (k === kart || !k.f[alan.k]) continue;
    const m = duz(k.f[alan.k]), s = KKParse.sade(m);
    if (!s || s === d || s.split(" ").some((x) => dk.has(x))) continue;        // ikinci dogru olmasin
    const puan = (kelimeTuru(m) === tur ? 2 : 0) + 2 * benzerlik(m, dogru)
      + Math.min(m.length, dogru.length) / Math.max(m.length, dogru.length) + (k.o && k.o === kart.o ? 0.5 : 0);
    adaylar.push({ m, puan });
  }
  adaylar.sort((a, b) => b.puan - a.puan);
  const tekil = []; for (const a of adaylar) if (!tekil.some((x) => KKParse.sade(x) === KKParse.sade(a.m))) tekil.push(a.m);
  return karistir(tekil.slice(0, Math.max(adet * 2, 6))).slice(0, adet);
}
function secenekKur(kart) {
  const alan = hedefAlan(kart);
  if (!alan) return null;
  const dogru = duz(kart.f[alan.k]);
  const celK = alan.rol === "anlam" ? "celAnlam" : alan.rol === "wort" ? "celWort" : null;
  let yanlis = celK && kart.f[celK] ? listeAyir(kart.f[celK]).filter((x) => KKParse.sade(x) !== KKParse.sade(dogru)) : [];
  yanlis = karistir(yanlis).slice(0, 3);
  const dosyadan = yanlis.length;
  if (yanlis.length < 3) yanlis = yanlis.concat(benzerSecenekler(kart, alan, dogru, 3 - yanlis.length).filter((x) => !yanlis.includes(x)));
  return { alan, dogru: [dogru], secenekler: karistir([dogru, ...yanlis]), dosyadan };
}

// ---- yazilan cevabin karsilastirilmasi: harf harf hizalama
function adaylar(kart, alan) {
  const tam = duz(kart.f[alan.k]);
  const l = [tam, ...tam.split(/\s*[,;/]\s*/), ...(kart.f.dogru ? listeAyir(kart.f.dogru) : [])];
  return [...new Set(l.map((x) => x.trim()).filter(Boolean))];
}
function enYakin(cevap, liste) {
  let en = liste[0], p = -1;
  for (const a of liste) { const b = benzerlik(cevap, a); if (b > p) { p = b; en = a; } }
  return en;
}
function farkHtml(cevap, dogru) {
  const a = [...cevap], b = [...dogru], m = a.length, n = b.length;
  const al = (x) => x.toLocaleLowerCase("de");
  const D2 = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i ? (j ? 0 : i) : j)));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    D2[i][j] = Math.min(D2[i - 1][j] + 1, D2[i][j - 1] + 1, D2[i - 1][j - 1] + (al(a[i - 1]) === al(b[j - 1]) ? (a[i - 1] === b[j - 1] ? 0 : 0.1) : 1));
  const ops = []; let i = m, j = n;
  while (i || j) {
    if (i && j && D2[i][j] === D2[i - 1][j - 1] + (al(a[i - 1]) === al(b[j - 1]) ? (a[i - 1] === b[j - 1] ? 0 : 0.1) : 1)) {
      ops.push(a[i - 1] === b[j - 1] ? ["=", a[i - 1]] : al(a[i - 1]) === al(b[j - 1]) ? ["buyuk", a[i - 1]] : ["yanlis", a[i - 1]]); i--; j--;
    } else if (i && D2[i][j] === D2[i - 1][j] + 1) { ops.push(["fazla", a[i - 1]]); i--; }
    else { ops.push(["eksik", b[j - 1]]); j--; }
  }
  ops.reverse();
  const noktaMi = (c) => !/[\p{L}\p{N}]/u.test(c);
  let hata = 0;
  const html = ops.map(([t, c]) => {
    if (t === "=") return kac(c);
    hata++;
    const nk = noktaMi(c) ? " h-nokta" : "";
    const g = c === " " ? "␣" : kac(c);
    if (t === "buyuk") return `<span class="h-buyuk${nk}" title="büyük/küçük harf">${g}</span>`;
    if (t === "yanlis") return `<b class="h-yanlis${nk}" title="yanlış harf">${g}</b>`;
    if (t === "fazla") return `<s class="h-fazla${nk}" title="fazla">${g}</s>`;
    return `<u class="h-eksik${nk}" title="eksik">${g}</u>`;
  }).join("");
  return { html, hata };
}

// ---- oturum
function calisPaneli() {
  const xs = calisKartlari();
  const turler = testTurleri(xs);
  const kapali = new Set(D.ayar.testKapali || []);
  const testSay = turler.reduce((s, [t, n]) => s + (kapali.has(t) ? 0 : n), 0);
  const kip = (k, ad, aciklama, kapat) => `<button class="kip${kapat ? "" : " ana"}" data-kip="${k}" ${kapat ? "disabled" : ""}>
    <b>${ad}</b><small>${aciklama}</small></button>`;
  const d = panelAc("calisPanel", `<h3>Çalış</h3>
    <p class="soluk">${xs.length} kart (şu anki süzgeç${D.ara ? " ve arama" : ""}). Soru Grup 1, cevap Grup 2; yönü ⚙ → ⇄ değiştirir.</p>
    <div class="kipler">
      ${kip("acbak", "Aç-bak", `cevabı aç · 1 ya da ${BS_ETIKET} bildim · 2 ya da V bilemedim`, !xs.length)}
      ${kip("yaz", "Yaz", "cevabı yaz · Enter kontrol · kararı siz verirsiniz", !xs.length)}
      ${kip("sec", "Seç", "dört seçenek · 1–4 ya da A S D F", xs.length < 2)}
      ${kip("test", `Test${testSay ? ` (${testSay})` : ""}`, turler.length ? "listedeki testler" : "bu listede test yok", !testSay)}
    </div>
    ${turler.length ? `<h4>Test türleri</h4><div class="turler">${turler.map(([t, n]) =>
      `<label><input type="checkbox" data-tur="${kac(t)}" ${kapali.has(t) ? "" : "checked"}> ${kac(t)} <small>${n}</small></label>`).join("")}</div>` : ""}
    <h4>Sıra</h4>
    <label><input type="checkbox" id="calisKar" ${D.ayar.calisKaristir === false ? "" : "checked"}> Karıştır</label>`);
  $$("[data-tur]", d).forEach((c) => (c.onchange = () => {
    const s = new Set(D.ayar.testKapali || []);
    if (c.checked) s.delete(c.dataset.tur); else s.add(c.dataset.tur);
    D.ayar.testKapali = [...s]; ayarKaydet(); calisPaneli();
  }));
  $("#calisKar", d).onchange = (e) => { D.ayar.calisKaristir = e.target.checked; ayarKaydet(); };
  $$("[data-kip]", d).forEach((b) => (b.onclick = () => { d.close(); calisBasla(b.dataset.kip); }));
}

function calisBasla(kip, ogeler) {
  const xs = calisKartlari();
  if (!ogeler) {
    const kapali = new Set(D.ayar.testKapali || []);
    ogeler = kip === "test"
      ? xs.flatMap((x) => (x.k.t || []).filter((t) => !kapali.has(t.tur)).map((t) => ({ kart: x.k, test: t })))
      : xs.filter((x) => kip === "acbak" || hedefAlan(x.k)).map((x) => ({ kart: x.k }));
    if (D.ayar.calisKaristir !== false) ogeler = karistir(ogeler);
  }
  if (!ogeler.length) { bildir("Çalışılacak kart yok."); return; }
  Object.assign(C, { acik: true, kip, ogeler, i: 0, dogru: 0, yanlis: 0, yanlislar: [] });
  D.ayar.calisKip = kip; ayarKaydet();
  $("#calis").hidden = false; document.body.classList.add("calisiyor");
  soruKur();
}
function calisKapat() {
  C.acik = false; $("#calis").hidden = true; document.body.classList.remove("calisiyor");
  if (window.speechSynthesis) speechSynthesis.cancel();
  ciz();
}
function soruKur() {
  const o = C.ogeler[C.i];
  C.o = o; C.durum = "soru"; C.secim = new Set(); C.cevap = "";
  o.sec = null;
  if (C.kip === "sec") o.sec = secenekKur(o.kart);
  if (C.kip === "test" && o.test.yanlis.length) o.sec = { dogru: o.test.dogru, secenekler: karistir([...o.test.dogru, ...o.test.yanlis]).slice(0, 8) };
  calisCiz();
}
const yazmaKipi = () => C.kip === "yaz" || (C.kip === "test" && !C.o.test.yanlis.length);
const coklu = () => C.o.sec && C.o.sec.dogru.length > 1;

function calisCiz() {
  const o = C.o, k = o.kart, i = D.isaret[anahtar(k)] || {};
  const cevapVar = C.durum !== "soru";
  let soru = "", cevap = "", alt = "";
  if (C.kip === "test") {
    soru = `<div class="test-tur">${kac(o.test.tur)}</div><div class="test-soru">${KKParse.satirIci(o.test.soru)}</div>`;
  } else {
    soru = `<div class="bolge">${grupHtml(k, 1) || `<div class="f-wort">${k.f.wort}</div>`}</div>`;
  }
  // secenekler
  if (o.sec) {
    const dogruS = new Set(o.sec.dogru.map(KKParse.sade));
    cevap += `<div class="secenekler${coklu() ? " coklu" : ""}">${o.sec.secenekler.map((s, j) => {
      let c = "";
      if (cevapVar) c = dogruS.has(KKParse.sade(s)) ? (C.secim.has(j) ? " dogru" : " kacan") : C.secim.has(j) ? " yanlis" : " soluk";
      else if (C.secim.has(j)) c = " secili";
      return `<button class="secenek${c}" data-j="${j}"><kbd>${j + 1}</kbd><kbd class="harf">${SECENEK_HARF[j].toUpperCase()}</kbd><span>${KKParse.satirIci(s)}</span></button>`;
    }).join("")}</div>`;
    if (coklu() && !cevapVar) cevap += `<p class="soluk ortala">Birden çok doğru olabilir · işaretleyip Enter</p>`;
    if (C.kip === "sec" && o.sec.dosyadan < 3 && !cevapVar) cevap += `<p class="soluk ortala">${o.sec.dosyadan ? "Bazı seçenekler" : "Seçenekler"} listedeki kartlardan seçildi.</p>`;
  }
  if (yazmaKipi()) {
    cevap += `<div class="yaz"><input id="yazGir" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="Cevabınız…" value="${kac(C.cevap)}" ${cevapVar ? "disabled" : ""}></div>`;
    if (cevapVar) {
      const liste = C.kip === "yaz" ? adaylar(k, hedefAlan(k)) : o.test.dogru;
      const en = enYakin(C.cevap, liste), f = farkHtml(C.cevap || "", en);
      cevap += `<div class="fark"><div><small>Sizin</small> ${C.cevap ? f.html : "<i>boş</i>"}</div>
        <div><small>Doğru</small> ${kac(en)}</div>${f.hata ? "" : `<div class="ayni">Aynı görünüyor</div>`}</div>`;
    }
  }
  // cevap acildiginda gosterilecek bilgi
  if (cevapVar) {
    if (C.kip === "test") {
      cevap += `<div class="cevap-bilgi">${o.test.aciklama ? `<div class="f-not">${KKParse.satirIci(o.test.aciklama)}</div>` : ""}
        <div class="f-x"><span class="ad">Kelime</span>${k.f.wort}</div></div>`;
    } else {
      const g2 = grupHtml(k, 2);
      if (g2) cevap += `<div class="bolge cevap2">${g2}</div>`;
    }
  }
  // alt dugmeler
  if (C.durum === "soru") {
    if (C.kip === "acbak") alt = `<button class="ana genis" data-c="ac">Cevabı göster <kbd>Boşluk</kbd></button>`;
    else if (yazmaKipi()) alt = `<button class="ana genis" data-c="kontrol">Kontrol <kbd>Enter</kbd></button>`;
    else if (coklu()) alt = `<button class="ana genis" data-c="degerlendir">Kontrol <kbd>Enter</kbd></button>`;
  } else if (C.durum === "karar") {
    alt = `<button class="iyi" data-c="bildim">${C.kip === "acbak" ? "Bildim" : "Doğruydu"} <kbd>1 · ${kac(BS_ETIKET)}</kbd></button>
      <button class="kotu" data-c="bilemedim">${C.kip === "acbak" ? "Bilemedim" : "Yanlıştı"} <kbd>2 · V</kbd></button>`;
  } else {
    alt = `<span class="sonuc ${C.sonOk ? "iyi" : "kotu"}">${C.sonOk ? "Doğru" : "Yanlış → ↻"}</span>
      <button class="ana" data-c="sonraki">Sonraki <kbd>Enter</kbd></button>`;
  }
  const d = (x, t, s) => `<button data-a="${x}" title="${t}" class="${s ? "secili" : ""}">${{ ok: "✓", sik: "↻", seyrek: "◌", fav: "★", ses: "🔊", hata: "⚑" }[x]}</button>`;
  const hk = C.kip === "test" ? hataAnahtar(k, o.test) : null;
  $("#calis").innerHTML = `<div class="calis-ust"><span class="ilerleme">${C.i + 1} / ${C.ogeler.length}</span>
      <span class="kip-adi">${KIP_ADI[C.kip]}</span><span class="sayac">✓ ${C.dogru} · ✗ ${C.yanlis}</span>
      <button class="ikon" data-c="kapat" title="Kapat (Esc)">✕</button></div>
    <div class="calis-cubuk"><span style="width:${(100 * C.i) / C.ogeler.length}%"></span></div>
    <div class="calis-govde"><article class="kart tek">${soru}${cevap}
      <div class="isaretler">${d("ses", "Sesli oku")}${d("ok", "Öğrenildi", i.d === "ok")}${d("sik", "Sık tekrar", i.d === "sik")}${d("seyrek", "Seyrek tekrar", i.d === "seyrek")}${d("fav", "Favori", i.fav)}${hk ? d("hata", "Hatalı test: işaretle, ⚙'den kopyalayıp düzelttirin", !!hataListesi()[hk]) : ""}</div>
    </article></div>
    <div class="calis-alt">${alt}</div>`;
  const g = $("#yazGir");
  if (g) { g.oninput = (e) => (C.cevap = e.target.value); if (C.durum === "soru") setTimeout(() => g.focus(), 30); }
}

function cevapla(dogruMu) {
  if (dogruMu) C.dogru++;
  else {
    C.yanlis++; C.yanlislar.push(C.o);
    const k = anahtar(C.o.kart), i = { ...(D.isaret[k] || {}) };
    if (i.d !== "ok") { i.d = "sik"; D.isaret[k] = i; isaretKaydet(); }
  }
  C.sonOk = dogruMu;
}
function sonraki() {
  if (C.i + 1 < C.ogeler.length) { C.i++; soruKur(); return; }
  C.durum = "bitti";
  const n = C.yanlislar.length;
  $("#calis").innerHTML = `<div class="calis-ust"><span class="ilerleme">${C.ogeler.length} / ${C.ogeler.length}</span>
      <span class="kip-adi">${KIP_ADI[C.kip]}</span><span class="sayac"></span><button class="ikon" data-c="kapat">✕</button></div>
    <div class="calis-govde"><article class="kart tek ozet"><h2>Tur bitti</h2>
      <p class="buyuk"><span class="iyi">✓ ${C.dogru} doğru</span> · <span class="kotu">✗ ${C.yanlis} yanlış</span></p>
      ${n ? `<p class="soluk">Yanlışlar ↻ (Sık tekrar) olarak işaretlendi.</p>` : ""}</article></div>
    <div class="calis-alt">${n ? `<button class="ana" data-c="yanlislar">Yanlışları tekrar et (${n}) <kbd>Enter</kbd></button>` : ""}
      <button data-c="yeniden">Yeniden başla</button><button data-c="kapat">Listeye dön <kbd>Esc</kbd></button></div>`;
}
function eylem(c, j) {
  if (c === "kapat") return calisKapat();
  if (C.durum === "bitti") {
    if (c === "yanlislar" && C.yanlislar.length) return calisBasla(C.kip, karistir(C.yanlislar));
    if (c === "yeniden") return calisBasla(C.kip);
    return;
  }
  if (c === "ac" && C.durum === "soru" && C.kip === "acbak") { C.durum = "karar"; return calisCiz(); }
  if (c === "kontrol" && C.durum === "soru" && yazmaKipi()) { C.cevap = ($("#yazGir") || {}).value || C.cevap; C.durum = "karar"; calisCiz(); document.activeElement && document.activeElement.blur(); return; }
  if ((c === "bildim" || c === "bilemedim") && C.durum === "karar") { cevapla(c === "bildim"); return sonraki(); }
  if (c === "sec" && C.durum === "soru" && C.o.sec && j < C.o.sec.secenekler.length) {
    if (coklu()) { C.secim.has(j) ? C.secim.delete(j) : C.secim.add(j); return calisCiz(); }
    C.secim = new Set([j]); return eylem("degerlendir");
  }
  if (c === "degerlendir" && C.durum === "soru" && C.o.sec) {
    if (!C.secim.size) return;
    const dogruS = new Set(C.o.sec.dogru.map(KKParse.sade));
    const secilen = new Set([...C.secim].map((x) => KKParse.sade(C.o.sec.secenekler[x])));
    cevapla(secilen.size === dogruS.size && [...secilen].every((x) => dogruS.has(x)));
    C.durum = "sonuc"; return calisCiz();
  }
  if (c === "sonraki" && C.durum === "sonuc") return sonraki();
}
$("#calis").addEventListener("click", (e) => {
  const s = e.target.closest(".secenek"); if (s) return eylem("sec", +s.dataset.j);
  const b = e.target.closest("[data-c]"); if (b) return eylem(b.dataset.c);
  const a = e.target.closest("button[data-a]");
  if (a) {
    const k = C.o.kart;
    if (a.dataset.a === "ses") oku(k);
    else if (a.dataset.a === "hata") hataCevir(k, C.o.test);
    else isaretDegis(k, a.dataset.a);
    calisCiz();
  }
});
document.addEventListener("keydown", (e) => {
  if (!C.acik) return;
  e.stopImmediatePropagation();
  if (e.key === "Escape") { e.preventDefault(); return calisKapat(); }
  if (e.target.id === "yazGir") { if (e.key === "Enter") { e.preventDefault(); eylem("kontrol"); } return; }
  if (e.metaKey || e.ctrlKey) return;
  const bs = e.code === "Backslash" || e.key === "\\";
  if (e.altKey && !bs) return;
  if (bs || e.code === "KeyV") {
    e.preventDefault();
    if (C.durum === "soru" && C.kip === "acbak") return eylem("ac");
    return eylem(bs ? "bildim" : "bilemedim");
  }
  const j = SECENEK_TUS.indexOf(e.code), rk = rakamNo(e);
  if (j >= 0 && C.durum === "soru" && C.o && C.o.sec) { e.preventDefault(); return eylem("sec", j); }
  if (rk >= 0 && C.durum === "soru" && C.o && C.o.sec) { e.preventDefault(); return eylem("sec", rk); }
  if ((rk === 0 || rk === 1) && !(C.o && C.o.sec) && C.durum !== "bitti" && C.durum !== "sonuc") {
    e.preventDefault();
    if (C.durum === "soru" && C.kip === "acbak") return eylem("ac");
    return eylem(rk === 0 ? "bildim" : "bilemedim");
  }
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    if (C.durum === "bitti") return eylem(e.key === "Enter" && C.yanlislar.length ? "yanlislar" : "yeniden");
    if (C.durum === "sonuc") return eylem("sonraki");
    if (C.kip === "acbak" && C.durum === "soru") return eylem("ac");
    if (yazmaKipi() && C.durum === "soru") { const g = $("#yazGir"); if (g) g.focus(); return; }
    if (coklu() && C.durum === "soru" && e.key === "Enter") return eylem("degerlendir");
  }
}, true);

// ---- hatali test isaretleri (cihaz basina, kk.hata): ⚙'den kopyalanip ajana duzelttirilir
const hataAnahtar = (kart, t) => D.id + "|" + anahtar(kart) + "|" + t.tur + "|" + t.soru;
const hataListesi = () => depo.al("kk.hata", {}) || {};
function hataCevir(kart, t) {
  const h = hataListesi(), k = hataAnahtar(kart, t);
  if (h[k]) { delete h[k]; bildir("Hatalı test işareti kaldırıldı."); }
  else { h[k] = { liste: D.id, wort: anahtar(kart), ...t }; bildir("Test hatalı diye işaretlendi; ⚙ → Hatalı testler."); }
  depo.koy("kk.hata", h);
}
function hataMetni() {
  const l = Object.values(hataListesi()).filter((x) => x.liste === D.id);
  const kelime = new Map();
  for (const x of l) { if (!kelime.has(x.wort)) kelime.set(x.wort, []); kelime.get(x.wort).push(x); }
  return { n: l.length, metin: `Kelime Kartı'nda hatalı diye işaretlediğim testler (${D.liste.ad}). Lütfen düzelt ya da sil:\n\n` +
    [...kelime].map(([w, xs]) => `### ${w}\n` + xs.map((t) => `- **Test:** ${t.tur} | ${t.soru} | ${t.dogru.join("; ")} | ${t.yanlis.join("; ")} | ${t.aciklama}`).join("\n")).join("\n\n") };
}

// ------------------------------------------------------------ bildirim
let bildirimSaat;
function bildir(metin, eylem, sure = 4500) {
  const b = $("#bildirim");
  b.innerHTML = ""; b.append(document.createTextNode(metin));
  if (eylem) { const d = document.createElement("button"); d.textContent = eylem[0]; d.onclick = () => { b.hidden = true; eylem[1](); }; b.append(d); }
  b.hidden = false;
  clearTimeout(bildirimSaat); bildirimSaat = setTimeout(() => (b.hidden = true), sure);
}

// ------------------------------------------------------------ Mac Hizli Islemi: #ac=<deflate+base64url>&ad=<dosya>&t=<tarayici>
async function adrestenAc() {
  if (!location.hash.startsWith("#ac=")) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname + location.search);
  try {
    if (p.get("t")) depo.koy("kk.mac", p.get("t"));
    const b64 = p.get("ac").replace(/-/g, "+").replace(/_/g, "/");
    const sik = Uint8Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
    const akis = new Blob([sik]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const bayt = new Uint8Array(await new Response(akis).arrayBuffer());
    return yukle(await KKParse.oku(p.get("ad") || "liste.md", bayt));
  } catch (e) { bildir("Dosya açılamadı: " + e.message, null, 8000); return null; }
}

// ------------------------------------------------------------ baslangic
$("#dosya").addEventListener("change", (e) => { dosyalariAc([...e.target.files]); e.target.value = ""; });
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.files.length) dosyalariAc([...e.dataTransfer.files]); });
window.addEventListener("hashchange", async () => { const id = await adrestenAc(); if (id) listeAc(id); });

(async function basla() {
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* yok */ }
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  const id = (await adrestenAc()) || depo.al("kk.son", null);
  if (id && depo.al("kk.liste." + id, null)) listeAc(id);
  else if (listeler().length) listeAc(listeler()[0].id);
  else karsilama();
})();
