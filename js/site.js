/* Accueil : thème, menu, carte au clic. Le voyage 3D n'est plus là. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var toastEl = $('#toast'), toastTimer = 0;
  function toast(msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 3400);
  }

  var theme = root.getAttribute('data-theme') === 'nuit' ? 'nuit' : 'jour';
  function paintTheme(id) {
    theme = id === 'nuit' ? 'nuit' : 'jour';
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('bsides-theme', theme); } catch (e) {}
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'nuit' ? '#0B0E14' : '#F4F1EA');
    var btn = $('#theme-btn'), label = $('#theme-label');
    if (btn) btn.setAttribute('aria-pressed', String(theme === 'nuit'));
    if (label) label.textContent = theme === 'nuit' ? 'Thème clair' : 'Thème sombre';
    if (window.Holo) window.Holo.setTheme();
  }
  function setTheme(id) { paintTheme(id); }
  paintTheme(theme);
  var themeBtn = $('#theme-btn');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    setTheme(theme === 'nuit' ? 'jour' : 'nuit');
  });

  window.BS = { get theme() { return theme; }, setTheme: setTheme, toast: toast };

  var year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  function goTo(sel) {
    var el = $(sel);
    if (!el) return;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href');
    if (id.length < 2 || !$(id)) return;
    e.preventDefault();
    goTo(id);
    try { history.replaceState(null, '', id); } catch (err) {}
    setMenu(false);
  });

  var menuBtn = $('#menu-btn');
  var mobileNav = $('#mobile-nav');
  var menuOpen = false;
  function setMenu(open) {
    menuOpen = open;
    if (!menuBtn || !mobileNav) return;
    menuBtn.setAttribute('aria-expanded', String(open));
    mobileNav.hidden = !open;
  }
  if (menuBtn) menuBtn.addEventListener('click', function () { setMenu(!menuOpen); });

  var header = $('#header');
  var links = $$('.nav a[href^="#"]');
  function onScroll() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 8);
    var current = '';
    links.forEach(function (a) {
      var el = $(a.getAttribute('href'));
      if (!el) return;
      if (el.getBoundingClientRect().top < 140) current = a.getAttribute('href');
    });
    links.forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === current);
    });
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var copyBtn = $('#copy-address');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var label = $('span', copyBtn);
    var txt = 'ESIROI, 40 avenue de Soweto, 97410 Saint-Pierre, La Réunion';
    var done = function () {
      label.textContent = 'Adresse copiée';
      setTimeout(function () { label.textContent = 'Copier l’adresse'; }, 2000);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, done);
    else done();
  });

  var mapBtn = $('#map-load');
  if (mapBtn) mapBtn.addEventListener('click', function () {
    var frame = mapBtn.parentElement;
    var iframe = document.createElement('iframe');
    iframe.title = 'Carte de l’ESIROI à Saint-Pierre';
    iframe.src = 'https://www.google.com/maps?q=ESIROI%20Saint-Pierre%20La%20R%C3%A9union&output=embed';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.allowFullscreen = true;
    frame.replaceChildren(iframe);
  });
})();
