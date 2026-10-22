/* Pages d'information : année du pied de page et intro volcanique.
   L'intro ne s'affiche que sur les pages qui portent le bloc #boot (bénévoles, partenaires, appel à contributions). */
(function () {
  'use strict';
  var root = document.documentElement;
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  var boot = document.getElementById('boot');
  if (!boot) return;
  if (!root.classList.contains('is-booting')) { boot.remove(); return; }

  function setPageInert(on) {
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el.id === 'boot') return;
      el.inert = on;
    });
  }
  setPageInert(true);

  var pct = document.getElementById('boot-pct'), bar = document.getElementById('boot-bar');
  var skip = document.getElementById('boot-skip'), embers = document.getElementById('boot-embers');
  var done = false, p = 0, timer = 0;

  if (embers) {
    for (var i = 0; i < 26; i++) {
      var e = document.createElement('i');
      e.style.left = (Math.random() * 100).toFixed(2) + '%';
      e.style.setProperty('--dx', ((Math.random() - .5) * 170).toFixed(0) + 'px');
      e.style.animationDelay = (Math.random() * 3.8).toFixed(2) + 's';
      e.style.animationDuration = (2.8 + Math.random() * 2.4).toFixed(2) + 's';
      embers.appendChild(e);
    }
  }

  function finish() {
    if (done) return;
    done = true;
    clearInterval(timer);
    if (pct) pct.textContent = '100';
    if (bar) bar.style.transform = 'scaleX(1)';
    setTimeout(function () { boot.classList.add('is-done'); }, 240);
    setTimeout(function () {
      root.classList.remove('is-booting');
      boot.remove();
      setPageInert(false);
    }, 1200);
  }

  function tick() {
    p = Math.min(100, p + 4 + Math.random() * 13);
    if (pct) pct.textContent = (Math.floor(p) < 10 ? '0' : '') + Math.floor(p);
    if (bar) bar.style.transform = 'scaleX(' + (p / 100) + ')';
    if (p >= 100) { clearInterval(timer); setTimeout(finish, 300); }
  }

  timer = setInterval(tick, 105);
  if (skip) skip.addEventListener('click', finish);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') finish(); });
  window.addEventListener('load', function () { setTimeout(function () { if (!done) finish(); }, 800); });
})();
