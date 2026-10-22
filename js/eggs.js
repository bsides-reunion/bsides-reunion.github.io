/* ==========================================================================
   eggs.js — petits secrets du site (à ne pas dire trop fort).
   - Code Konami            → « mode hacker » (thème sombre, scanlines) + turbo
   - Touche H               → un coup de klaxon
   - 7 clics sur le logo    → un indice vers le jeu
   - Double-clic sur le pied de page géant → glitch
   - Palette (Ctrl K) : sudo · flag · konami · turbo
   - La console du navigateur dit bonjour.
   ========================================================================== */
(function () {
  'use strict';
  var BS = window.BS;
  if (!BS) return;
  var root = document.documentElement;
  var typing = function (t) { return t && /^(input|textarea|select)$/i.test(t.tagName); };

  /* --- son : deux notes courtes, créées à la demande --- */
  var ac = null;
  function beep(freqs, dur) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var t = ac.currentTime;
      freqs.forEach(function (f, i) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * dur);
        g.gain.exponentialRampToValueAtTime(0.06, t + i * dur + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (i + 1) * dur);
        o.connect(g); g.connect(ac.destination);
        o.start(t + i * dur); o.stop(t + (i + 1) * dur + 0.02);
      });
    } catch (e) {}
  }

  var hackTimer = 0, prevTheme = null;
  function run(name) {
    if (name === 'konami') {
      if (!prevTheme) prevTheme = BS.theme;
      BS.setTheme('nuit', { x: innerWidth / 2, y: innerHeight / 2 });
      root.classList.add('hacked');
      beep([523, 659, 784, 1047], 0.09);
      BS.toast('ACCESS GRANTED — mode turbo activé.', 4200);
      if (window.World) window.World.turbo(6000);
      clearTimeout(hackTimer);
      hackTimer = setTimeout(function () {
        root.classList.remove('hacked');
        if (prevTheme && prevTheme !== 'nuit') BS.setTheme(prevTheme, { x: innerWidth / 2, y: innerHeight / 2 });
        prevTheme = null;
      }, 6500);
    } else if (name === 'sudo') {
      BS.toast('sudo : vous n’êtes pas dans le fichier sudoers. Cet incident sera signalé.', 4200);
    } else if (name === 'flag') {
      BS.toast('cat: flag.txt: Permission denied. Essayez plutôt /jeu.html : le coffre est à craquer.', 4200);
    } else if (name === 'turbo') {
      beep([330, 440, 660], 0.07);
      if (window.World) window.World.turbo(5000);
      BS.toast('Turbo !', 2200);
    } else if (name === 'honk') {
      beep([392, 330], 0.14);
      BS.toast('Pin-pin !', 1400);
    } else if (name === 'hint') {
      BS.toast('Indice : /jeu.html. Un coffre, quatre symboles, dix essais.', 5200);
    } else if (name === 'glitch') {
      var g = document.getElementById('footer-giant');
      if (g) { g.classList.add('glitch'); setTimeout(function () { g.classList.remove('glitch'); }, 1400); }
      beep([140, 90, 200], 0.05);
    }
  }
  window.BSEggs = { run: run };

  /* --- Konami + klaxon --- */
  var seq = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  var pos = 0;
  document.addEventListener('keydown', function (e) {
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === seq[pos]) { pos++; if (pos === seq.length) { pos = 0; run('konami'); } }
    else pos = k === seq[0] ? 1 : 0;
    if (k === 'h') run('honk');
  });

  /* --- 7 clics sur le logo --- */
  var brand = document.getElementById('brand');
  var clicks = 0, clickTimer = 0;
  if (brand) {
    brand.addEventListener('click', function () {
      clicks++;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(function () { clicks = 0; }, 2500);
      if (clicks >= 7) { clicks = 0; run('hint'); }
    });
  }

  /* --- pied de page géant --- */
  var giant = document.getElementById('footer-giant');
  if (giant) giant.addEventListener('dblclick', function () { run('glitch'); });

  /* --- console --- */
  try {
    console.log(
      '%c BSides Réunion %c\n\nTu lis la console, bonne habitude.\nIl y a un jeu quelque part : /jeu.html\nUn coffre y garde un flag.\n\nTouche H : klaxon. Code Konami : à toi de jouer.',
      'background:#E8571C;color:#0F1218;font:700 14px monospace;padding:4px 8px;border-radius:4px', 'font:12px monospace'
    );
  } catch (e) {}
})();
