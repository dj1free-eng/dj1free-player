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
        analyser.smoothingTimeConstant = 0.8;

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
        const idx = freqIndex(i);
        const v = data[idx] / 255;

const level = 0.06 + Math.pow(v, 0.45) * 1.10;
        bars[i].style.transform = `scaleY(${level})`;
      }

      raf = requestAnimationFrame(draw);
    }

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
      bars.forEach(b => b.style.transform = "scaleY(0.15)");
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
