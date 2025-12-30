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
let loadedTrack = null; // ← NUEVO: track cargado pero no necesariamente en reproducción

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

/* =========================================================
   CARGA DE TRACK (SIN AUTOPLAY)
========================================================= */
function loadTrackById(trackId){
  const track = byId(DATA.tracks, trackId);
  if(!track) return;

  setQueueFromTrack(trackId);
  loadedTrack = track;

  openDock();
  updateDockUI(track);
  setMediaSession(track);

  const url = safeUrl(track.previewUrl);
  clearTimeout(hardStopTimer);
  audio.pause();
  audio.currentTime = 0;

  if(!url){
    audio.removeAttribute("src");
    audio.load();
    btnPlay.textContent = "Sin preview";
    btnPlay.disabled = true;
    seek.value = "0";
    tCur.textContent = "0:00";
    tMax.textContent = "0:30";
    return;
  }

  btnPlay.disabled = false;
  audio.src = url;
  audio.load();

  const limit = Number(track.durationSec || PREVIEW_FALLBACK_SEC);
  seek.max = String(limit);
  seek.value = "0";
  tCur.textContent = "0:00";
  tMax.textContent = fmtTime(limit);

  btnPlay.textContent = "Play";
}

/* =========================================================
   REPRODUCIR TRACK YA CARGADO
========================================================= */
async function playLoadedTrack(){
  if(!loadedTrack || btnPlay.disabled) return;

  try{
    await audio.play();
    btnPlay.textContent = "Pausa";
  }catch(e){
    console.error(e);
    return;
  }

  const limit = Number(seek.max || PREVIEW_FALLBACK_SEC);
  clearTimeout(hardStopTimer);
  hardStopTimer = setTimeout(()=>{
    audio.pause();
    audio.currentTime = 0;
    btnPlay.textContent = "Play";
    seek.value = "0";
    tCur.textContent = "0:00";
  }, limit * 1000);
}

/* =========================================================
   ATAJO INTERNO: cargar + reproducir
   (solo usado por Prev / Next)
========================================================= */
async function playTrackById(trackId){
  loadTrackById(trackId);
  await playLoadedTrack();
}

/* =========================================================
   EVENTOS UI
========================================================= */
function wireDock(){
  btnNow.addEventListener("click", ()=>{
    const id = DATA?.featured?.trackId || DATA?.tracks?.[0]?.id;
    if(id) loadTrackById(id); // ← YA NO reproduce
  });

  btnCloseDock.addEventListener("click", ()=>{
    dock.hidden = true;
    stopPlayback();
    loadedTrack = null;
  });

  btnPlay.addEventListener("click", async ()=>{
    if(btnPlay.disabled) return;

    if(audio.paused){
      await playLoadedTrack();
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

  btnSpotify.addEventListener("click", (e)=>{
    e.preventDefault();
    openAppOrWeb(btnSpotify.dataset.app, btnSpotify.dataset.web);
  });

  btnYTM.addEventListener("click", (e)=>{
    e.preventDefault();
    openAppOrWeb(btnYTM.dataset.app, btnYTM.dataset.web);
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

  audio.addEventListener("ended", ()=>{
    btnPlay.textContent = "Play";
  });
}

/* =========================================================
   CLICK EN TRACK DESDE LA PÁGINA
   (YA NO AUTOPLAY)
========================================================= */
function onAppClick(e){
  const el = e.target.closest("[data-action]");
  if(!el) return;

  if(el.dataset.action === "play"){
    loadTrackById(el.dataset.track); // ← CLAVE
    return;
  }
}

/* =========================================================
   INIT
========================================================= */
async function init(){
  DATA = await loadCatalog();
  wireDock();

  $("#app").addEventListener("click", onAppClick, { passive:true });

  window.addEventListener("hashchange", route);
  route();
}

init().catch(err=>{
  console.error(err);
  alert("Error arrancando la app: " + (err?.message || String(err)));
});
