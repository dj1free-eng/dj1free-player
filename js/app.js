const CATALOG_URL = "catalog.json";
const PREVIEW_FALLBACK_SEC = 30;

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

let DATA = null;

const audio = $("#audio");
const dock = $("#playerDock");
const dockCover = $("#dockCover");
const dockTitle = $("#dockTitle");
const dockSub = $("#dockSub");
const btnPlay = $("#btnPlay");
const btnNow = $("#btnNow");
const btnCloseDock = $("#btnCloseDock");
const btnSpotify = $("#btnSpotify");
const btnYTM = $("#btnYTM");
const tCur = $("#tCur");
const tMax = $("#tMax");
const btnRew10 = $("#btnRew10");
const btnFwd10 = $("#btnFwd10");
const btnMenu = $("#btnMenu");
const btnMenuClose = $("#btnMenuClose");
const menuDrawer = $("#menuDrawer");
const menuScrim = $("#menuScrim");
const btnSkinToggle = $("#btnSkinToggle");
const skinListEl = $("#skinList");
const skinModalScrim = $("#skinModalScrim");
const skinModal = $("#skinModal");
const skinModalTitle = $("#skinModalTitle");
const skinModalPreview = $("#skinModalPreview");
const btnSkinModalClose = $("#btnSkinModalClose");
const btnSkinApply = $("#btnSkinApply");
const btnSkinCancel = $("#btnSkinCancel");
/* =========================
   Skins del reproductor
========================= */
const SKINS_URL = "assets/skins/skins.json";

// DOCK_SKINS se carga desde JSON (para que añadir skins no pueda petar la app por una coma en JS)
let DOCK_SKINS = [];

/**
 * Fallback seguro (por si falla el fetch del JSON)
 * IMPORTANTE: mantenerlo mínimo. La fuente de verdad es skins.json.
 */
function defaultDockSkins(){
  return [
    {
      id: "basic",
      name: "Básico",
      thumb: "assets/skins/thumb-basic.png",
      url: "assets/skins/dock-skin.png",
      portrait: "assets/skins/dock-skin.png"
    }
  ];
}

function normalizeSkin(raw){
  if(!raw || typeof raw !== "object") return null;

  const id = String(raw.id || "").trim();
  const name = String(raw.name || "").trim() || id;

  const thumb = safeUrl(raw.thumb);
  const url = safeUrl(raw.url);
  const portrait = safeUrl(raw.portrait || raw.url);

  if(!id || !thumb || !url) return null;

  return { id, name, thumb, url, portrait };
}

function validateDockSkins(list){
  const out = [];
  const seen = new Set();

  for(const item of (Array.isArray(list) ? list : [])){
    const s = normalizeSkin(item);
    if(!s) continue;
    if(seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }

  return out;
}

async function loadDockSkins(){
  try{
    const res = await fetch(SKINS_URL + "?v=" + Date.now(), { cache: "no-store" });
    if(!res.ok) throw new Error(`No se pudo cargar ${SKINS_URL} (HTTP ${res.status})`);
    const json = await res.json();

    // Acepta dos formatos: { skins:[...] } o [...]
    const skinsRaw = Array.isArray(json) ? json : (json && Array.isArray(json.skins) ? json.skins : []);
    const skins = validateDockSkins(skinsRaw);

    DOCK_SKINS = skins.length ? skins : defaultDockSkins();
    return DOCK_SKINS;
  }catch(err){
    console.warn("[skins] Fallback:", err);
    DOCK_SKINS = defaultDockSkins();
    return DOCK_SKINS;
  }
}

function ensureDockSkins(){
  if(!Array.isArray(DOCK_SKINS) || DOCK_SKINS.length === 0){
    DOCK_SKINS = defaultDockSkins();
  }
}

const LS_DOCK_SKIN = "dj1free_dock_skin";
// =========================
// Estado persistente del player (pausa + posición)
// =========================
const LS_PLAYER_STATE = "dj1free_player_state_v1";

// Track actual (para saber qué guardar/restaurar)
let currentTrackId = null;

function getSavedPlayerState(){
  try{
    const raw = localStorage.getItem(LS_PLAYER_STATE);
    if(!raw) return null;
    const s = JSON.parse(raw);
    if(!s || !s.trackId) return null;
    return s;
  }catch(_){
    return null;
  }
}

function setSavedPlayerState(state){
  try{
    localStorage.setItem(LS_PLAYER_STATE, JSON.stringify(state));
  }catch(_){}
}

function clearSavedPlayerState(){
  try{ localStorage.removeItem(LS_PLAYER_STATE); }catch(_){}
}

// Programa el hard-stop para respetar el límite del preview
function scheduleHardStop(){
  clearTimeout(hardStopTimer);
  hardStopTimer = null;

  const remaining = Math.max(0, (currentLimitSec || PREVIEW_FALLBACK_SEC) - (audio.currentTime || 0));
  if(remaining <= 0) return;

  hardStopTimer = setTimeout(()=>{
    audio.pause();
    audio.currentTime = 0;
    btnPlay.textContent = "Play";
    tCur.textContent = "0:00";
    // Guardamos también el estado reseteado
    if(currentTrackId){
      setSavedPlayerState({
        trackId: currentTrackId,
        time: 0,
        limitSec: currentLimitSec || PREVIEW_FALLBACK_SEC,
        paused: true
      });
    }
  }, remaining * 1000);
}

// Pausa, NO borra src, y persiste posición + track
function pauseAndPersist(){
  clearTimeout(hardStopTimer);
  hardStopTimer = null;

  // Si no hay nada cargado, no guardamos basura
  if(!currentTrackId || !audio.src){
    audio.pause();
    btnPlay.textContent = "Play";
    return;
  }

  audio.pause();
  btnPlay.textContent = "Play";

  const time = Math.max(0, Math.min(audio.currentTime || 0, currentLimitSec || PREVIEW_FALLBACK_SEC));

  setSavedPlayerState({
    trackId: currentTrackId,
    time,
    limitSec: currentLimitSec || PREVIEW_FALLBACK_SEC,
    paused: true
  });

  // UI inmediata
  tCur.textContent = fmtTime(time);
  tMax.textContent = fmtTime(currentLimitSec || PREVIEW_FALLBACK_SEC);
}

// Restaura el último track y lo deja en pausa donde estaba
function restorePausedState(){
  const s = getSavedPlayerState();
  if(!s || !s.trackId) return false;

  const track = byId(DATA?.tracks, s.trackId);
  if(!track) return false;

  // Monta UI y audio sin reproducir
  setQueueFromTrack(track.id);
  updateDockUI(track);
  setMediaSession(track);

  const url = safeUrl(track.previewUrl);
  if(!url){
    // No hay preview, no hay nada que restaurar de audio
    btnPlay.textContent = "Sin preview";
    btnPlay.disabled = true;
    return false;
  }

  btnPlay.disabled = false;

  // Carga audio si no está cargado o si es otro track
  if(!audio.src || audio.src !== url){
    audio.pause();
    audio.src = url;
    audio.load();
  }

  currentTrackId = track.id;
  currentLimitSec = Number(track.durationSec || s.limitSec || PREVIEW_FALLBACK_SEC);
  tMax.textContent = fmtTime(currentLimitSec);

  const time = Math.max(0, Math.min(Number(s.time || 0), currentLimitSec));
  audio.currentTime = time;
  tCur.textContent = fmtTime(time);

  // Queda en pausa
  btnPlay.textContent = "Play";
  clearTimeout(hardStopTimer);
  hardStopTimer = null;

  return true;
}
function getSavedDockSkinId(){
  try{ return localStorage.getItem(LS_DOCK_SKIN) || "basic"; }
  catch(_){ return "basic"; }
}

function setSavedDockSkinId(id){
  try{ localStorage.setItem(LS_DOCK_SKIN, id); }catch(_){}
}

function applyDockSkinById(id){
  ensureDockSkins();
  const skin = DOCK_SKINS.find(s => s.id === id) || DOCK_SKINS[0];
  if(!dock) return;

  // Una sola imagen siempre (sin landscape)
  dock.style.backgroundImage = `url("${skin.url}")`;

  setSavedDockSkinId(skin.id);
}
function cycleDockSkin(){
  ensureDockSkins();
  const currentId = getSavedDockSkinId();
  const idx = DOCK_SKINS.findIndex(s => s.id === currentId);
  const next = DOCK_SKINS[(idx + 1 + DOCK_SKINS.length) % DOCK_SKINS.length];
  applyDockSkinById(next.id);
}
function renderExploreSceneAlbums(releases){
  const covers = releases
    .filter(r => r.cover)
    .slice(0, 3)
    .map(r => `url('${encodeURI(safeUrl(r.cover))}')`);

  const bg = covers.join(",");

  return `
    <section class="exploreScene exploreScene--albums">
      <div class="exploreSceneBg" style="background-image:${bg}"></div>
      <div class="exploreSceneOverlay"></div>

      <div class="exploreSceneContent">
        <h2>Álbumes</h2>
        <p>Colecciones completas</p>
      </div>
    </section>
  `;
}
function renderSkinList(){
  ensureDockSkins();
  const list = document.getElementById("skinList");
  if(!list) return;

  const currentId = getSavedDockSkinId();

  list.innerHTML = DOCK_SKINS.map(s => `
    <div class="skinItem ${s.id === currentId ? "is-active" : ""}" data-skin="${s.id}">
      <div class="skinThumb" style="background-image:url('${s.thumb}')"></div>
      <div class="skinMeta">
        <div class="skinName">${s.name}</div>
        <div class="skinHint">Toca para previsualizar</div>
      </div>
    </div>
  `).join("");
}

function toggleSkinList(force){
  const list = document.getElementById("skinList");
  const btn  = document.getElementById("btnSkinToggle");
  if(!list || !btn) return;

  const willOpen = typeof force === "boolean" ? force : list.hidden;
  list.hidden = !willOpen;
  btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
}
function openSkinModal(id){
  ensureDockSkins();
  const skin = DOCK_SKINS.find(s => s.id === id);
  if(!skin || !skinModal || !skinModalScrim) return;

  // guarda selección
  skinListEl.dataset.selected = id;

  // texto
  if(skinModalTitle) skinModalTitle.textContent = skin.name;

  // PREVIEW (esto es lo que has perdido)
  if(skinModalPreview){
  // Forzamos preview con <img> (más fiable que background-image)
  const src = encodeURI(skin.portrait);

  skinModalPreview.innerHTML = `
    <img
      src="${src}"
      alt="Preview skin"
      style="width:100%; height:100%; display:block; object-fit:cover; border-radius:12px;"
    >
  `;
}

  // abre modal
  skinModal.hidden = false;
  skinModalScrim.hidden = false;
}

function closeSkinModal(reopenList = false){
  if(!skinModal || !skinModalScrim) return;
  skinModal.hidden = true;
  skinModalScrim.hidden = true;

  // Si vienes de "Cancelar", reabre la lista desplegable
  if(reopenList){
    toggleSkinList(true);
  }
}
let queue = [];
let queueIndex = -1;
let hardStopTimer = null;

/** Límite actual del preview cargado (para timeupdate y ±10s) */
let currentLimitSec = PREVIEW_FALLBACK_SEC;

function fmtTime(sec){
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec/60);
  const s = String(sec%60).padStart(2,"0");
  return `${m}:${s}`;
}

function safeUrl(u){
  if(!u || typeof u !== "string") return "";
  return u.trim();
}
function absUrl(u){
  const s = safeUrl(u);
  if(!s) return "";
  try{
    return new URL(s, window.location.href).href;
  }catch(_){
    return s;
  }
}
function toSpotifyAppUrl(url){
  const u = safeUrl(url);
  const m = u.match(/open\.spotify\.com\/(track|album|artist|playlist)\/([A-Za-z0-9]+)/);
  if(!m) return "";
  return `spotify:${m[1]}:${m[2]}`;
}

function toYouTubeMusicAppUrl(url){
  // Devolvemos vacío para forzar SOLO web (evita "dirección no válida")
  return "";
}

/**
 * Intenta abrir app vía esquema. Si falla (no instalada), vuelve al web.
 * En iOS: usamos navegación directa (no window.open) para maximizar compatibilidad.
 */
let appFallbackTimer = null;

function openAppOrWeb(appUrl, webUrl){
  const app = safeUrl(appUrl);
  const web = safeUrl(webUrl);
  if(!web) return;

  // Si no hay appUrl, tiramos directo a web
  if(!app){
    window.location.href = web;
    return;
  }

  // Cancelación segura del fallback si la app realmente se abre
  let fallbackTimer = null;
  let cancelled = false;

  const cleanup = ()=>{
    if(cancelled) return;
    cancelled = true;
    if(fallbackTimer) clearTimeout(fallbackTimer);
    document.removeEventListener("visibilitychange", onVis, true);
    window.removeEventListener("pagehide", onHide, true);
    window.removeEventListener("blur", onBlur, true);
  };

  const onVis = ()=>{
    // Si la página pasa a hidden, es que el sistema está cambiando a la app
    if(document.visibilityState === "hidden") cleanup();
  };
  const onHide = ()=> cleanup();
  const onBlur = ()=> cleanup();

  document.addEventListener("visibilitychange", onVis, true);
  window.addEventListener("pagehide", onHide, true);
  window.addEventListener("blur", onBlur, true);

  // Intento abrir app (esto dispara el modal de iOS)
  window.location.href = app;

  // Fallback SOLO si NO se abrió la app (la página nunca se ocultó)
  fallbackTimer = setTimeout(()=>{
    if(!cancelled && document.visibilityState !== "hidden"){
      cleanup();
      window.location.href = web;
    }
  }, 1200);
}
function guessMimeFromUrl(url){
  const u = safeUrl(url).toLowerCase();
  if(u.endsWith(".png")) return "image/png";
  if(u.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/**
 * iOS usa esta metadata para mostrar carátula y texto en Dynamic Island/Lockscreen.
 */
function setMediaSession(track){
  if(!track || !("mediaSession" in navigator)) return;

  const rel = releaseById(track.releaseId);
  const cover = safeUrl(coverForTrack(track));
  const mime = guessMimeFromUrl(cover);

  try{
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || "—",
      artist: artistName(track.artistId) || "—",
      album: rel?.title || "",
      artwork: cover ? [
        { src: cover, sizes: "96x96", type: mime },
        { src: cover, sizes: "192x192", type: mime },
        { src: cover, sizes: "512x512", type: mime }
      ] : []
    });

    navigator.mediaSession.setActionHandler?.("play", async ()=>{
      try{ await audio.play(); btnPlay.textContent="Pausa"; }catch(_){}
    });
    navigator.mediaSession.setActionHandler?.("pause", ()=>{
      audio.pause();
      btnPlay.textContent="Play";
    });
    navigator.mediaSession.setActionHandler?.("seekto", (details)=>{
      if(typeof details.seekTime === "number"){
        audio.currentTime = details.seekTime;
      }
    });
  }catch(_){}
}

async function loadCatalog(){
  const res = await fetch(CATALOG_URL + "?v=" + Date.now(), { cache:"no-store" });
  if(!res.ok) throw new Error(`No se pudo cargar ${CATALOG_URL} (HTTP ${res.status})`);
  const json = await res.json();
  if(!json || !Array.isArray(json.tracks) || !Array.isArray(json.artists)){
    throw new Error("catalog.json inválido: faltan tracks[] y/o artists[]");
  }
  return json;
}

function byId(arr, id){ return (arr || []).find(x => x && x.id === id); }
function artistName(id){ const a = byId(DATA.artists, id); return a ? a.name : "—"; }
function releaseById(id){ return byId(DATA.releases || [], id); }

function coverForTrack(track){
  const rel = releaseById(track.releaseId);
  return safeUrl((rel && rel.cover) || track.cover || "");
}

function escapeHtml(s){
  if(s === null || s === undefined) return "";
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function setNavActive(path){
  // antiguos .navlink (ya no existen, pero no pasa nada si no están)
  $$(".navlink").forEach(a => a.classList.toggle("active", a.dataset.route === path));
  // nuevos del drawer
  $$(".menuLink").forEach(a => a.classList.toggle("active", a.dataset.route === path));
}
function openMenu(){
  if(!menuDrawer || !menuScrim || !btnMenu) return;
  menuDrawer.hidden = false;
  menuScrim.hidden = false;
  // animación
  requestAnimationFrame(()=> menuDrawer.classList.add("is-open"));
  btnMenu.setAttribute("aria-expanded","true");
}

function closeMenu(){
  if(!menuDrawer || !menuScrim || !btnMenu) return;
  menuDrawer.classList.remove("is-open");
  btnMenu.setAttribute("aria-expanded","false");
  // espera a la transición
  setTimeout(()=>{
    menuDrawer.hidden = true;
    menuScrim.hidden = true;
  }, 220);
}
function sectionReleases(title, releases){
  return `
    <section class="section">
      <div class="sectionHead">
        <h2 class="h2">${escapeHtml(title)}</h2>
        <div class="small">${releases.length} items</div>
      </div>
      <div class="grid">
        ${releases.map(r => `
          <article class="card" data-action="openRelease" data-release="${r.id}">
            <div class="cardInner">
<div class="cardCover" style="background-image:url('${encodeURI(absUrl(r.cover))}')"></div>
              <div>
                <div class="cardTitle">${escapeHtml(r.title)}</div>
                <div class="cardSub">${escapeHtml(artistName(r.artistId))} · ${r.year || "—"}</div>
              </div>
              <div class="badge">${r.type === "single" ? "Single" : "Álbum"}</div>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function sectionTracks(title, tracks){
  return `
    <section class="section">
      <div class="sectionHead">
        <h2 class="h2">${escapeHtml(title)}</h2>
        <div class="small">${tracks.length} temas</div>
      </div>
      <div class="grid">
        ${tracks.map(t => {
          const hasPreview = !!safeUrl(t.previewUrl);
          return `
            <article class="card" data-action="play" data-track="${t.id}">
              <div class="cardInner">
<div class="cardCover" style="background-image:url('${encodeURI(absUrl(coverForTrack(t)))}')"></div>
                <div>
                  <div class="cardTitle">${escapeHtml(t.title)}</div>
                  <div class="cardSub">${escapeHtml(artistName(t.artistId))}</div>
                </div>
                <div class="badge ${hasPreview ? "good" : ""}">${hasPreview ? "▶ 30s" : "Sin preview"}</div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function onAppClick(e){
  const el = e.target.closest("[data-action]");
  if(!el) return;

  const action = el.dataset.action;

  if(action === "play"){
    playTrackById(el.dataset.track);
    return;
  }
  if(action === "openArtist"){
    location.hash = `#/artist/${encodeURIComponent(el.dataset.artist)}`;
    return;
  }
  if(action === "openRelease"){
    location.hash = `#/release/${encodeURIComponent(el.dataset.release)}`;
    return;
  }
}

function buildHome(){
  // Tab guardada
  const LS_HOME_TAB = "dj1free_home_tab";
  const getTab = ()=> {
    try{ return localStorage.getItem(LS_HOME_TAB) || "featured"; }catch(_){ return "featured"; }
  };
  const setTab = (id)=> {
    try{ localStorage.setItem(LS_HOME_TAB, id); }catch(_){}
  };

  // Datos base
  const featured = byId(DATA.tracks, DATA.featured?.trackId) || DATA.tracks[0];
  const rel = featured ? releaseById(featured.releaseId) : null;
  const heroBg = coverForTrack(featured);

  const renderPanel = (id)=>{
    if(id === "featured"){
      const sp = safeUrl(featured?.spotifyUrl);
      const yt = safeUrl(featured?.ytMusicUrl);

      return `
        <div class="homePanelCard">
          <div class="homePanelBg" style="background-image:url('${encodeURI(heroBg)}')"></div>
          <div class="homePanelOverlay"></div>

          <div class="homePanelBody">
            <div class="homePanelCover" style="background-image:url('${encodeURI(heroBg)}')"></div>

            <div class="homePanelText">
              <div class="homePanelKicker">Destacado</div>
              <div class="homePanelTitle">${escapeHtml(featured?.title || "—")}</div>
              <div class="homePanelMeta">
                ${escapeHtml(artistName(featured?.artistId))}
                ${rel?.title ? " · " + escapeHtml(rel.title) : ""}
              </div>

              <div class="homePanelBtns">
                <button class="btn primary" data-action="play" data-track="${featured?.id || ""}">▶ Reproducir 30s</button>
                ${sp ? `<a class="btn" target="_blank" rel="noreferrer noopener" href="${sp}">Spotify</a>` : ""}
                ${yt ? `<a class="btn" target="_blank" rel="noreferrer noopener" href="${yt}">YouTube Music</a>` : ""}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    if(id === "albums"){
      const albums = (DATA.releases||[]).filter(r => r.type === "album").sort((a,b)=>(b.year||0)-(a.year||0));
      const top = albums.slice(0, 6);
      return `
        <div class="homePanelMini">
          <div class="homePanelMiniHead">
            <div class="homePanelMiniTitle">Álbumes</div>
            <a class="btn ghost" href="#/albums">Ver todos</a>
          </div>

          <div class="homeStrip">
            ${top.map(r => `
              <button class="homeCoverCard" type="button" onclick="location.hash='#/release/${encodeURIComponent(r.id)}'">
                <span class="homeCoverImg" style="background-image:url('${encodeURI(safeUrl(r.cover))}')"></span>
                <span class="homeCoverMeta">
                  <span class="homeCoverTitle">${escapeHtml(r.title)}</span>
                  <span class="homeCoverSub">${escapeHtml(artistName(r.artistId))}${r.year ? " · " + r.year : ""}</span>
                </span>
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }

    if(id === "singles"){
      const singles = (DATA.releases||[]).filter(r => r.type === "single").sort((a,b)=>(b.year||0)-(a.year||0));
      const top = singles.slice(0, 6);
      return `
        <div class="homePanelMini">
          <div class="homePanelMiniHead">
            <div class="homePanelMiniTitle">Singles</div>
            <a class="btn ghost" href="#/singles">Ver todos</a>
          </div>

          <div class="homeStrip">
            ${top.map(r => `
              <button class="homeCoverCard" type="button" onclick="location.hash='#/release/${encodeURIComponent(r.id)}'">
                <span class="homeCoverImg" style="background-image:url('${encodeURI(safeUrl(r.cover))}')"></span>
                <span class="homeCoverMeta">
                  <span class="homeCoverTitle">${escapeHtml(r.title)}</span>
                  <span class="homeCoverSub">${escapeHtml(artistName(r.artistId))}${r.year ? " · " + r.year : ""}</span>
                </span>
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }

    if(id === "artists"){
      const top = (DATA.artists||[]).slice(0, 8);
      return `
        <div class="homePanelMini">
          <div class="homePanelMiniHead">
            <div class="homePanelMiniTitle">Artistas</div>
            <a class="btn ghost" href="#/artists">Ver todos</a>
          </div>

          <div class="homeStrip">
            ${top.map(a => `
              <button class="homeCoverCard" type="button" onclick="location.hash='#/artist/${encodeURIComponent(a.id)}'">
                <span class="homeCoverImg" style="background-image:url('${encodeURI(safeUrl(a.banner))}')"></span>
                <span class="homeCoverMeta">
                  <span class="homeCoverTitle">${escapeHtml(a.name)}</span>
                  <span class="homeCoverSub">Discografía</span>
                </span>
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }

    return `<div class="homePanelMini"><div class="homePanelMiniTitle">—</div></div>`;
  };

  const active = getTab();

  $("#app").innerHTML = `
    <section class="homeShell">
      <section id="homePanel" class="homePanel" aria-live="polite">
        ${renderPanel(active)}
      </section>

      <nav class="homeDock" id="homeDock" aria-label="Secciones">
        <button class="homeDockBtn ${active==="featured"?"is-active":""}" data-home="featured" type="button">
          <span class="homeDockIcon">▶</span><span class="homeDockTxt">Destacado</span>
        </button>
        <button class="homeDockBtn ${active==="albums"?"is-active":""}" data-home="albums" type="button">
          <span class="homeDockIcon">▦</span><span class="homeDockTxt">Álbumes</span>
        </button>
        <button class="homeDockBtn ${active==="singles"?"is-active":""}" data-home="singles" type="button">
          <span class="homeDockIcon">◉</span><span class="homeDockTxt">Singles</span>
        </button>
        <button class="homeDockBtn ${active==="artists"?"is-active":""}" data-home="artists" type="button">
          <span class="homeDockIcon">✦</span><span class="homeDockTxt">Artistas</span>
        </button>
      </nav>
    </section>
  `;

  // Click dock
  const dock = document.getElementById("homeDock");
  const panel = document.getElementById("homePanel");

  dock?.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-home]");
    if(!btn) return;

    const id = btn.dataset.home;
    if(!id) return;

    setTab(id);

    // estado visual
    dock.querySelectorAll(".homeDockBtn").forEach(b=>{
      b.classList.toggle("is-active", b.dataset.home === id);
    });

    // actualiza panel
    if(panel) panel.innerHTML = renderPanel(id);
  });
}
/* =========================
   HOME: Carrusel sticky + panel dinámico
========================= */
const LS_HOME_SECTION = "dj1free_home_section";

function getHomeSections(){
  return [
  { id:"featured", label:"Destacado", icon:"▶", hint:"Reproducir ahora" },
  { id:"albums",   label:"Álbumes",   icon:"▦", hint:"Colecciones completas" },
  { id:"singles",  label:"Singles",   icon:"◉", hint:"Últimos lanzamientos" },
  { id:"artists",  label:"Artistas",  icon:"✦", hint:"Discografías" }
];
}

function getSavedHomeSectionId(sections){
  const allowed = new Set(sections.map(s => s.id));
  try{
    const v = localStorage.getItem(LS_HOME_SECTION);
    return allowed.has(v) ? v : null;
  }catch(_){
    return null;
  }
}

function setSavedHomeSectionId(id){
  try{ localStorage.setItem(LS_HOME_SECTION, id); }catch(_){}
}
function pickFirst3(arr){
  return (arr || []).filter(Boolean).slice(0,3);
}

function renderPanelHero({ kicker, title, sub, bgUrl, coverUrls = [], ctaHref, ctaLabel }){
  const c = pickFirst3(coverUrls).map(u => encodeURI(safeUrl(u)));
  const c1 = c[0] || "";
  const c2 = c[1] || c1;
  const c3 = c[2] || c2;

  return `
    <div class="homePanelCard">
      <div class="homePanelBg" style="background-image:url('${encodeURI(safeUrl(bgUrl))}')"></div>
      <div class="homePanelOverlay"></div>

      <div class="homePanelBody">
        <div class="homePanelCover" style="background-image:url('${c2 ? c2 : encodeURI(safeUrl(bgUrl))}')"></div>

        <div class="homePanelText">
          <div class="homePanelKicker">${escapeHtml(kicker || "")}</div>
          <div class="homePanelTitle">${escapeHtml(title || "—")}</div>
          <div class="homePanelMeta">${escapeHtml(sub || "")}</div>

          <div class="homePanelBtns">
            ${ctaHref ? `<a class="btn primary" href="${ctaHref}">${escapeHtml(ctaLabel || "Abrir")}</a>` : ""}
          </div>

          <div class="homePanelCollage" aria-hidden="true">
            <span class="homePanelShot s1" style="background-image:url('${c1}')"></span>
            <span class="homePanelShot s2" style="background-image:url('${c2}')"></span>
            <span class="homePanelShot s3" style="background-image:url('${c3}')"></span>
          </div>
        </div>
      </div>
    </div>
  `;
}
function renderHomePanel(id, ctx){
  const featured = ctx?.featured;
  const rel = ctx?.rel;
  const heroBg = ctx?.heroBg;

  if(id === "featured"){
    const sp = safeUrl(featured?.spotifyUrl);
    const yt = safeUrl(featured?.ytMusicUrl);

    return `
      <div class="homePanelCard">
        <div class="homePanelBg" style="background-image:url('${encodeURI(heroBg)}')"></div>
        <div class="homePanelOverlay"></div>

        <div class="homePanelBody">
          <div class="homePanelCover" style="background-image:url('${encodeURI(heroBg)}')"></div>

          <div class="homePanelText">
            <div class="homePanelKicker">Destacado</div>
            <div class="homePanelTitle">${escapeHtml(featured?.title || "—")}</div>
            <div class="homePanelMeta">
              ${escapeHtml(artistName(featured?.artistId))}
              ${rel?.title ? " · " + escapeHtml(rel.title) : ""}
            </div>

            <div class="homePanelBtns">
              <button class="btn primary" data-action="play" data-track="${featured?.id || ""}">▶ Reproducir 30s</button>
              ${sp ? `<a class="btn" target="_blank" rel="noreferrer noopener" href="${sp}">Spotify</a>` : ""}
              ${yt ? `<a class="btn" target="_blank" rel="noreferrer noopener" href="${yt}">YouTube Music</a>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if(id === "albums"){
  const albums = (DATA.releases||[])
    .filter(r => r.type === "album")
    .sort((a,b)=>(b.year||0)-(a.year||0));

  const top3 = albums.slice(0,3);
  const bg = top3[0]?.cover || "";

  return `
    ${renderPanelHero({
      kicker: "Explorar",
      title: "Álbumes",
      sub: `${albums.length} álbumes disponibles`,
      bgUrl: bg,
      coverUrls: top3.map(r => r.cover),
      ctaHref: "#/albums",
      ctaLabel: "Ver todos"
    })}
  `;
}

  if(id === "singles"){
  const singles = (DATA.releases||[])
    .filter(r => r.type === "single")
    .sort((a,b)=>(b.year||0)-(a.year||0));

  const top3 = singles.slice(0,3);
  const bg = top3[0]?.cover || "";

  return `
    ${renderPanelHero({
      kicker: "Explorar",
      title: "Singles",
      sub: `${singles.length} singles disponibles`,
      bgUrl: bg,
      coverUrls: top3.map(r => r.cover),
      ctaHref: "#/singles",
      ctaLabel: "Ver todos"
    })}
  `;
}

if(id === "artists"){
  // Ordena artistas por nº de releases (desc)
  const counts = new Map();
  (DATA.releases||[]).forEach(r => {
    if(!r?.artistId) return;
    counts.set(r.artistId, (counts.get(r.artistId)||0)+1);
  });

  const artists = (DATA.artists||[])
    .slice()
    .sort((a,b)=> (counts.get(b.id)||0) - (counts.get(a.id)||0));

  const total = artists.length;

  return `
    <div style="
      border-radius: 22px;
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.04);
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,.45);
    ">
      <div style="
        display:flex;
        align-items:baseline;
        justify-content:space-between;
        gap:12px;
        padding: 14px 14px 10px 14px;
      ">
        <div>
          <div style="font-weight:900; font-size:16px; color:rgba(242,245,255,.92)">Artistas</div>
          <div style="font-size:12px; color:rgba(242,245,255,.65)">${total} artistas · desliza</div>
        </div>
        <a class="btn ghost" href="#/artists">Ver todos</a>
      </div>

      <div style="
        display:flex;
        gap:12px;
        overflow-x:auto;
        padding: 12px 14px 16px 14px;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
      ">
        ${artists.map(a => {
          const img = encodeURI(safeUrl(a.banner));
          const name = escapeHtml(a.name);
          const n = counts.get(a.id) || 0;

          return `
            <button type="button"
              onclick="location.hash='#/artist/${encodeURIComponent(a.id)}'"
              style="
                flex: 0 0 auto;
                width: 210px;
                height: 170px;
                scroll-snap-align: center;
                border-radius: 18px;
                border: 1px solid rgba(255,255,255,.12);
                background: rgba(255,255,255,.05);
                padding: 0;
                overflow: hidden;
                cursor: pointer;
                position: relative;
                box-shadow: 0 18px 55px rgba(0,0,0,.55);
              "
              aria-label="Abrir artista ${name}"
            >
              <span style="
                position:absolute;
                inset:0;
                background-image:url('${img}');
                background-size:cover;
                background-position:center;
                filter: saturate(1.05) contrast(1.05);
              "></span>

              <span style="
                position:absolute;
                inset:0;
                background: linear-gradient(180deg,
                  rgba(0,0,0,.00) 0%,
                  rgba(0,0,0,.15) 35%,
                  rgba(0,0,0,.65) 100%
                );
              "></span>

              <span style="
                position:absolute;
                left:12px;
                right:12px;
                bottom:12px;
                display:flex;
                flex-direction:column;
                gap:4px;
                text-align:left;
              ">
                <span style="
                  font-weight:900;
                  font-size:14px;
                  color: rgba(242,245,255,.95);
                  white-space:nowrap;
                  overflow:hidden;
                  text-overflow:ellipsis;
                ">${name}</span>

                <span style="
                  font-size:12px;
                  color: rgba(242,245,255,.70);
                ">${n} releases</span>
              </span>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

  // fallback seguro
  return `<div class="homePanelMini"><div class="homePanelMiniTitle">—</div></div>`;
}

function setHomeActive(id){
  const sections = getHomeSections();
  const allowed = new Set(sections.map(s=>s.id));
  if(!allowed.has(id)) return;

  setSavedHomeSectionId(id);

  // Actualiza ARIA + clases en chips
  const chips = document.querySelectorAll("[data-home-section]");
  chips.forEach(ch => {
    const is = ch.dataset.homeSection === id;
    ch.classList.toggle("is-active", is);
    ch.setAttribute("aria-selected", is ? "true" : "false");
  });

  // Re-render del panel
  const featured = byId(DATA.tracks, DATA.featured?.trackId) || DATA.tracks[0];
  const rel = featured ? releaseById(featured.releaseId) : null;
  const heroBg = coverForTrack(featured);

  const panel = document.getElementById("homePanel");
  if(panel){
    panel.innerHTML = renderHomePanel(id, { featured, rel, heroBg });
  }
}

function initHomeCarousel(){
  const wrap = document.getElementById("homeCarousel");
  if(!wrap) return;
console.log("[HOME] initHomeCarousel NEW running");
  const chips = Array.from(wrap.querySelectorAll("[data-home-section]"));
  if(!chips.length) return;

  // --- Helper: aplica "abanico" tipo Epson asignando data-pos ---
  function applyFanByCenter(){
    const wrapRect = wrap.getBoundingClientRect();
    const wrapCenter = wrapRect.left + wrapRect.width / 2;

    // Encuentra el chip más cercano al centro del carrusel
    let bestIdx = 0;
    let bestDist = Infinity;

    chips.forEach((ch, i) => {
      const r = ch.getBoundingClientRect();
      const c = r.left + r.width / 2;
      const d = Math.abs(c - wrapCenter);
      if(d < bestDist){
        bestDist = d;
        bestIdx = i;
      }
    });

    // Asigna data-pos relativo (-3..3) y limpia lo demás
    chips.forEach((ch, i) => {
      const rel = i - bestIdx;              // izquierda negativo, derecha positivo
      const clamped = Math.max(-3, Math.min(3, rel));

      ch.dataset.pos = String(clamped);
// DEBUG visual: pinta cada tile según data-pos para verificar
ch.style.setProperty("--debug-pos", String(clamped));
      // Opcional: si quieres que fuera de rango se "aplane", puedes bajar opacidad con CSS.
      // Aquí solo dejamos el clamp, que ya queda bien.
    });

    // Devuelve el id centrado por si lo quieres usar
    return chips[bestIdx]?.dataset?.homeSection || null;
  }

  // --- Throttle scroll con RAF (para no freír el iPhone) ---
  let ticking = false;
  function onScroll(){
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(()=>{
      ticking = false;
      const centeredId = applyFanByCenter();

      // Si cambia el centrado, activamos esa sección (sin loops raros)
      const current = getSavedHomeSectionId(getHomeSections()) || "featured";
      if(centeredId && centeredId !== current){
        setHomeActive(centeredId);
      }
    });
  }

  // Tap: centra y activa
  wrap.addEventListener("click", (e)=>{
    const chip = e.target.closest("[data-home-section]");
    if(!chip) return;

    chip.scrollIntoView({ behavior:"smooth", inline:"center", block:"nearest" });
    const id = chip.dataset.homeSection;
    if(id) setHomeActive(id);
  });

  // Scroll: abanico + detectar centrado
  wrap.addEventListener("scroll", onScroll, { passive:true });

  // Al entrar al Home: centra el activo y aplica abanico
  const active = getSavedHomeSectionId(getHomeSections()) || "featured";
  const activeEl = wrap.querySelector(`[data-home-section="${active}"]`);
  activeEl?.scrollIntoView({ behavior:"auto", inline:"center", block:"nearest" });

  // Aplica abanico una vez al cargar (y otra justo después por si iOS tarda en layout)
  applyFanByCenter();
  setTimeout(applyFanByCenter, 50);
}

/* =========================
   Estilos Home inyectados (para no tocar style.css ahora)
========================= */
function ensureHomeMenuStyles(){
  if(document.getElementById("homeMenuStyles")) return;

  const style = document.createElement("style");
  style.id = "homeMenuStyles";
  style.textContent = `
  /* ===== Home layout ===== */
  .homeShell{ display:block; }
  .homePanel{ margin-top: 10px; }

  /* Panel fijo para que no “baile” */
  .homePanel{
    height: clamp(220px, 26vh, 300px);
  }
  .homePanelInner{
    height: 100%;
    border-radius: 22px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.10);
    background: rgba(255,255,255,.05);
    box-shadow: var(--shadow);
    position: relative;
  }

  /* Transición suave entre paneles */
  .homePanelSwap{
    height: 100%;
    position: relative;
  }
  .homePanelView{
    position: absolute;
    inset: 0;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity .18s ease, transform .18s ease;
    pointer-events: none;
  }
  .homePanelView.is-active{
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  /* Contenido dentro del panel: si sobra, scroll interno (sin mover la página) */
  .homePanelScroll{
    height: 100%;
    overflow: auto;
    padding: 16px;
    -webkit-overflow-scrolling: touch;
  }

  /* ===== Sticky menu ===== */
  .homeMenuSticky{
    position: sticky;
    top: calc(var(--homeStickyTop, 0px) + env(safe-area-inset-top, 0px));
    z-index: 60;
    margin-top: 12px;
    padding: 12px 0;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    background: rgba(7,9,19,.62);
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 22px;
  }
  .homeMenuTitleRow{
    display:flex;
    align-items:end;
    justify-content:space-between;
    padding: 0 16px 10px 16px;
    gap:12px;
  }
  .homeMenuTitle{ font-weight: 900; }
  .homeMenuHint{ font-size: 12px; color: rgba(242,245,255,.65); }

  /* ===== Carrusel “de verdad” ===== */
  .homeCarousel{
    display:flex;
    gap:12px;
    overflow-x:auto;
    padding: 0 16px;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
  }
  .homeCarousel::-webkit-scrollbar{ display:none; }

  /* Espacio lateral para centrar primera/última tarjeta */
  .homeCarousel{
    padding-left: calc((100% - min(320px, 78vw)) / 2 + 16px);
    padding-right: calc((100% - min(320px, 78vw)) / 2 + 16px);
  }

  .homeTile{
    scroll-snap-align: center;
    flex: 0 0 auto;
    width: min(320px, 78vw);
    border-radius: 22px;
    border: 1px solid rgba(255,255,255,.10);
    background: rgba(255,255,255,.05);
    box-shadow: var(--shadow);
    padding: 14px 14px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;

    transform: scale(.92);
    opacity: .65;
    transition: transform .18s ease, opacity .18s ease, border-color .18s ease, background .18s ease;
    cursor: pointer;
  }

  .homeTile.is-active{
    transform: scale(1);
    opacity: 1;
    background: rgba(138,230,255,.10);
    border-color: rgba(138,230,255,.25);
  }

  .homeTileLeft{ min-width:0; display:flex; flex-direction:column; gap:4px; }
  .homeTileTitle{ font-weight: 950; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .homeTileSub{ font-size: 12px; color: rgba(242,245,255,.70); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .homeTileIcon{
    width: 44px; height: 44px;
    border-radius: 14px;
    display:grid; place-items:center;
    border: 1px solid rgba(255,255,255,.10);
    background: rgba(255,255,255,.06);
    font-weight: 900;
  }
`;
  document.head.appendChild(style);

  // Ajuste dinámico del sticky top según topbar real
  syncHomeStickyTop();
  window.addEventListener("resize", syncHomeStickyTop);
}

function syncHomeStickyTop(){
  const topbar = document.querySelector(".topbar");
  const h = topbar ? topbar.offsetHeight : 0;
  document.documentElement.style.setProperty("--homeStickyTop", `${h}px`);
}
function buildArtists(){
  $("#app").innerHTML = `
    <section class="section">
      <div class="sectionHead">
        <h2 class="h2">Artistas</h2>
        <div class="small">${DATA.artists.length} artistas</div>
      </div>
      <div class="grid">
        ${DATA.artists.map(a => `
          <article class="card" data-action="openArtist" data-artist="${a.id}">
            <div class="cardInner">
              <div class="cardCover" style="background-image:url('${encodeURI(safeUrl(a.banner))}')"></div>
              <div>
                <div class="cardTitle">${escapeHtml(a.name)}</div>
                <div class="cardSub">Discografía</div>
              </div>
              <div class="badge">Abrir</div>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function buildAlbums(){
  const albums = (DATA.releases||[]).filter(r => r.type === "album").sort((a,b)=>(b.year||0)-(a.year||0));
  $("#app").innerHTML = sectionReleases("Álbumes", albums);
}

function buildSingles(){
  const singles = (DATA.releases||[]).filter(r => r.type === "single").sort((a,b)=> (b.year||0)-(a.year||0));
  $("#app").innerHTML = sectionReleases("Singles", singles);
}

function buildArtist(id){
  const a = byId(DATA.artists, id);
  if(!a) return notFound("Artista no encontrado");

  const rels = (DATA.releases||[]).filter(r => r.artistId === id);
  const albums = rels.filter(r => r.type === "album").sort((x,y)=>(y.year||0)-(x.year||0));
  const singles = rels.filter(r => r.type === "single").sort((x,y)=>(y.year||0)-(x.year||0));

  $("#app").innerHTML = `
    <section class="hero">
      <div class="heroBg" style="background-image:url('${encodeURI(safeUrl(a.banner))}')"></div>
      <div class="heroOverlay"></div>
      <div class="heroBody">
        <div class="heroCover" style="background-image:url('${encodeURI(safeUrl(a.banner))}')"></div>
        <div class="heroText">
          <div class="heroKicker">Artista</div>
          <div class="heroTitle">${escapeHtml(a.name)}</div>
          <div class="heroMeta">${albums.length} álbumes · ${singles.length} singles</div>
          <div class="heroBtns">
            <a class="btn" href="#/artists">← Artistas</a>
            <a class="btn" href="#/">Home</a>
          </div>
        </div>
      </div>
    </section>

    ${sectionReleases("Álbumes", albums)}
    ${sectionReleases("Singles", singles)}
  `;
}

function buildRelease(id){
  const r = releaseById(id);
  if(!r) return notFound("Release no encontrado");
  const tracks = DATA.tracks.filter(t => t.releaseId === id);

  $("#app").innerHTML = `
    <section class="hero">
      <div class="heroBg" style="background-image:url('${encodeURI(safeUrl(r.cover))}')"></div>
      <div class="heroOverlay"></div>
      <div class="heroBody">
        <div class="heroCover" style="background-image:url('${encodeURI(safeUrl(r.cover))}')"></div>
        <div class="heroText">
          <div class="heroKicker">${escapeHtml(r.type === "album" ? "Álbum" : "Single")}</div>
          <div class="heroTitle">${escapeHtml(r.title)}</div>
          <div class="heroMeta">${escapeHtml(artistName(r.artistId))} · ${r.year || "—"}</div>
          <div class="heroBtns">
            <a class="btn" href="#/artist/${encodeURIComponent(r.artistId)}">Ver artista</a>
            <a class="btn" href="#/">Home</a>
          </div>
        </div>
      </div>
    </section>
    ${sectionTracks("Tracks", tracks)}
  `;
}

function notFound(msg){
  $("#app").innerHTML = `
    <section class="section">
      <div class="sectionHead">
        <h2 class="h2">No encontrado</h2>
        <div class="small">${escapeHtml(msg)}</div>
      </div>
      <a class="btn" href="#/">Volver</a>
    </section>
  `;
}

function route(){
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\//,"").split("/").filter(Boolean);

  if(parts.length === 0){
    setNavActive("/");
    buildHome();
    return;
  }
  if(parts[0] === "artists"){
    setNavActive("/artists");
    buildArtists();
    return;
  }
  if(parts[0] === "albums"){
    setNavActive("/albums");
    buildAlbums();
    return;
  }
  if(parts[0] === "singles"){
    setNavActive("/singles");
    buildSingles();
    return;
  }
  if(parts[0] === "artist" && parts[1]){
    setNavActive("");
    buildArtist(decodeURIComponent(parts[1]));
    return;
  }
  if(parts[0] === "release" && parts[1]){
    setNavActive("");
    buildRelease(decodeURIComponent(parts[1]));
    return;
  }
  setNavActive("");
  notFound("Ruta desconocida");
}

function openDock(){
  dock.hidden = false;
  const scrim = document.getElementById("dockScrim");
  if(scrim) scrim.hidden = false;

  // Si no hay audio cargado, intentamos restaurar el último estado pausado
  if((!audio.src || !currentTrackId) && DATA){
    restorePausedState();
  }
}

function stopPlayback(){
  clearTimeout(hardStopTimer);
  hardStopTimer = null;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();

  currentLimitSec = PREVIEW_FALLBACK_SEC;
  tCur.textContent = "0:00";
  tMax.textContent = fmtTime(currentLimitSec);
}

function updateDockUI(track){
  const rel = releaseById(track.releaseId);
dockCover.style.backgroundImage = `url("${encodeURI(absUrl(coverForTrack(track)))}")`;
  dockTitle.textContent = track.title || "—";
  dockSub.textContent = `${artistName(track.artistId)}${rel?.title ? " · " + rel.title : ""}`;

  const sp = safeUrl(track.spotifyUrl);
  const yt = safeUrl(track.ytMusicUrl);

  btnSpotify.dataset.web = sp;
  btnSpotify.dataset.app = toSpotifyAppUrl(sp);
  btnSpotify.style.opacity = sp ? "1" : ".4";
  btnSpotify.style.pointerEvents = sp ? "auto" : "none";

  btnYTM.dataset.web = yt;
  btnYTM.dataset.app = toYouTubeMusicAppUrl(yt);
  btnYTM.style.opacity = yt ? "1" : ".4";
  btnYTM.style.pointerEvents = yt ? "auto" : "none";
}

function setQueueFromTrack(trackId){
  queue = DATA.tracks.slice();
  queueIndex = Math.max(0, queue.findIndex(t => t.id === trackId));
}

async function playTrackById(trackId){
  const track = byId(DATA.tracks, trackId);
  if(!track) return;
  currentTrackId = track.id;
  setQueueFromTrack(trackId);
  openDock();
  updateDockUI(track);
  setMediaSession(track);

  const url = safeUrl(track.previewUrl);
  if(!url){
    btnPlay.textContent = "Sin preview";
    btnPlay.disabled = true;
    currentLimitSec = PREVIEW_FALLBACK_SEC;
    tMax.textContent = fmtTime(currentLimitSec);
    return;
  }

  btnPlay.disabled = false;

  clearTimeout(hardStopTimer);
  audio.pause();
  audio.currentTime = 0;
  audio.src = url;
  audio.load();

  currentLimitSec = Number(track.durationSec || PREVIEW_FALLBACK_SEC);
  tMax.textContent = fmtTime(currentLimitSec);

  try{
    await audio.play();
    btnPlay.textContent = "Pausa";
  }catch(e){
    btnPlay.textContent = "Play";
    console.error(e);
  }

  hardStopTimer = setTimeout(()=>{
    audio.pause();
    audio.currentTime = 0;
    btnPlay.textContent = "Play";
    tCur.textContent = "0:00";
  }, currentLimitSec * 1000);
}

function wireDock(){
  // =========================
  // Menú hamburguesa
  // =========================
  btnMenu?.addEventListener("click", openMenu);
  btnMenuClose?.addEventListener("click", closeMenu);
  menuScrim?.addEventListener("click", closeMenu);

  // Cierra menú al navegar
  menuDrawer?.addEventListener("click", (e)=>{
    const a = e.target.closest("a[href^='#/']");
    if(a) closeMenu();
  });

  // Cierra menú con Escape (desktop)
  window.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") closeMenu();
  });
  // =========================
  // Skins: desplegable + lista
  // =========================
  btnSkinToggle?.addEventListener("click", ()=>{
    // cada vez que abres, re-render para marcar activo
    renderSkinList();
    toggleSkinList();
  });

skinListEl?.addEventListener("click", (e)=>{
  const item = e.target.closest(".skinItem");
  if(!item) return;

  const id = item.dataset.skin;
  if(!id) return;

  // Guardamos selección para "Aplicar"
  skinListEl.dataset.selected = id;

  // Cierra el desplegable (para que no estorbe)
  toggleSkinList(false);

  // Abre modal con preview
  openSkinModal(id);
});
// --- Modal: cerrar (X / cancelar / scrim) ---
skinModalScrim?.addEventListener("click", ()=> closeSkinModal(true));
btnSkinModalClose?.addEventListener("click", ()=> closeSkinModal(true));
btnSkinCancel?.addEventListener("click", ()=> closeSkinModal(true));

// --- Modal: aplicar ---
btnSkinApply?.addEventListener("click", ()=>{
  const id = skinListEl?.dataset?.selected;
  if(!id) return;

  // 1) Aplicar skin
  applyDockSkinById(id);

  // 2) Marcar activo en el listado
  document.querySelectorAll("#skinList .skinItem").forEach(el=>{
    el.classList.toggle("is-active", el.dataset.skin === id);
  });

  // 3) Cerrar modal (sin reabrir lista)
  closeSkinModal(false);

  // 4) Cerrar lista desplegable (por si estaba abierta)
  toggleSkinList(false);

  // 5) Cerrar menú hamburguesa completo
  closeMenu();

  // 6) Abrir el dock en pantalla
  openDock();
});
  // =========================
  // Now: solo abre/reproduce
  // =========================
  btnNow?.addEventListener("click", ()=>{
    const id = DATA?.featured?.trackId || DATA?.tracks?.[0]?.id;
    if(id) playTrackById(id);
  });

  // =========================
  // Scrim del dock: cerrar al tocar fuera
  // (IMPORTANTE: listener fuera de btnCloseDock)
  // =========================
  const dockScrim = document.getElementById("dockScrim");
  dockScrim?.addEventListener("click", ()=>{
  dock.hidden = true;
  dockScrim.hidden = true;
  pauseAndPersist();
});

  // =========================
  // Cerrar dock (botón X)
  // =========================
 btnCloseDock?.addEventListener("click", ()=>{
  dock.hidden = true;
  if(dockScrim) dockScrim.hidden = true;
  pauseAndPersist();
});

  // =========================
  // Enlaces
  // =========================
  btnSpotify?.addEventListener("click", (e)=>{
    e.preventDefault();
    openAppOrWeb(btnSpotify.dataset.app, btnSpotify.dataset.web);
  });

  btnYTM?.addEventListener("click", (e)=>{
    e.preventDefault();
    openAppOrWeb(btnYTM.dataset.app, btnYTM.dataset.web);
  });

  // =========================
  // Play/Pause
  // =========================
  btnPlay?.addEventListener("click", async ()=>{
    if(btnPlay.disabled) return;

    if(audio.paused){
  try{
    await audio.play();
    btnPlay.textContent = "Pausa";
    scheduleHardStop(); // <-- clave al reanudar
  }catch(e){
    console.error(e);
  }
}else{
  audio.pause();
  btnPlay.textContent = "Play";
  // guardamos la pausa (por si cambias skin / cierras luego)
  if(currentTrackId && audio.src) pauseAndPersist();
}
  });

  // =========================
  // Timeupdate
  // =========================
  audio.addEventListener("timeupdate", ()=>{
    const t = Math.min(audio.currentTime || 0, currentLimitSec);
    tCur.textContent = fmtTime(t);
    tMax.textContent = fmtTime(currentLimitSec);

    if("mediaSession" in navigator && typeof navigator.mediaSession.setPositionState === "function"){
      try{
        navigator.mediaSession.setPositionState({
          duration: currentLimitSec,
          playbackRate: audio.playbackRate || 1,
          position: t
        });
      }catch(_){}
    }
  });

  audio.addEventListener("ended", ()=>{
    btnPlay.textContent = "Play";
  });

  // =========================
  // SKIP ±10 segundos
  // =========================
  function clamp(v, min, max){
    return Math.max(min, Math.min(max, v));
  }

  btnRew10?.addEventListener("click", ()=>{
    const next = clamp((audio.currentTime || 0) - 10, 0, currentLimitSec);
    audio.currentTime = next;
    tCur.textContent = fmtTime(next);
  });

  btnFwd10?.addEventListener("click", ()=>{
    const next = clamp((audio.currentTime || 0) + 10, 0, currentLimitSec);
    audio.currentTime = next;
    tCur.textContent = fmtTime(next);
  });
}

async function init(){
  DATA = await loadCatalog();

  // skins (cargados desde JSON, con fallback seguro)
  await loadDockSkins();

  // listeners
  wireDock();

  // aplica la skin guardada al dock
  applyDockSkinById(getSavedDockSkinId());

  // rellena lista de skins, pero arranca cerrada siempre
  renderSkinList();
  toggleSkinList(false); // <-- CLAVE: que no salga desplegada

  // clicks en el contenido
  $("#app").addEventListener("click", onAppClick, { passive:true });

  // router
  window.addEventListener("hashchange", route);
  route();
}
// Debug visible (iOS): si algo revienta, lo ves en pantalla
window.addEventListener("error", (e)=>{
  const msg = (e?.message || "Error JS") + (e?.filename ? `\n${e.filename}:${e.lineno}` : "");
  let box = document.getElementById("debugErr");
  if(!box){
    box = document.createElement("pre");
    box.id = "debugErr";
    box.style.position = "fixed";
    box.style.left = "10px";
    box.style.right = "10px";
    box.style.top = "70px";
    box.style.zIndex = "999999";
    box.style.padding = "10px";
    box.style.borderRadius = "12px";
    box.style.background = "rgba(0,0,0,.75)";
    box.style.color = "#fff";
    box.style.fontSize = "12px";
    box.style.whiteSpace = "pre-wrap";
    document.body.appendChild(box);
  }
  box.textContent = msg;
});
init().catch(err=>{
  console.error(err);
  alert("Error arrancando la app: " + (err?.message || String(err)));
});
