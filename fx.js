// Five Crowns visual FX: background embers, coin showers, flashes, shake, count-ups. Canvas + CSS transforms only.
(function (root) {
  const RM = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(2, root.devicePixelRatio || 1);
  // ---- embers (background canvas) ----
  const ec = document.getElementById('embers'), ex = ec.getContext('2d'); let embers = [], eRAF = 0;
  function sizeE() { ec.width = innerWidth * DPR; ec.height = innerHeight * DPR; }
  function spawnEmber(y) { return { x: Math.random() * ec.width, y: y ?? ec.height + 10, vy: -(0.3 + Math.random() * 0.9) * DPR, vx: (Math.random() - 0.5) * 0.3 * DPR, r: (0.8 + Math.random() * 2.2) * DPR, a: 0.3 + Math.random() * 0.6, ph: Math.random() * 6.28, mote: Math.random() < 0.15 }; }
  function startEmbers() {
    sizeE(); addEventListener('resize', sizeE);
    const n = RM ? 12 : (innerWidth < 600 ? 34 : 60); embers = Array.from({ length: n }, () => spawnEmber(Math.random() * ec.height));
    const loop = t => {
      ex.clearRect(0, 0, ec.width, ec.height); ex.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        e.x += e.vx + Math.sin(t / 900 + e.ph) * 0.25 * DPR; e.y += e.vy;
        if (e.y < -10) Object.assign(e, spawnEmber());
        const fl = e.a * (0.6 + 0.4 * Math.sin(t / 200 + e.ph));
        ex.fillStyle = e.mote ? `rgba(255,240,200,${fl * 0.7})` : `rgba(255,${120 + (e.r * 30 | 0)},40,${fl})`;
        ex.beginPath(); ex.arc(e.x, e.y, e.mote ? e.r * 1.6 : e.r, 0, 6.283); ex.fill();
      }
      ex.globalCompositeOperation = 'source-over';
      eRAF = document.hidden ? 0 : requestAnimationFrame(loop);
    };
    eRAF = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !eRAF) eRAF = requestAnimationFrame(loop); });
  }
  // ---- coins (foreground canvas) ----
  const fc = document.getElementById('fx'), fx = fc.getContext('2d'); let parts = [], raf = 0;
  function coins(n = 80, mode = 'burst') {
    fc.width = innerWidth * DPR; fc.height = innerHeight * DPR; if (RM) n = Math.min(n, 25);
    for (let i = 0; i < n; i++) {
      let p;
      if (mode === 'shower') p = { x: Math.random() * fc.width, y: -Math.random() * fc.height * 0.6, vx: (Math.random() - 0.5) * 2 * DPR, vy: (2 + Math.random() * 4) * DPR };
      else { const a = Math.random() * 6.283, v = (4 + Math.random() * 11) * DPR; p = { x: fc.width / 2, y: fc.height * 0.42, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 7 * DPR }; }
      parts.push(Object.assign(p, { r: (6 + Math.random() * 7) * DPR, life: 110 + Math.random() * 60, sp: 0.1 + Math.random() * 0.3, g: mode === 'shower' ? 0.12 : 0.35 }));
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    fx.clearRect(0, 0, fc.width, fc.height); parts = parts.filter(p => p.life-- > 0 && p.y < fc.height + 40);
    for (const p of parts) {
      p.vy += p.g * DPR; p.x += p.vx; p.y += p.vy; const w = Math.abs(Math.cos(p.life * p.sp)) * p.r + 1;
      const gr = fx.createLinearGradient(p.x - w, p.y - p.r, p.x + w, p.y + p.r); gr.addColorStop(0, '#fff3a0'); gr.addColorStop(0.5, '#f5c242'); gr.addColorStop(1, '#a8661a');
      fx.fillStyle = gr; fx.strokeStyle = '#7a4a10'; fx.lineWidth = DPR; fx.beginPath(); fx.ellipse(p.x, p.y, w, p.r, 0, 0, 6.283); fx.fill(); fx.stroke();
    }
    raf = parts.length ? requestAnimationFrame(tick) : (fx.clearRect(0, 0, fc.width, fc.height), 0);
  }
  // ---- flash / shake ----
  function flash(color = '#fff', ms = 350, peak = 0.85) {
    const el = document.getElementById('flash'); el.style.background = color;
    el.animate([{ opacity: RM ? peak * 0.4 : peak }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  }
  function shake(el, mag = 10, ms = 450) {
    if (RM) return; const k = []; for (let i = 0; i <= 8; i++) { const d = mag * (1 - i / 8); k.push({ transform: `translate(${(Math.random() - 0.5) * 2 * d}px,${(Math.random() - 0.5) * 2 * d}px)` }); }
    k[8] = { transform: 'translate(0,0)' }; el.animate(k, { duration: ms, easing: 'linear' });
  }
  // ---- count-up (rAF, tappable skip via ctl.skip) ----
  function countUp(el, from, to, ms, fmt, onTick, ctl = {}) {
    return new Promise(res => {
      if (RM) ms = Math.min(ms, 300); const t0 = performance.now(); let last = 0;
      const step = t => { const k = ctl.skip ? 1 : Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e;
        el.textContent = fmt(v); if (onTick && t - last > 70 && k < 1) { last = t; onTick(); }
        if (k < 1) requestAnimationFrame(step); else { el.textContent = fmt(to); res(); } };
      requestAnimationFrame(step);
    });
  }
  root.FCFX = { RM, startEmbers, coins, flash, shake, countUp };
})(window);
