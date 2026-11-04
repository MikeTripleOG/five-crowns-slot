// Feature flags. Some regulated markets ban autoplay, turbo and/or quick-stop: switch them off here
// (or per URL for testing: ?autoplay=0&turbo=0&quickstop=0). Presentation only - none of these affect the math/RTP.
window.FC_FEATURES = { autoplay: true, turbo: true, quickStop: true, introVideo: true, bonusVideo: true };
(function () { const q = new URLSearchParams(location.search); for (const k of ['autoplay', 'turbo', 'quickStop', 'introVideo', 'bonusVideo']) { const v = q.get(k.toLowerCase()) ?? q.get(k); if (v !== null) window.FC_FEATURES[k] = v !== '0'; } })();
