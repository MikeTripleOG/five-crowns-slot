// GAME TITLE - the ONE place to rename the game ("Five Crowns" is a placeholder: registered trademark of a card game).
// Drives the page title, the web-app manifest name and every code-drawn title. Art-baked titles (video, PNGs) are separate assets.
window.FC_TITLE = 'Five Crowns';
(function (t) {
  document.title = t + ' - Free Play Demo';
  const m = { name: t + ' - Free Play Demo', short_name: t, start_url: '.', display: 'standalone', background_color: '#0b0603', theme_color: '#1a0f05' };
  const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(m)); document.head.appendChild(l);
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('[data-title]').forEach(e => { e.textContent = t.toUpperCase(); }));
})(window.FC_TITLE);
