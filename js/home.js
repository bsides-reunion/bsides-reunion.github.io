/* BSides Réunion — accueil.
   Tout est facultatif : sans JavaScript, la page reste complète et lisible.
   Dates et états : voir EVENTS. C'est le seul endroit à modifier pour tenir la page à jour. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Dates (heure de La Réunion, UTC+4, pas d'heure d'été) ---------- */
  var EVENTS = {
    cybertour: '2026-10-23',   // CTF du CyberTour (vendredi 23 octobre 2026, matinée)
    bsides2027: '2027-03-09'   // BSides Réunion 2027 (mardi 9 mars 2027)
  };
  var DAY = 864e5;
  function dayIndex(iso) { var p = iso.split('-'); return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY); }
  function today() { return Math.floor((Date.now() + 4 * 3600e3) / DAY); }
  function diffDays(iso) { return dayIndex(iso) - today(); }
  function rel(n) {
    if (n < 0) return 'Terminé';
    if (n === 0) return 'Aujourd’hui';
    if (n === 1) return 'Demain';
    return 'Dans ' + n + ' jours';
  }

  function paintDates() {
    var d = diffDays(EVENTS.cybertour);
    var phase = d > 0 ? 'before' : d === 0 ? 'on' : 'after';
    root.setAttribute('data-ctf', phase);

    var pill = $('#ctf-pill'), label = $('#ctf-pill-label');
    if (pill && label) {
      pill.setAttribute('data-state', phase);
      label.textContent = phase === 'after' ? 'CTF terminé' : rel(d);
    }

    var c = $('#count-2027');
    if (c) {
      var n = diffDays(EVENTS.bsides2027);
      c.textContent = n < 0 ? 'C’était le 9 mars' : n === 0 ? 'Aujourd’hui !' : n === 1 ? 'Demain !' : 'Dans ' + n + ' jours';
    }

    var hc = $('#hero-count');
    if (hc) hc.textContent = String(Math.max(0, diffDays(EVENTS.bsides2027)));

    var nextSet = false;
    $$('#cal li').forEach(function (li) {
      var iso = li.getAttribute('data-date'), tag = $('[data-tag]', li), state;
      if (iso && diffDays(iso) < 0) {
        state = 'past';
        if (tag) tag.textContent = 'Terminé';
      } else if (!nextSet) {
        state = 'next'; nextSet = true;
        if (tag && iso) tag.textContent = rel(diffDays(iso));
      } else {
        state = 'future';
        if (tag && iso) tag.textContent = rel(diffDays(iso));
      }
      li.setAttribute('data-state', state);
    });
  }
  paintDates();
  setInterval(paintDates, 10 * 60 * 1000);

  var year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Intro volcanique (une fois par session) ---------- */
  function setPageInert(on) {
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el.id === 'boot') return;
      el.inert = on;
    });
  }
  function placeOnLoad() {
    var hash = location.hash;
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    if (!hash || hash === '#' || hash === '#accueil') {
      window.scrollTo(0, 0);
    } else {
      var id = hash.slice(1);
      try { id = decodeURIComponent(id); } catch (err) {}
      var target = document.getElementById(id);
      if (target) target.scrollIntoView({ block: 'start' });
    }
    root.style.scrollBehavior = prev;
  }
  (function bootIntro() {
    var boot = $('#boot');
    if (!boot) { root.classList.add('booted'); return; }
    if (!root.classList.contains('is-booting')) { root.classList.add('booted'); boot.remove(); placeOnLoad(); return; }
    setPageInert(true);

    var pct = $('#boot-pct'), bar = $('#boot-bar'), skip = $('#boot-skip'), embers = $('#boot-embers');
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
      root.classList.add('booted');
      setTimeout(function () { boot.classList.add('is-done'); }, 240);
      setTimeout(function () {
        root.classList.remove('is-booting');
        boot.remove();
        setPageInert(false);
        requestAnimationFrame(function () {
          placeOnLoad();
          window.dispatchEvent(new Event('bs-boot-settled'));
        });
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
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') finish(); });
    window.addEventListener('load', function () { setTimeout(function () { if (!done) finish(); }, 800); });
  })();

  /* ---------- Logo du CyberTour : repli texte tant que le fichier n'est pas déposé ---------- */
  var ctLogo = $('#ct-logo'), ctImg = ctLogo && $('img', ctLogo);
  if (ctImg) {
    var noLogo = function () { ctLogo.classList.add('no-logo'); };
    if (ctImg.complete && ctImg.naturalWidth === 0) noLogo();
    ctImg.addEventListener('error', noLogo);
  }

  /* ---------- API minimale pour js/eggs.js ---------- */
  var toastEl = $('#toast'), toastTimer = 0;
  function toast(msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 3400);
  }
  window.BS = { theme: 'nuit', setTheme: function () {}, toast: toast };

  /* ---------- En-tête, menu mobile, jauge de lecture ---------- */
  var top = $('#top'), menuBtn = $('#menu-btn'), sheet = $('#sheet');
  var pFill = $('#top-progress-fill'), pDrop = $('#top-progress-drop');
  function onScroll() {
    if (top) top.classList.toggle('is-scrolled', window.scrollY > 6);
    if (pFill) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var p = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
      pFill.style.transform = 'scaleX(' + p + ')';
      if (pDrop) {
        pDrop.style.left = (p * 100) + '%';
        pDrop.classList.toggle('is-on', p > 0.004 && p < 0.995);
      }
    }
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  function setMenu(open) {
    if (!menuBtn || !sheet) return;
    menuBtn.setAttribute('aria-expanded', String(open));
    sheet.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (menuBtn) {
    menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
    sheet.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
    window.matchMedia('(min-width: 1180px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });
  }

  /* ---------- Repérage de la section courante ---------- */
  var navLinks = $$('#nav a[href^="#"]');
  var targets = navLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
  function spy() {
    var y = window.scrollY + Math.min(140, window.innerHeight * 0.22), cur = null;
    targets.forEach(function (el) { if (el.getBoundingClientRect().top + window.scrollY <= y) cur = el.id; });
    navLinks.forEach(function (a) {
      if (a.getAttribute('href') === '#' + cur) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }
  spy();
  window.addEventListener('scroll', spy, { passive: true });

  /* ---------- Apparition au défilement ---------- */
  var rvs = $$('.rv');
  var showAll = function () { rvs.forEach(function (el) { el.classList.add('in'); }); };
  rvs.forEach(function (el) {
    var p = el.parentElement;
    if (!p) return;
    var sibs = $$('.rv', p).filter(function (x) { return x.parentElement === p; });
    var i = sibs.indexOf(el);
    if (i > 0) el.style.setProperty('--d', (Math.min(i, 4) * 70) + 'ms');
  });
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        // Visible, ou déjà dépassé (ancre, rechargement en milieu de page) : on l'affiche.
        if (en.isIntersecting || en.boundingClientRect.top < 0) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -4% 0px', threshold: 0.04 });
    rvs.forEach(function (el) { io.observe(el); });
  } else {
    showAll();
  }

  /* ---------- Accroche du hero : découpe en mots pour l'animation ---------- */
  var tag = $('.hero-tag');
  if (tag && !reduce) {
    var lines = tag.innerHTML.split(/<br\s*\/?>/i);
    var wi = 0;
    tag.innerHTML = lines.map(function (line) {
      var words = line.trim().split(/\s+/).filter(Boolean).map(function (w) {
        return '<span class="w"><span style="transition-delay:' + (0.24 + wi++ * 0.055).toFixed(3) + 's">' + w + '</span></span>';
      }).join(' ');
      return '<span class="tag-line">' + words + '</span>';
    }).join('');
  }

  /* ---------- Boutons magnétiques ---------- */
  if (!reduce && window.matchMedia('(pointer: fine)').matches) {
    $$('.btn').forEach(function (btn) {
      btn.addEventListener('pointermove', function (e) {
        if (btn.disabled) return;
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - .5;
        var y = (e.clientY - r.top) / r.height - .5;
        btn.style.setProperty('--tx', (x * 7).toFixed(2) + 'px');
        btn.style.setProperty('--ty', (y * 5).toFixed(2) + 'px');
      });
      btn.addEventListener('pointerleave', function () {
        btn.style.setProperty('--tx', '0px');
        btn.style.setProperty('--ty', '0px');
      });
    });
  }

  /* ---------- Ignition des numéros de section ---------- */
  var secEls = $$('main > section[data-num]');
  if (secEls.length) {
    if ('IntersectionObserver' in window && !reduce) {
      var sio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in-view'); sio.unobserve(en.target); }
        });
      }, { rootMargin: '-8% 0px -18% 0px', threshold: 0.02 });
      secEls.forEach(function (s) { sio.observe(s); });
    } else {
      secEls.forEach(function (s) { s.classList.add('in-view'); });
    }
  }

  /* ---------- Ticker : assez de texte pour couvrir l'écran ---------- */
  var ticker = $('.ticker-track');
  if (ticker) {
    var tickerSpans = Array.prototype.slice.call(ticker.children);
    var fillTicker = function () {
      var guard = 0;
      while (ticker.scrollWidth < window.innerWidth * 2 && guard < 5) {
        tickerSpans.forEach(function (node) { ticker.appendChild(node.cloneNode(true)); });
        guard++;
      }
    };
    fillTicker();
    var tickerTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(tickerTimer);
      tickerTimer = setTimeout(fillTicker, 250);
    });
  }

  /* ---------- Parallaxe douce ---------- */
  var pxEls = reduce ? [] : $$('[data-parallax]');
  if (pxEls.length) {
    var pxTick = false;
    var movePx = function () {
      var vh = window.innerHeight;
      pxEls.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -240 || r.top > vh + 240) return;
        var f = parseFloat(el.getAttribute('data-parallax')) || .06;
        var off = -(r.top + r.height / 2 - vh / 2) * f;
        var max = Math.min(70, r.height * .08);
        off = Math.max(-max, Math.min(max, off));
        el.style.transform = 'translate3d(0,' + off.toFixed(1) + 'px,0)';
      });
      pxTick = false;
    };
    var onPx = function () { if (!pxTick) { pxTick = true; requestAnimationFrame(movePx); } };
    movePx();
    window.addEventListener('scroll', onPx, { passive: true });
    window.addEventListener('resize', onPx);
  }

  /* ---------- Compteurs du bilan ---------- */
  var counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window && !reduce) {
    var animateCount = function (el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var prefix = el.getAttribute('data-prefix') || '';
      var suffix = el.getAttribute('data-suffix') || '';
      var dur = 1200, t0 = 0;
      var step = function (t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / dur);
        var eased = 1 - Math.pow(1 - k, 3);
        el.textContent = prefix + Math.round(target * eased) + suffix;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { animateCount(en.target); cio.unobserve(en.target); }
      });
    }, { threshold: .55 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---------- Photos : si img/photos/<nom>.jpg existe, elle remplace l'illustration ---------- */
  var photoSlots = $$('[data-photo]');
  var loadPhoto = function (slot) {
    if (slot.getAttribute('data-loaded')) return;
    slot.setAttribute('data-loaded', '1');
    var name = slot.getAttribute('data-photo'), probe = new Image();
    probe.onload = function () {
      var img = document.createElement('img');
      img.className = 'photo'; img.src = probe.src; img.alt = slot.getAttribute('data-alt') || ''; img.decoding = 'async';
      img.width = probe.naturalWidth; img.height = probe.naturalHeight;
      slot.appendChild(img); slot.classList.add('has-photo');
    };
    probe.src = './img/photos/' + name + '.jpg';
  };
  if ('IntersectionObserver' in window) {
    var photoIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { loadPhoto(en.target); photoIO.unobserve(en.target); }
      });
    }, { rootMargin: '600px 0px' });
    photoSlots.forEach(function (slot) { photoIO.observe(slot); });
  } else {
    photoSlots.forEach(loadPhoto);
  }

  /* ---------- Carrousel des intervenants ---------- */
  var rail = $('#speakers'), prev = $('#conf-prev'), next = $('#conf-next');
  if (rail && prev && next) {
    var step = function () { var c = rail.firstElementChild; return c ? c.getBoundingClientRect().width + 18 : 240; };
    var upd = function () {
      prev.disabled = rail.scrollLeft < 8;
      next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8;
    };
    prev.addEventListener('click', function () { rail.scrollBy({ left: -step(), behavior: reduce ? 'auto' : 'smooth' }); });
    next.addEventListener('click', function () { rail.scrollBy({ left: step(), behavior: reduce ? 'auto' : 'smooth' }); });
    rail.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    rail.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
    });
    upd();
  }

  /* ---------- Adresse : copie ---------- */
  var ADDRESS = 'ESIROI, 40 avenue de Soweto, 97410 Saint-Pierre, La Réunion';
  var copyBtn = $('#copy-address');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var lab = $('.bl', copyBtn);
    var done = function (ok) {
      if (lab) lab.textContent = ok ? 'Adresse copiée' : 'Copie impossible';
      toast(ok ? 'Adresse copiée dans le presse-papiers.' : 'Sélectionnez l’adresse et copiez-la à la main.', 2200);
      setTimeout(function () { if (lab) lab.textContent = 'Copier l’adresse'; }, 2200);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(ADDRESS).then(function () { done(true); }, function () { done(false); });
    else done(false);
  });

  /* ---------- Carte : chargée au clic seulement (Google peut déposer des traceurs) ---------- */
  var mapBtn = $('#map-load'), mapBox = $('#map');
  if (mapBtn && mapBox) mapBtn.addEventListener('click', function () {
    var f = document.createElement('iframe');
    f.src = 'https://www.google.com/maps?q=' + encodeURIComponent('40 avenue de Soweto, 97410 Saint-Pierre, La Réunion') + '&hl=fr&z=15&output=embed';
    f.title = 'Carte : 40 avenue de Soweto, Saint-Pierre';
    f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade';
    f.setAttribute('allowfullscreen', '');
    mapBox.appendChild(f);
    mapBox.classList.add('is-live');
  });
})();
