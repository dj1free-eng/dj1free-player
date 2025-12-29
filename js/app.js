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
const btnPrev = $("#btnPrev");
const btnNext = $("#btnNext");
const btnNow = $("#btnNow");
const btnCloseDock = $("#btnCloseDock");
const btnSpotify = $("#btnSpotify");
const btnYTM = $("#btnYTM");
const seek = $("#seek");
const tCur = $("#tCur");
const tMax = $("#tMax");

let queue = [];
let queueIndex = -1;
let hardStopTimer = null;

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
  $$(".navlink").forEach(a => a.classList.toggle("active", a.dataset.route === path));
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

function sectionArtists(title, artists){
  return `
    <section class="section">
      <div class="sectionHead">
        <h2 class="h2">${escapeHtml(title)}</h2>
        <div class="small">${artists.length} artistas</div>
      </div>
      <div class="grid">
        ${artists.map(a => `
          <article class="card" data-action="openArtist" data-artist="${a.id}">
            <div class="cardInner">
              <div class="cardCover" style="background-image:url('${encodeURI(safeUrl(a.banner))}')"></div>
              <div>
                <div class="cardTitle">${escapeHtml(a.name)}</div>
                <div class="cardSub">Ver catálogo</div>
              </div>
              <div class="badge">Artista</div>
            </div>
          </article>
        `).join("")}
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

  $("#app").addEventListener("click", onAppClick, { passive:true });
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
  $("#app").addEventListener("click", onAppClick, { passive:true });
}

function buildArtist(id){
  const a = byId(DATA.artists, id);
  if(!a) return notFound("Artista no encontrado");
  const rels = (DATA.releases||[]).filter(r => r.artistId === id);
  const tracks = DATA.tracks.filter(t => t.artistId === id);

  $("#app").innerHTML = `
    <section class="hero">
      <div class="heroBg" style="background-image:url('${encodeURI(safeUrl(a.banner))}')"></div>
      <div class="heroOverlay"></div>
      <div class="heroBody">
        <div class="heroCover" style="background-image:url('${encodeURI(safeUrl(a.banner))}')"></div>
        <div class="heroText">
          <div class="heroKicker">Artista</div>
          <div class="heroTitle">${escapeHtml(a.name)}</div>
          <div class="heroMeta">${rels.length} releases · ${tracks.length} temas</div>
          <div class="heroBtns">
            <a class="btn" href="#/">← Home</a>
          </div>
        </div>
      </div>
    </section>
    ${sectionReleases("Releases", rels.sort((x,y)=>(y.year||0)-(x.year||0)).slice(0,50))}
    ${sectionTracks("Temas", tracks.slice(0,200))}
  `;
  $("#app").addEventListener("click", onAppClick, { passive:true });
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
  $("#app").addEventListener("click", onAppClick, { passive:true });
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

function openDock(){ dock.hidden = false; }
function stopPlayback(){
  clearTimeout(hardStopTimer);
  hardStopTimer = null;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  seek.value = "0";
  tCur.textContent = "0:00";
}

function updateDockUI(track){
  const rel = releaseById(track.releaseId);
  dockCover.style.backgroundImage = `url("${encodeURI(coverForTrack(track))}")`;
  dockTitle.textContent = track.title || "—";
  dockSub.textContent = `${artistName(track.artistId)}${rel?.title ? " · " + rel.title : ""}`;

  const sp = safeUrl(track.spotifyUrl);
  const yt = safeUrl(track.ytMusicUrl);
  btnSpotify.href = sp || "#";
  btnSpotify.style.opacity = sp ? "1" : ".4";
  btnSpotify.style.pointerEvents = sp ? "auto" : "none";

  btnYTM.href = yt || "#";
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

  const url = safeUrl(track.previewUrl);
  if(!url){
    btnPlay.textContent = "Sin preview";
    btnPlay.disabled = true;
    return;
  }

  btnPlay.disabled = false;

  clearTimeout(hardStopTimer);
  audio.pause();
  audio.currentTime = 0;
  audio.src = url;
  audio.load();

  try{
    await audio.play();
    btnPlay.textContent = "Pausa";
  }catch(e){
    btnPlay.textContent = "Play";
    console.error(e);
  }

  const limit = Number(track.durationSec || PREVIEW_FALLBACK_SEC);
  seek.max = String(limit);
  tMax.textContent = fmtTime(limit);

  hardStopTimer = setTimeout(()=>{
    audio.pause();
    audio.currentTime = 0;
    btnPlay.textContent = "Play";
    seek.value = "0";
    tCur.textContent = "0:00";
  }, limit * 1000);
}

function wireDock(){
  $("#btnNow").addEventListener("click", ()=>{
    const id = DATA?.featured?.trackId || DATA?.tracks?.[0]?.id;
    if(id) playTrackById(id);
  });

  $("#btnCloseDock").addEventListener("click", ()=>{
    dock.hidden = true;
    stopPlayback();
  });

  btnPlay.addEventListener("click", async ()=>{
    if(btnPlay.disabled) return;
    if(audio.paused){
      try{ await audio.play(); btnPlay.textContent = "Pausa"; }catch(e){ console.error(e); }
    }else{
      audio.pause();
      btnPlay.textContent = "Play";
    }
  });

  btnPrev.addEventListener("click", ()=>{
    if(queue.length === 0) return;
    queueIndex = (queueIndex - 1 + queue.length) % queue.length;
    playTrackById(queue[queueIndex].id);
  });

  btnNext.addEventListener("click", ()=>{
    if(queue.length === 0) return;
    queueIndex = (queueIndex + 1) % queue.length;
    playTrackById(queue[queueIndex].id);
  });

  seek.addEventListener("input", ()=>{
    audio.currentTime = Number(seek.value);
    tCur.textContent = fmtTime(Number(seek.value));
  });

  audio.addEventListener("timeupdate", ()=>{
    const limit = Number(seek.max || PREVIEW_FALLBACK_SEC);
    const t = Math.min(audio.currentTime || 0, limit);
    seek.value = String(t);
    tCur.textContent = fmtTime(t);
  });

  audio.addEventListener("ended", ()=>{ btnPlay.textContent = "Play"; });
}

async function init(){
  DATA = await loadCatalog();
  wireDock();
  window.addEventListener("hashchange", route);
  route();
}

init().catch(err=>{
  console.error(err);
  alert("Error arrancando la app: " + (err?.message || String(err)));
});
