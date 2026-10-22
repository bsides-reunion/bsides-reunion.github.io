/* ==========================================================================
   game.js — « Le coffre » : un Mastermind à 4 symboles parmi 6, 10 essais.
   Gagner affiche le flag.

   Pour changer le flag : node tools/encode-flag.mjs "flag{...}" puis remplacer
   FLAG_ENC ci-dessous. C'est de l'obfuscation côté client, pas de la sécurité.
   Pour un vrai CTF, validez la partie côté serveur.
   ========================================================================== */
(function () {
  'use strict';

  var FLAG_ENC = [60, 13, 9, 8, 13, 17, 225, 212, 241, 246, 198, 193, 220, 208, 227, 167, 175, 142, 171, 190, 143, 131, 128, 164, 114, 96, 117, 101, 108, 64, 81];
  var decodeFlag = function () { return FLAG_ENC.map(function (c, i) { return String.fromCharCode(c ^ ((0x5a + i * 7) & 255)); }).join(''); };

  var SLOTS = 4, TRIES = 10;
  var SYMBOLS = ['A', 'B', 'C', 'D', 'E', 'F'];

  var $ = function (s) { return document.querySelector(s); };

  /* ---------- Son ---------- */
  var ac = null, muted = false;
  function beep(freqs, dur, type, vol) {
    if (muted) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var t = ac.currentTime;
      freqs.forEach(function (f, i) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = type || 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * dur);
        g.gain.exponentialRampToValueAtTime(vol || 0.05, t + i * dur + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (i + 1) * dur);
        o.connect(g); g.connect(ac.destination);
        o.start(t + i * dur); o.stop(t + (i + 1) * dur + 0.02);
      });
    } catch (e) {}
  }
  $('#mute').addEventListener('click', function () {
    muted = !muted;
    this.setAttribute('aria-pressed', String(muted));
    this.textContent = muted ? 'Son coupé' : 'Son activé';
  });

  /* ---------- Données ---------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
  };
  var wins = parseInt(store.get('bsides-vault-wins', '0'), 10) || 0;
  var best = parseInt(store.get('bsides-vault-best', '0'), 10) || 0;
  var solvedBefore = store.get('bsides-flag-ok', '0') === '1';

  var els = {
    board: $('#board'), pad: $('#pad'), ok: $('#b-ok'), del: $('#b-del'), nw: $('#b-new'), status: $('#status'),
    tries: $('#h-try'), wins: $('#h-wins'), best: $('#h-best'),
    flagBox: $('#flag-box'), flagCode: $('#flag-code'), flagCopy: $('#flag-copy'), vault: $('#vault')
  };

  var secret, history, current, over;

  var rand = function (n) {
    if (window.crypto && crypto.getRandomValues) { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
    return Math.floor(Math.random() * n);
  };

  /* ---------- Plateau ---------- */
  function buildBoard() {
    els.board.innerHTML = '';
    for (var r = 0; r < TRIES; r++) {
      var row = document.createElement('div');
      row.className = 'row'; row.dataset.row = r;
      var cells = document.createElement('div'); cells.className = 'cells';
      for (var c = 0; c < SLOTS; c++) { var s = document.createElement('span'); s.className = 'cell'; cells.appendChild(s); }
      var fb = document.createElement('div'); fb.className = 'fb';
      for (var p = 0; p < SLOTS; p++) { var pg = document.createElement('i'); pg.className = 'peg'; fb.appendChild(pg); }
      var n = document.createElement('span'); n.className = 'n mono'; n.textContent = String(r + 1).padStart(2, '0');
      row.appendChild(n); row.appendChild(cells); row.appendChild(fb);
      els.board.appendChild(row);
    }
  }
  function buildPad() {
    els.pad.innerHTML = '';
    SYMBOLS.forEach(function (sym) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'sym s-' + sym; b.textContent = sym;
      b.setAttribute('aria-label', 'Symbole ' + sym);
      b.addEventListener('click', function () { add(sym); });
      els.pad.appendChild(b);
    });
  }

  function paintRow(r, guess, fb) {
    var row = els.board.children[r];
    var cells = row.querySelectorAll('.cell');
    for (var i = 0; i < SLOTS; i++) {
      var g = guess[i];
      cells[i].textContent = g || '';
      cells[i].className = 'cell' + (g ? ' filled s-' + g : '');
    }
    if (fb) {
      var pegs = row.querySelectorAll('.peg');
      for (var k = 0; k < SLOTS; k++) pegs[k].className = 'peg' + (k < fb.hit ? ' hit' : k < fb.hit + fb.near ? ' near' : '');
      row.title = 'Essai ' + (r + 1) + ' : ' + guess.join(' ') + ', ' + fb.hit + ' bien placé(s), ' + fb.near + ' mal placé(s)';
    }
  }

  function render() {
    var r = history.length;
    for (var i = 0; i < TRIES; i++) els.board.children[i].classList.toggle('active', !over && i === r);
    if (!over) paintRow(r, current, null);
    els.ok.disabled = over || current.length !== SLOTS;
    els.tries.textContent = Math.min(r + (over ? 0 : 1), TRIES);
    els.wins.textContent = wins;
    els.best.textContent = best ? best + ' essai' + (best > 1 ? 's' : '') : '–';
    $('#b-del').disabled = over || !current.length;
  }

  function add(sym) {
    if (over || current.length >= SLOTS) return;
    current.push(sym);
    beep([300 + SYMBOLS.indexOf(sym) * 40], 0.04, 'triangle', 0.03);
    render();
  }
  function del() { if (over || !current.length) return; current.pop(); render(); }

  function score(guess, code) {
    var hit = 0, a = [], b = [];
    for (var i = 0; i < SLOTS; i++) { if (guess[i] === code[i]) hit++; else { a.push(guess[i]); b.push(code[i]); } }
    var near = 0;
    a.forEach(function (g) { var j = b.indexOf(g); if (j > -1) { near++; b.splice(j, 1); } });
    return { hit: hit, near: near };
  }

  function submit() {
    if (over || current.length !== SLOTS) return;
    var guess = current.slice(), fb = score(guess, secret), r = history.length;
    history.push({ guess: guess, fb: fb });
    paintRow(r, guess, fb);
    els.board.children[r].classList.add('done');
    current = [];
    if (fb.hit === SLOTS) { win(); return; }
    if (history.length >= TRIES) { lose(); return; }
    beep(fb.hit ? [440, 520] : [260], 0.07, 'square', 0.04);
    setStatus(fb.hit + ' bien placé' + (fb.hit > 1 ? 's' : '') + ', ' + fb.near + ' mal placé' + (fb.near > 1 ? 's' : '') + '. Encore ' + (TRIES - history.length) + ' essai' + (TRIES - history.length > 1 ? 's' : '') + '.');
    render();
  }

  function setStatus(t) { els.status.textContent = t; }

  function win() {
    over = true; wins++;
    store.set('bsides-vault-wins', wins);
    if (!best || history.length < best) { best = history.length; store.set('bsides-vault-best', best); }
    store.set('bsides-flag-ok', '1');
    els.vault.classList.add('open');
    showFlag();
    setStatus('Coffre ouvert en ' + history.length + ' essai' + (history.length > 1 ? 's' : '') + '. Le flag est ci-dessous.');
    beep([523, 659, 784, 1047, 1319], 0.1, 'square', 0.06);
    render();
  }
  function lose() {
    over = true;
    els.vault.classList.add('locked');
    setStatus('Coffre verrouillé. Le code était ' + secret.join(' ') + '. Un nouveau coffre vous attend.');
    beep([200, 150, 100], 0.15, 'sawtooth', 0.06);
    render();
  }
  function showFlag() {
    els.flagCode.textContent = decodeFlag();
    els.flagBox.hidden = false;
  }

  function newGame() {
    secret = []; for (var i = 0; i < SLOTS; i++) secret.push(SYMBOLS[rand(SYMBOLS.length)]);
    history = []; current = []; over = false;
    els.vault.classList.remove('open', 'locked');
    buildBoard();
    setStatus('Saisissez quatre symboles (clavier : A à F, Entrée pour valider).');
    if (!solvedBefore) els.flagBox.hidden = true;
    render();
  }

  els.ok.addEventListener('click', submit);
  els.del.addEventListener('click', del);
  els.nw.addEventListener('click', newGame);
  els.flagCopy.addEventListener('click', function () {
    var t = els.flagCode.textContent, b = this;
    var done = function () { b.textContent = 'Copié ✓'; setTimeout(function () { b.textContent = 'Copier'; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, done); else done();
  });

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toUpperCase();
    if (SYMBOLS.indexOf(k) > -1) { e.preventDefault(); add(k); }
    else if (/^[1-6]$/.test(e.key)) { e.preventDefault(); add(SYMBOLS[+e.key - 1]); }
    else if (e.key === 'Backspace') { e.preventDefault(); del(); }
    else if (e.key === 'Enter') {
      var t = document.activeElement && document.activeElement.tagName;
      if (/^(BUTTON|A)$/.test(t)) return;
      e.preventDefault(); submit();
    }
  });

  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  buildPad();
  newGame();
  if (solvedBefore) showFlag();
})();
