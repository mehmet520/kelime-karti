/* app.js — Kelime Karti arayuzu. Veri cihazdan cikmaz: dosya tarayicida okunur, tarayicinin deposunda tutulur. */
"use strict";
const SURUM = "2.1.2";
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
  for (const a of liste.alanlar) if (!(a.k in ayar.grup)) ayar.grup[a.k] = a.rol === "wort" || a.rol === "satz" ? 1 : 2;
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

function alanHtml(a, html) {
  if (a.rol) return `<div class="f-${a.rol}">${html}</div>`;
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

function isaretle(kart, kartEl, a) {
  if (a === "ses") { oku(kart); return; }
  const k = anahtar(kart);
  const once = JSON.stringify(D.isaret[k] || {});
  const i = { ...(D.isaret[k] || {}) };
  if (a === "fav") i.fav = !i.fav || undefined;
  else i.d = i.d === a ? undefined : a;
  if (!i.d) delete i.d; if (!i.fav) delete i.fav;
  if (Object.keys(i).length) D.isaret[k] = i; else delete D.isaret[k];
  isaretKaydet();
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
  panelAc("bilgiPanel", `<h3>${KKParse.satirIci(L.baslik || L.ad)}</h3>
    <p class="soluk">${KKParse.satirIci(L.ad)}</p>
    <p><b>${n}</b> kart${oturum ? ` · ${oturum} oturum` : ""}${eksik ? ` · ${eksik} kartta boş alan var` : ""}</p>
    <p>✓ ${say.ok} öğrenildi · ↻ ${say.sik} sık · ◌ ${say.seyrek} seyrek · ★ ${say.fav} favori</p>
    <p class="soluk">↻ süzgeci sık tekrar kartlarını her seferinde, seyrek tekrar kartlarını üç açılışta bir gösterir.</p>
    ${L.sorunlar.length ? `<h4>Okunamayan satırlar (${L.sorunlar.length})</h4>
      <p class="soluk">Bu satırlar karta alınmadı; geri kalanı çalışılabilir. Dosyada düzeltip yeniden açarsanız eklenir.</p>
      ${L.sorunlar.map((s) => `<div class="sorun"><b>${KKParse.satirIci(String(s.satir))}</b>: ${KKParse.satirIci(s.neden)}</div>`).join("")}` : ""}
    <h4>Klavye</h4>
    <p class="soluk">↑ ↓ kart seç · Boşluk Grup 2 aç/kapa · ⇧ Boşluk Grup 1 · 1 öğrenildi · 2 sık · 3 seyrek · 4 favori · S sesli oku · / ara</p>`);
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

### jemandem Bescheid geben
- **Anlam:** birine haber vermek
- **Cümle içinde kullanımı:** *Ich gebe dir Bescheid, sobald ich fertig bin.*
  *Bitirir bitirmez sana haber veririm.*
- **Kısa açıklama:** \`jemandem\` Dativ alır.

### der Termin
- **Anlam:** randevu
- **Cümle içinde kullanımı:** *Ich habe morgen einen Termin beim Arzt.*
  *Yarın doktorda randevum var.*
- **Eş anlam:** die Verabredung
`;

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
