/* =========================================================
   Visualizer Spectrum 24 barras – Web Audio API (robusto)
========================================================= */
(function(){
  function initSpectrum(audioEl, vizEl){
    if(!audioEl || !vizEl) return;

    const bars = vizEl.querySelectorAll('.bar');
    const BAR_COUNT = 24;

    let ctx, analyser, src, data;
    let raf = null;
    let running = false;

    function setup(){
      if(ctx) return true;

      try{
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.55;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -20;
        // Si alguien ya creó MediaElementSource con este <audio>, esto puede lanzar error
        src = ctx.createMediaElementSource(audioEl);
        src.connect(analyser);
        analyser.connect(ctx.destination);

        data = new Uint8Array(analyser.frequencyBinCount);
        return true;
      }catch(e){
        console.warn("[viz24] No se pudo crear el grafo de audio:", e);
        return false;
      }
    }

    function freqIndex(i){
      const min = 60;
      const max = 12000;
      const nyquist = ctx.sampleRate / 2;

      const t = i / (BAR_COUNT - 1);
      const f = min * Math.pow(max / min, t);

      const idx = Math.round((f / nyquist) * data.length);
      return Math.min(data.length - 1, Math.max(0, idx));
    }

    function draw(){
      if(!running) return;

      analyser.getByteFrequencyData(data);

      for(let i=0;i<BAR_COUNT;i++){
        const half = BAR_COUNT / 2; // 12
const j = i < half ? i : i - half;

// Base (zona correspondiente)
const idxA = freqIndex(j);

// Complemento (mezcla espejo suave)
const idxB = freqIndex((half - 1) - j);

const vA = data[idxA] / 255;
const vB = data[idxB] / 255;

// Mezcla: mantiene vida al final sin falsear del todo
const v = (vA * 0.75) + (vB * 0.25);

// 1) Noise gate: si hay poco, lo consideramos casi cero (baja mucho)
const gate = 0.10;
const vg = v < gate ? 0 : (v - gate) / (1 - gate);

// 2) Curva gamma (>1) para que en bajos niveles caiga MUCHO
const gamma = 2.2;
const shaped = Math.pow(vg, gamma);

// 3) Escala final: suelo muy bajo + rango amplio hasta picos rojos
const floor = 0.02;     // mínimo real (muy abajo)
const gain  = 1.60;     // amplitud de subida (picos altos)
const level = floor + shaped * gain;

bars[i].style.transform = `scaleY(${level})`;

    async function start(){
      if(!setup()) return;

      // iOS: resume suele requerir gesto. Si el play viene de botón, OK.
      if(ctx.state !== "running"){
        try{ await ctx.resume(); }catch(e){}
      }

      if(running) return;
      running = true;
      draw();
    }

    function stop(){
      running = false;
      if(raf) cancelAnimationFrame(raf);
bars.forEach(b => b.style.transform = "scaleY(0.02)");
    }

    audioEl.addEventListener("play", start);
    audioEl.addEventListener("pause", stop);
    audioEl.addEventListener("ended", stop);

    if(!audioEl.paused) start();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initSpectrum(
      document.getElementById("audio") || document.querySelector("audio"),
      document.getElementById("viz24")
    );
  });
})();
