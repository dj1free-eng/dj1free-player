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
const DOCK_SKINS = [
  {
    id: "basic",
    name: "Básico",
    thumb: "assets/skins/thumb-basic.png",
    url: "assets/skins/dock-skin.png",
    portrait: "assets/skins/dock-skin.png"
  },
  {
    id: "stranger",
    name: "Stranger Things",
    thumb: "assets/skins/thumb-stranger.png",
    url: "assets/skins/dock-skin-stranger.png",
    portrait: "assets/skins/dock-skin-stranger.png"
  },
  {
    id: "neon",
    name: "Neon",
    thumb: "assets/skins/thumb-neon.png",
    url: "assets/skins/dock-skin-neon.png",
    portrait: "assets/skins/dock-skin-neon.png"
  },
     {
    id: "ufc",
    name: "UFC",
    thumb: "assets/skins/thumb-ufc.png",
    url: "assets/skins/dock-skin-ufc.png",
    portrait: "assets/skins/dock-skin-ufc.png"
  }
];

const LS_DOCK_SKIN = "dj1free_dock_skin";

function getSavedDockSkinId(){
  try{ return localStorage.getItem(LS_DOCK_SKIN) || "basic"; }
  catch(_){ return "basic"; }
}

function setSavedDockSkinId(id){
  try{ localStorage.setItem(LS_DOCK_SKIN, id); }catch(_){}
}

function applyDockSkinById(id){
  const skin = DOCK_SKINS.find(s => s.id === id) || DOCK_SKINS[0];
  if(!dock) return;

  // Una sola imagen siempre (sin landscape)
  dock.style.backgroundImage = `url("${skin.url}")`;

  setSavedDockSkinId(skin.id);
}
function cycleDockSkin(){
  const currentId = getSavedDockSkinId();
  const idx = DOCK_SKINS.findIndex(s => s.id === currentId);
  const next = DOCK_SKINS[(idx + 1 + DOCK_SKINS.length) % DOCK_SKINS.length];
  applyDockSkinById(next.id);
}
function renderSkinList(){
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
              <div class="cardCover" style="background-image:url('${encodeURI(safeUrl(r.cover))}')"></div>
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
                <div class="cardCover" style="background-image:url('${encodeURI(coverForTrack(t))}')"></div>
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
  const featured = byId(DATA.tracks, DATA.featured?.trackId) || DATA.tracks[0];
  const rel = featured ? releaseById(featured.releaseId) : null;
  const heroBg = coverForTrack(featured);

  $("#app").innerHTML = `
    <section class="hero">
      <div class="heroBg" style="background-image:url('${encodeURI(heroBg)}')"></div>
      <div class="heroOverlay"></div>
      <div class="heroBody">
        <div class="heroCover" style="background-image:url('${encodeURI(heroBg)}')"></div>
        <div class="heroText">
          <div class="heroKicker">Destacado</div>
          <div class="heroTitle">${escapeHtml(featured?.title || "—")}</div>
          <div class="heroMeta">${escapeHtml(artistName(featured?.artistId))}${rel?.title ? " · " + escapeHtml(rel.title) : ""}</div>

          <div class="heroBtns">
            <button class="btn primary" data-action="play" data-track="${featured?.id || ""}">▶ Reproducir 30s</button>
            ${featured?.spotifyUrl ? `<a class="btn" target="_blank" rel="noreferrer noopener" href="${featured.spotifyUrl}">Spotify</a>` : ""}
            ${featured?.ytMusicUrl ? `<a class="btn" target="_blank" rel="noreferrer noopener" href="${featured.ytMusicUrl}">YouTube Music</a>` : ""}
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="sectionHead">
        <h2 class="h2">Explorar</h2>
        <div class="small">Elige una sección</div>
      </div>
      <div class="grid">
        <article class="card" onclick="location.hash='#/albums'">
          <div class="cardInner">
            <div>
              <div class="cardTitle">Álbumes</div>
              <div class="cardSub">Ver todos los álbumes</div>
            </div>
            <div class="badge good">Abrir</div>
          </div>
        </article>

        <article class="card" onclick="location.hash='#/singles'">
          <div class="cardInner">
            <div>
              <div class="cardTitle">Singles</div>
              <div class="cardSub">Ver todos los singles</div>
            </div>
            <div class="badge good">Abrir</div>
          </div>
        </article>

        <article class="card" onclick="location.hash='#/artists'">
          <div class="cardInner">
            <div>
              <div class="cardTitle">Artistas</div>
              <div class="cardSub">Ir a artistas</div>
            </div>
            <div class="badge good">Abrir</div>
          </div>
        </article>
      </div>
    </section>
  `;
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
  dockCover.style.backgroundImage = `url("${encodeURI(coverForTrack(track))}")`;
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
    stopPlayback();
  });

  // =========================
  // Cerrar dock (botón X)
  // =========================
  btnCloseDock?.addEventListener("click", ()=>{
    dock.hidden = true;
    if(dockScrim) dockScrim.hidden = true;
    stopPlayback();
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
      }catch(e){
        console.error(e);
      }
    }else{
      audio.pause();
      btnPlay.textContent = "Play";
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
