/* ==========================================================================
   world.js — Du globe à Saint-Pierre (Three.js r158, script classique)

   Scène 1  Globe de points : terres réelles (masque Natural Earth), graticule,
            atmosphère, villes BSides, arcs de données vers La Réunion.
   Scène 2  La Réunion en relief : terrain procédural calé sur la vraie côte,
            courbes de niveau, route GPS (Saint-Denis → Saint-Pierre), voiture.

   Piloté par site.js via World.setState({ s, road, place }) :
     s     0 → 4   progression de l'histoire (monde → plongeon → île)
     road  0 → 1   progression de la voiture le long de la route
     place 0 → 1   arrivée à Saint-Pierre (adresse)
   ========================================================================== */
(function () {
  'use strict';

  var T = window.THREE;
  var canvas = document.getElementById('world');
  if (!T || !canvas) { window.World = null; return; }

  /* Les hex du thème sont utilisés tels quels (pas de conversion colorimétrique). */
  T.ColorManagement.enabled = false;

  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    document.documentElement.classList.add('no-webgl');
    window.World = null;
    return;
  }
  renderer.outputColorSpace = T.LinearSRGBColorSpace;
  renderer.useLegacyLights = true;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = Math.min(window.innerWidth, window.innerHeight) < 700;
  var RAD = Math.PI / 180;

  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var easeIO = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var wrapDeg = function (d) { return ((d + 540) % 360) - 180; };
  var angSmooth = function (cur, goal, k) { return cur + wrapDeg(goal - cur) * k; };
  var angLerp = function (a, b, t) { return a + wrapDeg(b - a) * t; };

  /* ======================================================================
     COULEURS (pilotées par le thème)
     ====================================================================== */
  var COLOR_KEYS = ['low', 'high', 'line', 'glow', 'accent', 'accent2', 'sea', 'fill', 'dot', 'rim'];
  var colors = {
    low: new T.Color('#E2D8C4'), high: new T.Color('#F7F0E0'), line: new T.Color('#1B2230'),
    glow: new T.Color('#E8571C'), accent: new T.Color('#E8571C'), accent2: new T.Color('#0C7F99'),
    sea: new T.Color('#1B2230'), fill: new T.Color('#ECE5D5'), dot: new T.Color('#1B2230'), rim: new T.Color('#E8571C'),
    lineAlpha: 0.3, seaAlpha: 0.22
  };
  var colorGoal = {};
  COLOR_KEYS.forEach(function (k) { colorGoal[k] = colors[k].clone(); });
  colorGoal.lineAlpha = colors.lineAlpha; colorGoal.seaAlpha = colors.seaAlpha;

  /* ======================================================================
     GLOBE
     ====================================================================== */
  var R = 40;
  var ll2v = function (lon, lat, r) {
    var la = lat * RAD, lo = lon * RAD;
    return new T.Vector3(Math.cos(la) * Math.sin(lo) * r, Math.sin(la) * r, Math.cos(la) * Math.cos(lo) * r);
  };
  var REU = [55.47, -21.34];

  /* Quelques villes qui accueillent un BSides (liste illustrative). */
  var CITIES = [
    ['Las Vegas', -115.14, 36.17, 1], ['San Francisco', -122.42, 37.77, 0], ['Seattle', -122.33, 47.61, 0],
    ['Austin', -97.74, 30.27, 0], ['Boston', -71.06, 42.36, 0], ['New York', -74.0, 40.71, 0],
    ['Toronto', -79.38, 43.65, 0], ['Buenos Aires', -58.38, -34.6, 0], ['São Paulo', -46.63, -23.55, 1],
    ['Londres', -0.13, 51.51, 1], ['Dublin', -6.26, 53.35, 0], ['Lisbonne', -9.14, 38.72, 0],
    ['Berlin', 13.4, 52.52, 0], ['Zurich', 8.54, 47.37, 0], ['Vienne', 16.37, 48.21, 0],
    ['Athènes', 23.73, 37.98, 0], ['Le Cap', 18.42, -33.92, 1], ['Delhi', 77.21, 28.61, 1],
    ['Bangalore', 77.59, 12.97, 0], ['Singapour', 103.82, 1.35, 0], ['Tokyo', 139.69, 35.69, 1],
    ['Melbourne', 144.96, -37.81, 0], ['Canberra', 149.13, -35.28, 1]
  ];

  var globeScene = new T.Scene();
  var globeCam = new T.PerspectiveCamera(30, 1, 1, 2000);
  var globeGroup = new T.Group();
  globeScene.add(globeGroup);

  var gUni = {
    uTime: { value: 0 }, uAlpha: { value: 1 }, uPx: { value: 1000 }, uLight: { value: new T.Vector3(-0.5, 0.7, 0.6) },
    uFill: { value: colors.fill }, uRim: { value: colors.rim }, uDotColor: { value: colors.dot },
    uAccent: { value: colors.accent }, uAccent2: { value: colors.accent2 },
    uFocus: { value: ll2v(REU[0], REU[1], 1) }, uFocusAmt: { value: 0 }, uScale: { value: 1 }, uHalo: { value: 1 }
  };

  /* Sphère de base */
  var fillMat = new T.ShaderMaterial({
    uniforms: gUni, transparent: true, depthWrite: true,
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: [
      'uniform vec3 uFill; uniform vec3 uRim; uniform vec3 uLight; uniform float uAlpha;',
      'varying vec3 vN; varying vec3 vW;',
      'void main(){',
      '  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);',
      '  float l = dot(N, normalize(uLight));',
      '  float fr = pow(1.0 - max(dot(N, V), 0.0), 2.8);',
      '  vec3 col = uFill * (0.80 + 0.30 * smoothstep(-0.4, 0.9, l));',
      '  col = mix(col, uRim, fr * 0.5);',
      '  gl_FragColor = vec4(col, uAlpha);',
      '}'
    ].join('\n')
  });
  var fillMesh = new T.Mesh(new T.SphereGeometry(R, 96, 64), fillMat);
  fillMesh.renderOrder = 0;
  globeGroup.add(fillMesh);

  /* Halo atmosphérique */
  var haloMat = new T.ShaderMaterial({
    uniforms: gUni, transparent: true, depthWrite: false, side: T.BackSide,
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: [
      'uniform vec3 uRim; uniform float uAlpha; uniform float uHalo;',
      'varying vec3 vN; varying vec3 vW;',
      'void main(){',
      '  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);',
      '  float d = abs(dot(N, V));',
      '  float g = pow(1.0 - smoothstep(0.0, 0.42, d), 1.6);',
      '  gl_FragColor = vec4(uRim, g * 0.5 * uAlpha * uHalo);',
      '}'
    ].join('\n')
  });
  var haloMesh = new T.Mesh(new T.SphereGeometry(R * 1.14, 64, 48), haloMat);
  haloMesh.renderOrder = 1;
  globeGroup.add(haloMesh);

  /* Graticule */
  var graticuleMat;
  (function () {
    var seg = [];
    var push = function (a, b) { seg.push(a.x, a.y, a.z, b.x, b.y, b.z); };
    for (var lon = -180; lon < 180; lon += 30) {
      for (var lat = -85; lat < 85; lat += 5) push(ll2v(lon, lat, R * 1.002), ll2v(lon, lat + 5, R * 1.002));
    }
    for (var la = -60; la <= 60; la += 30) {
      for (var lo = -180; lo < 180; lo += 5) push(ll2v(lo, la, R * 1.002), ll2v(lo + 5, la, R * 1.002));
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(seg), 3));
    var m = new T.LineBasicMaterial({ color: colors.line, transparent: true, opacity: 0.08, depthWrite: false });
    var l = new T.LineSegments(g, m);
    l.renderOrder = 2;
    globeGroup.add(l);
    graticuleMat = m;
  })();

  /* Terres : points issus du masque Natural Earth */
  var dotCount = 0;
  (function () {
    var M = window.LAND_MASK;
    if (!M) return;
    var bin = atob(M.data), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var isLand = function (lon, lat) {
      var x = Math.min(M.w - 1, Math.floor((lon + 180) / 360 * M.w));
      var y = Math.min(M.h - 1, Math.max(0, Math.floor((90 - lat) / 180 * M.h)));
      var k = y * M.w + x;
      return (bytes[k >> 3] >> (7 - (k & 7))) & 1;
    };
    var step = small ? 1.35 : 1.05;
    var pos = [], seed = [];
    var row = 0, seq = 1;
    var hash = function (n) { var x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
    /* Un défaut du masque 0,5° trace une bande d'un pixel de large vers 16° S
       (et une autre vers 71° N). Les deux voisins sont la mer : on la jette,
       les vraies côtes ont de la terre d'un côté. */
    var wrapLon = function (lon) { return ((lon + 540) % 360) - 180; };
    var hairline = function (lon, lat) {
      var east = function (d) { return wrapLon(lon + d); };
      if (isLand(lon, lat + 0.6) || isLand(lon, lat - 0.6)) return false;
      var run = 1, d, lo;
      for (d = 0.5; d <= 16; d += 0.5) {
        lo = east(d);
        if (isLand(lo, lat + 0.6) || isLand(lo, lat - 0.6) || !isLand(lo, lat)) break;
        run++;
      }
      for (d = 0.5; d <= 16; d += 0.5) {
        lo = east(-d);
        if (isLand(lo, lat + 0.6) || isLand(lo, lat - 0.6) || !isLand(lo, lat)) break;
        run++;
      }
      return run > 18;
    };
    for (var lat = -84; lat <= 84; lat += step, row++) {
      var n = Math.max(1, Math.round(360 * Math.cos(lat * RAD) / step));
      var off = (row % 2) * 0.5;
      for (var j = 0; j < n; j++) {
        var lon = -180 + (j + off) * 360 / n;
        if (!isLand(lon, lat) || hairline(lon, lat)) continue;
        seq++;
        var h1 = hash(seq), h2 = hash(seq + 19.13);
        var alat = clamp(lat + (h1 - 0.5) * step * 0.8, -84, 84);
        var alon = lon + (h2 - 0.5) * step * 0.8 / Math.max(0.3, Math.cos(lat * RAD));
        if (!isLand(alon, alat) || hairline(alon, alat)) { alat = lat; alon = lon; }
        var v = ll2v(alon, alat, R * 1.004);
        pos.push(v.x, v.y, v.z); seed.push(h2);
      }
    }
    dotCount = seed.length;
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(seed), 1));
    var m = new T.ShaderMaterial({
      uniforms: Object.assign({ uDot: { value: small ? 0.7 : 0.46 } }, gUni), transparent: true, depthWrite: false,
      vertexShader: [
        'uniform float uPx; uniform float uDot; uniform vec3 uLight; uniform vec3 uFocus;',
        'attribute float aSeed; varying float vFacing; varying float vLit; varying float vNear;',
        'void main(){',
        '  vec3 N = normalize(position);',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vec3 V = normalize(cameraPosition - wp.xyz);',
        '  vFacing = dot(N, V); vLit = dot(N, normalize(uLight)); vNear = dot(N, uFocus);',
        '  vec4 mv = viewMatrix * wp;',
        '  gl_Position = projectionMatrix * mv;',
        '  float s = uPx * uDot / max(-mv.z, 0.5);',
        '  gl_PointSize = clamp(s * (0.5 + 0.85 * aSeed), 1.15, 16.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uDotColor; uniform vec3 uAccent; uniform float uAlpha; uniform float uFocusAmt;',
        'varying float vFacing; varying float vLit; varying float vNear;',
        'void main(){',
        '  float d = length(gl_PointCoord - 0.5);',
        '  float a = smoothstep(0.5, 0.16, d);',
        '  float lit = 0.4 + 0.6 * smoothstep(-0.25, 0.85, vLit);',
        '  float limb = smoothstep(0.0, 0.3, vFacing);',
        '  float f = smoothstep(0.96, 0.9995, vNear) * uFocusAmt;',
        '  vec3 col = mix(uDotColor, uAccent, f);',
        '  gl_FragColor = vec4(col, a * limb * uAlpha * lit * (0.82 + 0.18 * f));',
        '}'
      ].join('\n')
    });
    var pts = new T.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    globeGroup.add(pts);
  })();

  /* Balises : villes BSides (anneaux pulsants) */
  var BEACON_VS = [
    'uniform float uScale; uniform float uTime; attribute float aSize; attribute float aPhase;',
    'varying float vPhase; varying float vFacing;',
    'void main(){',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vec3 N = normalize(position);',
    '  vFacing = dot(N, normalize(cameraPosition - wp.xyz));',
    '  vPhase = aPhase;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '  gl_PointSize = aSize * uScale;',
    '}'
  ].join('\n');
  var BEACON_FS = [
    'uniform float uTime; uniform float uAlpha; uniform float uUseFacing; uniform vec3 uColor;',
    'varying float vPhase; varying float vFacing;',
    'void main(){',
    '  float d = length(gl_PointCoord - 0.5) * 2.0;',
    '  float core = smoothstep(0.24, 0.17, d);',
    '  float ph = fract(uTime * 0.42 + vPhase);',
    '  float rr = 0.22 + ph * 0.78;',
    '  float ring = smoothstep(0.07, 0.0, abs(d - rr)) * (1.0 - ph);',
    '  float f = mix(1.0, smoothstep(0.02, 0.22, vFacing), uUseFacing);',
    '  gl_FragColor = vec4(uColor, max(core, ring * 0.9) * f * uAlpha);',
    '}'
  ].join('\n');
  function makeBeacons(items, uniforms, useFacing) {
    var n = items.length;
    var pos = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n);
    items.forEach(function (it, i) {
      pos[i * 3] = it.p.x; pos[i * 3 + 1] = it.p.y; pos[i * 3 + 2] = it.p.z;
      size[i] = it.size; phase[i] = it.phase || Math.random();
    });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new T.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new T.BufferAttribute(phase, 1));
    var m = new T.ShaderMaterial({
      uniforms: Object.assign({ uUseFacing: { value: useFacing ? 1 : 0 }, uColor: { value: colors.accent2 } }, uniforms),
      vertexShader: BEACON_VS, fragmentShader: BEACON_FS, transparent: true, depthWrite: false
    });
    var p = new T.Points(g, m);
    p.frustumCulled = false;
    return { points: p, geo: g, mat: m };
  }

  var cityBeacons = makeBeacons(CITIES.map(function (c, i) {
    return { p: ll2v(c[1], c[2], R * 1.008), size: 30, phase: (i * 0.137) % 1, color: colors.accent2 };
  }), gUni, true);
  cityBeacons.points.renderOrder = 4;
  globeGroup.add(cityBeacons.points);

  /* Marqueur de La Réunion : balise + faisceau */
  var reuNormal = ll2v(REU[0], REU[1], 1);
  var reuPin = new T.Group();
  reuPin.position.copy(reuNormal.clone().multiplyScalar(R * 1.004));
  reuPin.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), reuNormal);
  var reuBeamMat = new T.ShaderMaterial({
    uniforms: { uColor: { value: colors.accent }, uAlpha: { value: 1 } },
    vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; varying float vY; void main(){ gl_FragColor = vec4(uColor, (1.0 - vY * 0.85) * uAlpha); }',
    transparent: true, depthWrite: false
  });
  var reuBeam = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 9, 8, 1, true), reuBeamMat);
  reuBeam.position.y = 4.5;
  reuPin.add(reuBeam);
  var reuHeadMat = new T.MeshBasicMaterial({ color: colors.accent, transparent: true });
  var reuHead = new T.Mesh(new T.SphereGeometry(0.42, 20, 16), reuHeadMat);
  reuHead.position.y = 9.1;
  reuPin.add(reuHead);
  var reuRingGeo = new T.RingGeometry(0.92, 1.0, 64);
  reuRingGeo.rotateX(-Math.PI / 2);
  var reuRings = [0, 1].map(function () {
    var m = new T.MeshBasicMaterial({ color: colors.accent, transparent: true, depthWrite: false, side: T.DoubleSide });
    var r = new T.Mesh(reuRingGeo, m);
    r.position.y = 0.08;
    reuPin.add(r);
    return r;
  });
  reuPin.traverse(function (o) { o.renderOrder = 6; });
  globeGroup.add(reuPin);

  /* Arcs de données de chaque ville vers La Réunion */
  var arcMats = [], arcCurves = [];
  var arcGroup = new T.Group();
  (function () {
    var a = reuNormal.clone();
    CITIES.forEach(function (c) {
      var b = ll2v(c[1], c[2], 1);
      var ang = Math.acos(clamp(a.dot(b), -1, 1));
      var pts = [];
      for (var i = 0; i <= 72; i++) {
        var t = i / 72;
        var sa = Math.sin((1 - t) * ang) / Math.sin(ang), sb = Math.sin(t * ang) / Math.sin(ang);
        var v = a.clone().multiplyScalar(sa).add(b.clone().multiplyScalar(sb)).normalize();
        v.multiplyScalar(R * (1.01 + 0.34 * (ang / Math.PI) * Math.sin(Math.PI * t)));
        pts.push(v);
      }
      arcCurves.push(pts);
      var g = new T.BufferGeometry().setFromPoints(pts);
      var m = new T.LineBasicMaterial({ color: colors.accent2, transparent: true, opacity: 0, depthWrite: false });
      arcMats.push(m);
      var l = new T.Line(g, m);
      l.renderOrder = 5;
      arcGroup.add(l);
    });
  })();
  var PACKETS = arcCurves.length * 2;
  var packetGeo = new T.BufferGeometry();
  packetGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(PACKETS * 3), 3));
  var packetMat = new T.PointsMaterial({ color: colors.accent, size: 2.2, sizeAttenuation: false, transparent: true, depthWrite: false });
  var packets = new T.Points(packetGeo, packetMat);
  packets.frustumCulled = false;
  packets.renderOrder = 7;
  arcGroup.add(packets);
  globeGroup.add(arcGroup);

  /* Étoiles */
  var starMat = new T.PointsMaterial({ color: colors.dot, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.3, depthWrite: false });
  (function () {
    var n = small ? 260 : 520, p = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var v = new T.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(400 + Math.random() * 500);
      p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(p, 3));
    var s = new T.Points(g, starMat);
    s.frustumCulled = false;
    s.renderOrder = -1;
    globeScene.add(s);
  })();

  /* ======================================================================
     LA RÉUNION : GÉOGRAPHIE & TERRAIN
     ====================================================================== */
  var KM_LON = 103.9, KM_LAT = 110.7, LON0 = 55.53, LAT0 = -21.13;
  var EXAG = 2.3, PEAK_KM = 3.07;
  var toXZ = function (lon, lat) { return [(lon - LON0) * KM_LON, -(lat - LAT0) * KM_LAT]; };

  var COAST_LL = [
    [55.43, -20.875], [55.47, -20.885], [55.53, -20.895], [55.59, -20.905], [55.63, -20.925], [55.665, -20.96],
    [55.685, -21.0], [55.71, -21.04], [55.735, -21.085], [55.77, -21.11], [55.805, -21.145], [55.83, -21.19],
    [55.84, -21.23], [55.82, -21.28], [55.785, -21.335], [55.74, -21.375], [55.69, -21.39], [55.63, -21.385],
    [55.57, -21.365], [55.51, -21.35], [55.46, -21.335], [55.42, -21.31], [55.385, -21.285], [55.34, -21.265],
    [55.31, -21.225], [55.29, -21.19], [55.275, -21.15], [55.255, -21.10], [55.235, -21.05], [55.23, -21.005],
    [55.255, -20.965], [55.29, -20.935], [55.335, -20.915], [55.385, -20.89]
  ];
  /* Côte lissée (spline fermée) : évite les arêtes anguleuses du polygone de base */
  var COAST = (function () {
    var raw = COAST_LL.map(function (p) { var q = toXZ(p[0], p[1]); return new T.Vector3(q[0], 0, q[1]); });
    var cv = new T.CatmullRomCurve3(raw, true, 'centripetal');
    return cv.getSpacedPoints(260).slice(0, -1).map(function (v) { return [v.x, v.z]; });
  })();
  var SP = toXZ(55.47, -21.34);
  var PDN = toXZ(55.48, -21.10), FOU = toXZ(55.714, -21.244);

  function hash(ix, iy) {
    var n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967295;
  }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o) { var s = 0, a = 0.5, f = 1; for (var i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
  function ridged(x, y, o) { var s = 0, a = 0.5, f = 1; for (var i = 0; i < o; i++) { var n = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1); s += a * n * n; f *= 2.1; a *= 0.5; } return s; }

  function signedDist(px, pz) {
    var inside = false, dmin = 1e9;
    for (var i = 0, j = COAST.length - 1; i < COAST.length; j = i++) {
      var a = COAST[j], b = COAST[i];
      if ((a[1] > pz) !== (b[1] > pz) && px < ((b[0] - a[0]) * (pz - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      var abx = b[0] - a[0], abz = b[1] - a[1];
      var t = clamp(((px - a[0]) * abx + (pz - a[1]) * abz) / (abx * abx + abz * abz), 0, 1);
      var dx = px - (a[0] + t * abx), dz = pz - (a[1] + t * abz);
      var d = dx * dx + dz * dz;
      if (d < dmin) dmin = d;
    }
    return (inside ? 1 : -1) * Math.sqrt(dmin);
  }
  function bump(x, z, c, amp, sigma, pw) { return amp * Math.exp(-Math.pow(Math.hypot(x - c[0], z - c[1]) / sigma, pw)); }

  function warpedDist(x, z) {
    var w1 = (fbm(x * 0.09 + 3.1, z * 0.09 - 1.7, 3) - 0.5) * 4.2;
    var w2 = (fbm(x * 0.09 - 8.2, z * 0.09 + 5.4, 3) - 0.5) * 4.2;
    return signedDist(x + w1, z + w2);
  }

  function terrain(x, z) {
    var d = warpedDist(x, z);
    if (d <= 0) return { h: 0, d: d };
    var h = Math.pow(smooth(0, 15, d), 1.15) * 0.9;
    h += bump(x, z, PDN, 2.6, 9.5, 1.7);
    h += bump(x, z, [-12.5, -5.5], 1.5, 6.5, 1.7);
    h += bump(x, z, FOU, 1.95, 8.0, 1.8);
    h -= bump(x, z, FOU, 0.75, 3.2, 2.0);
    h -= bump(x, z, [-11.4, -10.0], 1.3, 4.2, 2.0);
    h -= bump(x, z, [-1.0, -7.7], 1.3, 4.0, 2.0);
    h -= bump(x, z, [-6.2, 0.5], 1.4, 3.8, 2.0);
    h += (ridged(x * 0.28 + 11, z * 0.28 - 4, 4) - 0.35) * 0.45 * smooth(2, 18, d) * (0.4 + h / 3);
    h += (fbm(x * 0.6, z * 0.6, 3) - 0.5) * 0.18 * smooth(1, 10, d);
    return { h: Math.max(h, 0), d: d };
  }

  var islandScene = new T.Scene();
  var islandCam = new T.PerspectiveCamera(30, 1, 0.5, 1400);

  var NX = small ? 210 : 300, NZ = small ? 189 : 270;
  var X0 = -40, X1 = 40, Z0 = -36, Z1 = 36;
  var gdx = (X1 - X0) / NX, gdz = (Z1 - Z0) / NZ, stride = NX + 1, vcount = stride * (NZ + 1);
  var HK = 1, heightAt;

  /* Champ de distance signée de la côte, cuit en texture : un bord net et lisse
     quelle que soit la résolution du maillage (le maillage ne porte que le relief). */
  var SDF_W = small ? 320 : 512, SDF_H = Math.round(SDF_W * (Z1 - Z0) / (X1 - X0));
  var sdfTex = (function () {
    var data = new Uint16Array(SDF_W * SDF_H), toH = T.DataUtils.toHalfFloat;
    for (var j = 0; j < SDF_H; j++) {
      var z = Z0 + ((j + 0.5) / SDF_H) * (Z1 - Z0);
      for (var i = 0; i < SDF_W; i++) {
        var x = X0 + ((i + 0.5) / SDF_W) * (X1 - X0);
        data[j * SDF_W + i] = toH(clamp(warpedDist(x, z), -3, 3));
      }
    }
    var tx = new T.DataTexture(data, SDF_W, SDF_H, T.RedFormat, T.HalfFloatType);
    tx.minFilter = T.LinearFilter; tx.magFilter = T.LinearFilter;
    tx.wrapS = T.ClampToEdgeWrapping; tx.wrapT = T.ClampToEdgeWrapping;
    tx.generateMipmaps = false; tx.needsUpdate = true;
    return tx;
  })();

  var terrainMat, terrainMesh;
  (function buildTerrain() {
    var pos = new Float32Array(vcount * 3), aH = new Float32Array(vcount), aD = new Float32Array(vcount);
    var aS = new Float32Array(vcount * 2), rawH = new Float32Array(vcount), maxRaw = 0.0001;
    var iz, ix, i;
    for (iz = 0; iz <= NZ; iz++) {
      for (ix = 0; ix <= NX; ix++) {
        i = iz * stride + ix;
        var x = X0 + ix * gdx, z = Z0 + iz * gdz, t = terrain(x, z);
        pos[i * 3] = x; pos[i * 3 + 2] = z;
        rawH[i] = t.h; aD[i] = t.d;
        if (t.h > maxRaw) maxRaw = t.h;
      }
    }
    HK = (PEAK_KM / maxRaw) * EXAG;
    for (i = 0; i < vcount; i++) aH[i] = rawH[i] * HK;
    for (iz = 0; iz <= NZ; iz++) {
      for (ix = 0; ix <= NX; ix++) {
        i = iz * stride + ix;
        var l = iz * stride + Math.max(ix - 1, 0), r = iz * stride + Math.min(ix + 1, NX);
        var u = Math.max(iz - 1, 0) * stride + ix, d = Math.min(iz + 1, NZ) * stride + ix;
        aS[i * 2] = (aH[r] - aH[l]) / ((Math.min(ix + 1, NX) - Math.max(ix - 1, 0)) * gdx);
        aS[i * 2 + 1] = (aH[d] - aH[u]) / ((Math.min(iz + 1, NZ) - Math.max(iz - 1, 0)) * gdz);
      }
    }
    var idx = [];
    for (iz = 0; iz < NZ; iz++) {
      for (ix = 0; ix < NX; ix++) {
        var a = iz * stride + ix, b = a + 1, c = a + stride, e = c + 1;
        if (aD[a] < -1.5 && aD[b] < -1.5 && aD[c] < -1.5 && aD[e] < -1.5) continue;
        idx.push(a, c, b, b, c, e);
      }
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('aH', new T.BufferAttribute(aH, 1));
    geo.setAttribute('aD', new T.BufferAttribute(aD, 1));
    geo.setAttribute('aSlope', new T.BufferAttribute(aS, 2));
    geo.setIndex(new T.BufferAttribute(new Uint32Array(idx), 1));
    heightAt = function (x, z) { return terrain(x, z).h * HK; };

    terrainMat = new T.ShaderMaterial({
      uniforms: {
        uRise: { value: 0 }, uTime: { value: 0 }, uScan: { value: 0 }, uMaxH: { value: PEAK_KM * EXAG }, uFade: { value: 0 },
        uContour: { value: 0.3 }, uLineAlpha: { value: 0.3 },
        uLow: { value: colors.low }, uHigh: { value: colors.high }, uLine: { value: colors.line },
        uGlow: { value: colors.glow }, uAccent: { value: colors.accent },
        uFocus: { value: new T.Vector4(0, 0, 0, 10) }, uPin: { value: new T.Vector3(SP[0], SP[1], 0) },
        uSdf: { value: sdfTex }, uSdfO: { value: new T.Vector2(X0, Z0) }, uSdfS: { value: new T.Vector2(X1 - X0, Z1 - Z0) }
      },
      vertexShader: [
        'uniform float uRise; attribute float aH; attribute float aD; attribute vec2 aSlope;',
        'varying float vH; varying float vD; varying vec2 vSlope; varying vec3 vWorld; varying vec2 vXZ;',
        'void main(){',
        '  vec3 p = position; p.y = aH * uRise; vH = p.y; vD = aD; vSlope = aSlope; vXZ = position.xz;',
        '  vec4 wp = modelMatrix * vec4(p, 1.0); vWorld = wp.xyz;',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uLow; uniform vec3 uHigh; uniform vec3 uLine; uniform vec3 uGlow; uniform vec3 uAccent;',
        'uniform float uLineAlpha; uniform float uRise; uniform float uTime; uniform float uScan; uniform float uMaxH; uniform float uContour; uniform float uFade;',
        'uniform vec4 uFocus; uniform vec3 uPin; uniform sampler2D uSdf; uniform vec2 uSdfO; uniform vec2 uSdfS;',
        'varying float vH; varying float vD; varying vec2 vSlope; varying vec3 vWorld; varying vec2 vXZ;',
        'float ringAt(vec2 p, vec2 c, float radius, float speed){',
        '  float d = length(p - c); float ph = fract(uTime * speed) * radius * 1.7; float q = (d - ph) / 0.55;',
        '  return exp(-q * q) * (1.0 - smoothstep(radius * 0.9, radius * 1.7, ph));',
        '}',
        'void main(){',
        '  float sd = texture2D(uSdf, (vXZ - uSdfO) / uSdfS).r;',
        '  float aa = max(fwidth(sd), 0.004);',
        '  if (sd < -aa) discard;',
        '  vec3 n = normalize(vec3(-vSlope.x * uRise, 1.0, -vSlope.y * uRise));',
        '  vec3 L = normalize(vec3(-0.55, 0.78, 0.32));',
        '  float diff = clamp(dot(n, L), 0.0, 1.0);',
        '  float hn = clamp(vH / uMaxH, 0.0, 1.0);',
        '  vec3 col = mix(uLow, uHigh, pow(hn, 0.8)); col *= 0.6 + 0.78 * diff;',
        '  float hh = vH / uContour; float fw = max(fwidth(hh), 1e-4);',
        '  float f = abs(fract(hh - 0.5) - 0.5); float line = 1.0 - smoothstep(0.0, fw * 1.25, f);',
        '  float hm = hh / 5.0; float fwm = max(fwidth(hm), 1e-4);',
        '  float major = 1.0 - smoothstep(0.0, fwm * 1.6, abs(fract(hm - 0.5) - 0.5));',
        '  line *= (1.0 - smoothstep(0.3, 0.9, fw)) * smoothstep(0.03, 0.25, hh);',
        '  vec3 lc = mix(uLine, uAccent, major * 0.55);',
        '  col = mix(col, lc, clamp(line * uLineAlpha * (0.6 + 0.9 * major), 0.0, 1.0));',
        '  col = mix(col, uGlow, (1.0 - smoothstep(0.0, 1.6, sd)) * 0.12);',
        '  float rw = max(0.07, aa * 1.5); float rim = 1.0 - smoothstep(rw, rw + aa * 1.2, sd);',
        '  col = mix(col, uGlow, rim * 0.95);',
        '  float fd = length(vXZ - uFocus.xy); float fq = fd / max(uFocus.w, 0.01);',
        '  col += uAccent * exp(-fq * fq) * uFocus.z * 0.28;',
        '  col += uAccent * ringAt(vXZ, uFocus.xy, uFocus.w, 0.22) * uFocus.z * 0.9;',
        '  float pd = length(vXZ - uPin.xy) / 2.6; col += uAccent * exp(-pd * pd) * uPin.z * 0.6;',
        '  col += uAccent * ringAt(vXZ, uPin.xy, 7.0, 0.3) * uPin.z * 0.8;',
        '  vec3 V = normalize(cameraPosition - vWorld); float fr = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0); col += uGlow * fr * 0.18;',
        '  float rad = length(vXZ); float scanIn = 1.0 - smoothstep(uScan - 5.0, uScan, rad);',
        '  float sq = (rad - uScan) / 1.6; col += uAccent * exp(-sq * sq) * 0.9 * step(0.001, uScan) * (1.0 - step(200.0, uScan));',
        '  float alpha = smoothstep(-aa, aa * 0.8, sd) * scanIn * uFade;',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
      ].join('\n'),
      transparent: true, side: T.DoubleSide, extensions: { derivatives: true }
    });
    terrainMesh = new T.Mesh(geo, terrainMat);
    terrainMesh.frustumCulled = false;
    terrainMesh.renderOrder = 1;
    islandScene.add(terrainMesh);
  })();

  /* Océan radar */
  var oceanMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.22 }, uColor: { value: colors.sea } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'uniform float uTime; uniform float uAlpha; uniform vec3 uColor; varying vec2 vP;',
      'void main(){',
      '  float r = length(vP); float q = r * 0.045 - uTime * 0.035; float w = max(fwidth(q), 1e-4); float fr = fract(q);',
      '  float band = 1.0 - smoothstep(0.0, w * 1.5 + 0.015, min(fr, 1.0 - fr));',
      '  vec2 g = vP / 6.0; vec2 gw = max(fwidth(g), vec2(1e-4)); vec2 gl = abs(fract(g - 0.5) - 0.5) / gw;',
      '  float grid = 1.0 - min(min(gl.x, gl.y), 1.0); float fall = exp(-r * 0.017);',
      '  gl_FragColor = vec4(uColor, (band * 0.55 + grid * 0.16) * fall * uAlpha);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, extensions: { derivatives: true }
  });
  var oceanGeo = new T.PlaneGeometry(520, 520);
  oceanGeo.rotateX(-Math.PI / 2);
  var ocean = new T.Mesh(oceanGeo, oceanMat);
  ocean.position.y = -0.03;
  ocean.renderOrder = 0;
  islandScene.add(ocean);

  /* ======================================================================
     ROUTE : Saint-Denis → Saint-Pierre par la côte ouest
     ====================================================================== */
  var ROUTE_LL = [
    /* Saint-Denis → La Possession par la Nouvelle Route du Littoral : le viaduc passe en mer, au large de la falaise */
    ['denis', 55.455, -20.9], [null, 55.44, -20.862], [null, 55.4, -20.866], [null, 55.36, -20.882], [null, 55.322, -20.905],
    ['leport', 55.305, -20.945], [null, 55.292, -20.978],
    ['paul', 55.268, -21.005], [null, 55.262, -21.06], [null, 55.275, -21.115], ['leu', 55.3, -21.17],
    [null, 55.325, -21.225], ['etang', 55.36, -21.255], [null, 55.395, -21.268], ['louis', 55.425, -21.282],
    [null, 55.455, -21.31], ['pierre', 55.472, -21.332]
  ];
  var STOP_NAMES = {
    denis: 'Saint-Denis', leport: 'Le Port', paul: 'Saint-Paul', leu: 'Saint-Leu', etang: 'Étang-Salé', louis: 'Saint-Louis', pierre: 'Saint-Pierre'
  };
  var RN = 520;
  var rx = new Float32Array(RN + 1), rz = new Float32Array(RN + 1), rh = new Float32Array(RN + 1);
  var routeLen = 0;
  var stops = [];
  (function buildRoute() {
    var ctrl = ROUTE_LL.map(function (w) { var p = toXZ(w[1], w[2]); return new T.Vector3(p[0], 0, p[1]); });
    var curve = new T.CatmullRomCurve3(ctrl, false, 'centripetal');
    var pts = curve.getSpacedPoints(RN);
    var i;
    for (i = 0; i <= RN; i++) { rx[i] = pts[i].x; rz[i] = pts[i].z; rh[i] = heightAt(pts[i].x, pts[i].z); }
    var tmp = new Float32Array(RN + 1);
    for (var pass = 0; pass < 3; pass++) {
      for (i = 0; i <= RN; i++) {
        var a = Math.max(0, i - 3), b = Math.min(RN, i + 3), s = 0;
        for (var k = a; k <= b; k++) s += rh[k];
        tmp[i] = s / (b - a + 1);
      }
      rh.set(tmp);
    }
    for (i = 1; i <= RN; i++) routeLen += Math.hypot(rx[i] - rx[i - 1], rz[i] - rz[i - 1]);
    ROUTE_LL.forEach(function (w) {
      if (!w[0]) return;
      var p = toXZ(w[1], w[2]), best = 0, bd = 1e9;
      for (var j = 0; j <= RN; j++) { var d = Math.hypot(rx[j] - p[0], rz[j] - p[1]); if (d < bd) { bd = d; best = j; } }
      stops.push({ id: w[0], name: STOP_NAMES[w[0]], t: best / RN, x: rx[best], z: rz[best] });
    });
    stops[0].t = 0; stops[stops.length - 1].t = 1;
  })();

  function routeAt(t) {
    var f = clamp(t, 0, 1) * RN, i = Math.min(RN - 1, Math.floor(f)), u = f - i;
    return { x: lerp(rx[i], rx[i + 1], u), z: lerp(rz[i], rz[i + 1], u), h: lerp(rh[i], rh[i + 1], u) };
  }

  /* Ruban GPS le long de la route */
  var routeMat = new T.ShaderMaterial({
    uniforms: { uRise: { value: 0 }, uProg: { value: 0 }, uFade: { value: 0 }, uLen: { value: routeLen }, uTime: { value: 0 }, uAccent: { value: colors.accent }, uAccent2: { value: colors.accent2 } },
    vertexShader: [
      'uniform float uRise; attribute float aT; attribute float aSide; attribute float aH; varying float vT; varying float vSide;',
      'void main(){ vT = aT; vSide = aSide; vec3 p = position; p.y = aH * uRise + 0.14; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }'
    ].join('\n'),
    fragmentShader: [
      'uniform float uProg; uniform float uFade; uniform float uLen; uniform float uTime; uniform vec3 uAccent; uniform vec3 uAccent2;',
      'varying float vT; varying float vSide;',
      'void main(){',
      '  float aw = max(fwidth(vSide), 0.02);',
      '  float edge = 1.0 - smoothstep(1.0 - aw * 1.6, 1.0, abs(vSide));',
      '  float done = step(vT, uProg);',
      '  float core = 1.0 - smoothstep(0.38 - aw, 0.38 + aw, abs(vSide));',
      '  float dwf = max(fwidth(vT * uLen * 1.4), 0.001); float dash = 1.0 - smoothstep(0.62 - dwf, 0.62 + dwf, fract(vT * uLen * 1.4 - uTime * 0.25));',
      '  vec3 cDone = mix(uAccent, vec3(1.0), core * 0.55);',
      '  float hq = (vT - uProg) * uLen / 0.8; float head = exp(-hq * hq);',
      '  vec3 col = mix(uAccent2, cDone, done) + uAccent * head * 0.35;',
      '  float a = edge * mix(0.9 * dash, 1.0, done) * uFade;',
      '  gl_FragColor = vec4(col, a);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, side: T.DoubleSide, extensions: { derivatives: true }
  });
  (function buildRibbon() {
    var W = 0.19, n = RN + 1;
    var pos = new Float32Array(n * 2 * 3), aT = new Float32Array(n * 2), aS = new Float32Array(n * 2), aH = new Float32Array(n * 2);
    for (var i = 0; i < n; i++) {
      var a = Math.max(0, i - 1), b = Math.min(RN, i + 1);
      var tx = rx[b] - rx[a], tz = rz[b] - rz[a], l = Math.hypot(tx, tz) || 1;
      var sx = -tz / l, sz = tx / l;
      for (var s = 0; s < 2; s++) {
        var side = s ? 1 : -1, k = i * 2 + s;
        var px = rx[i] + sx * W * side, pz = rz[i] + sz * W * side;
        pos[k * 3] = px; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = pz;
        aT[k] = i / RN; aS[k] = side; aH[k] = Math.max(heightAt(px, pz), rh[i] * 0.4) * 0.5 + rh[i] * 0.5;
      }
    }
    var idx = [];
    for (var j = 0; j < RN; j++) { var q = j * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('aT', new T.BufferAttribute(aT, 1));
    g.setAttribute('aSide', new T.BufferAttribute(aS, 1));
    g.setAttribute('aH', new T.BufferAttribute(aH, 1));
    g.setIndex(idx);
    var mesh = new T.Mesh(g, routeMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    islandScene.add(mesh);
  })();

  /* Balises des étapes */
  var iUni = { uTime: { value: 0 }, uScale: { value: 1 }, uAlpha: { value: 0 } };
  var stopBeacons = makeBeacons(stops.map(function (s, i) {
    return { p: new T.Vector3(s.x, 0.45, s.z), size: 34, phase: i * 0.21, color: colors.accent2 };
  }), iUni, false);
  stopBeacons.points.renderOrder = 4;
  islandScene.add(stopBeacons.points);

  /* Épingle Saint-Pierre */
  var pin = new T.Group();
  pin.position.set(SP[0], 0.05, SP[1]);
  var beamMat = new T.ShaderMaterial({
    uniforms: { uColor: { value: colors.accent }, uAlpha: { value: 0.9 } },
    vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; varying float vY; void main(){ gl_FragColor = vec4(uColor, (1.0 - vY) * uAlpha); }',
    transparent: true, depthWrite: false
  });
  var beam = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 13, 8, 1, true), beamMat);
  beam.position.y = 6.5; pin.add(beam);
  var headMat = new T.MeshBasicMaterial({ color: colors.accent, transparent: true });
  var head = new T.Mesh(new T.SphereGeometry(0.4, 20, 16), headMat);
  head.position.y = 13; pin.add(head);
  var ringGeo = new T.RingGeometry(0.92, 1.0, 72);
  ringGeo.rotateX(-Math.PI / 2);
  var rings = [0, 1].map(function () {
    var m = new T.MeshBasicMaterial({ color: colors.accent, transparent: true, depthWrite: false, side: T.DoubleSide });
    var r = new T.Mesh(ringGeo, m); r.position.y = 0.1; pin.add(r); return r;
  });
  pin.traverse(function (o) { o.renderOrder = 4; });
  islandScene.add(pin);

  /* ======================================================================
     LA VOITURE
     ====================================================================== */
  islandScene.add(new T.AmbientLight(0xffffff, 0.74));
  var sun = new T.DirectionalLight(0xffffff, 0.85);
  sun.position.set(-0.5, 0.9, 0.4);
  islandScene.add(sun);

  var car = new T.Group();
  var carBody = new T.Group();
  car.add(carBody);
  var carMats = [];
  var carBodyMat = new T.MeshLambertMaterial({ color: colors.accent, transparent: true });
  var carGlassMat = new T.MeshLambertMaterial({ color: 0x0d1524, transparent: true });
  var carDarkMat = new T.MeshLambertMaterial({ color: 0x101319, transparent: true });
  var carHubMat = new T.MeshLambertMaterial({ color: 0xcfd5de, transparent: true });
  var carHeadMat = new T.MeshBasicMaterial({ color: 0xfff6d8, transparent: true });
  var carTailMat = new T.MeshBasicMaterial({ color: 0xff2a3a, transparent: true });
  carMats.push(carBodyMat, carGlassMat, carDarkMat, carHubMat, carHeadMat, carTailMat);
  (function () {
    var s = new T.Shape();
    s.moveTo(-0.62, 0.08); s.lineTo(0.62, 0.08); s.lineTo(0.64, 0.26); s.lineTo(0.42, 0.32); s.lineTo(0.2, 0.34);
    s.lineTo(0.05, 0.56); s.lineTo(-0.34, 0.56); s.lineTo(-0.52, 0.34); s.lineTo(-0.64, 0.28); s.closePath();
    var g = new T.ExtrudeGeometry(s, { depth: 0.58, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, -0.29);
    carBody.add(new T.Mesh(g, carBodyMat));
    var w = new T.Shape();
    w.moveTo(0.0, 0.37); w.lineTo(0.06, 0.52); w.lineTo(-0.3, 0.52); w.lineTo(-0.46, 0.37); w.closePath();
    var wg = new T.ExtrudeGeometry(w, { depth: 0.7, bevelEnabled: false });
    wg.translate(0, 0, -0.35);
    carBody.add(new T.Mesh(wg, carGlassMat));
    var wheelGeo = new T.CylinderGeometry(0.15, 0.15, 0.12, 14); wheelGeo.rotateX(Math.PI / 2);
    var hubGeo = new T.CylinderGeometry(0.07, 0.07, 0.14, 10); hubGeo.rotateX(Math.PI / 2);
    car.userData.wheels = [];
    [[0.4, 0.34], [0.4, -0.34], [-0.4, 0.34], [-0.4, -0.34]].forEach(function (p) {
      var wg2 = new T.Group();
      wg2.add(new T.Mesh(wheelGeo, carDarkMat)); wg2.add(new T.Mesh(hubGeo, carHubMat));
      wg2.position.set(p[0], 0.15, p[1]);
      car.add(wg2); car.userData.wheels.push(wg2);
    });
    var lampGeo = new T.SphereGeometry(0.06, 8, 6);
    [0.2, -0.2].forEach(function (z) {
      var h = new T.Mesh(lampGeo, carHeadMat); h.position.set(0.66, 0.22, z); carBody.add(h);
      var t = new T.Mesh(lampGeo, carTailMat); t.position.set(-0.66, 0.24, z); carBody.add(t);
    });
  })();
  var beamCarMat = new T.ShaderMaterial({
    uniforms: { uAlpha: { value: 0.5 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uAlpha; varying vec2 vUv; void main(){ float x = vUv.x; float w = abs(vUv.y - 0.5) * 2.0; float a = (1.0 - x) * (1.0 - smoothstep(0.0, 0.2 + x * 0.8, w)); gl_FragColor = vec4(1.0, 0.95, 0.8, a * uAlpha); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
  });
  var carBeamGeo = new T.PlaneGeometry(3.0, 1.1); carBeamGeo.rotateX(-Math.PI / 2); carBeamGeo.translate(2.15, 0.07, 0);
  var carBeam = new T.Mesh(carBeamGeo, beamCarMat);
  car.add(carBeam);
  var shadowGeo = new T.CircleGeometry(0.5, 20); shadowGeo.rotateX(-Math.PI / 2); shadowGeo.scale(1.35, 1, 0.78);
  var shadowMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  var carShadow = new T.Mesh(shadowGeo, shadowMat);
  carShadow.position.y = 0.02;
  car.add(carShadow);
  car.traverse(function (o) { if (o.isMesh) o.renderOrder = 8; });
  car.rotation.order = 'YZX';
  car.visible = false;
  islandScene.add(car);

  /* ======================================================================
     ÉTIQUETTES DOM
     ====================================================================== */
  var labelHost = document.querySelector('.map-labels');
  var labels = [];
  function addLabel(kind, html, getPos, cls) {
    if (!labelHost) return null;
    var el = document.createElement('span');
    el.className = 'map-label ' + (cls || '');
    el.innerHTML = html;
    labelHost.appendChild(el);
    var o = { el: el, kind: kind, getPos: getPos, w: 0, goal: 0, id: '' };
    labels.push(o);
    return o;
  }
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };

  var homeLabel = addLabel('home', '<i></i><b>La Réunion</b><small>' + '21.3° S · 55.5° E</small>', function () { return ll2v(REU[0], REU[1], R * 1.004).add(reuNormal.clone().multiplyScalar(10.4)); }, 'is-pin');
  var cityLabels = [];
  CITIES.forEach(function (c, i) {
    if (!c[3]) return;
    var l = addLabel('city', '<b>' + esc(c[0]) + '</b>', function () { return ll2v(c[1], c[2], R * 1.012); }, 'is-city');
    if (l) { l.city = i; cityLabels.push(l); }
  });
  var stopLabels = stops.map(function (s) {
    var isPin = s.id === 'pierre';
    var l = addLabel('stop', isPin ? '<i></i><b>ESIROI · Saint-Pierre</b><small>21.34° S · 55.47° E</small>' : '<i></i><b>' + esc(s.name) + '</b>',
      function () { return isPin ? new T.Vector3(SP[0], 13.8 * pinScale, SP[1]) : new T.Vector3(s.x, 1.1, s.z); }, isPin ? 'is-pin' : 'is-town');
    if (l) l.stop = s;
    return l;
  });

  /* ======================================================================
     ÉTAT, CAMÉRAS, BOUCLE
     ====================================================================== */
  var state = { s: 0, road: 0, place: 0 };
  var active = false, raf = 0, last = 0, time = 0, W = 1, H = 1, pinScale = 1, dpr = 1;
  var wasIsl = false;
  var spin = 12, turbo = 0, carT = 0, carHead = 0, camHead = 0, carRoll = 0, carWheel = 0, prevCarT = 0;
  var par = { x: 0, y: 0, tx: 0, ty: 0 };
  var view = { lon: 0, lat: 0, alt: 0, mode: 'globe' };
  var info = { carT: 0, km: 0, stop: 0, ga: 1, ia: 0, dive: 0 };

  var GK = [
    { lat: 14, dist: 205, sx: 0.2, spy: 0.2, arcs: 0, fa: 0, halo: 1 },
    { lat: 24, dist: 160, sx: 0.2, spy: -0.2, arcs: 0, fa: 0.2, halo: 1 },
    { lat: -12, dist: 100, sx: -0.2, spy: -0.2, arcs: 1, fa: 1, halo: 1 },
    { lat: -21.2, dist: 57, sx: 0.16, spy: -0.18, arcs: 0.35, fa: 1, halo: 0.5 },
    { lat: -21.3, dist: 44.2, sx: 0, spy: 0, arcs: 0, fa: 1, halo: 0 }
  ];
  var GN = ['lat', 'dist', 'sx', 'spy', 'arcs', 'fa', 'halo'];
  var g = { lon: 12, lat: 14, dist: 205, sx: 0.2, spy: 0.2, arcs: 0, fa: 0, halo: 1 };
  var gGoal = {};
  var isl = { tx: 0, ty: 0, tz: 2, yaw: 0, pitch: 82, dist: 165, sx: 0, spy: 0, sy: 0, rise: 0, pin: 0, fs: 0, fx: SP[0], fz: SP[1], fr: 10 };
  var islGoal = {};
  Object.keys(isl).forEach(function (k) { islGoal[k] = isl[k]; });

  function resize() {
    W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    globeCam.aspect = islandCam.aspect = W / H;
    globeCam.updateProjectionMatrix(); islandCam.updateProjectionMatrix();
  }

  function setTheme(c, instant) {
    if (!c) return;
    COLOR_KEYS.forEach(function (k) { if (c[k]) colorGoal[k].set(c[k]); });
    if (!isNaN(c.lineAlpha)) colorGoal.lineAlpha = c.lineAlpha;
    if (!isNaN(c.seaAlpha)) colorGoal.seaAlpha = c.seaAlpha;
    if (instant) {
      COLOR_KEYS.forEach(function (k) { colors[k].copy(colorGoal[k]); });
      colors.lineAlpha = colorGoal.lineAlpha; colors.seaAlpha = colorGoal.seaAlpha;
    }
    start();
  }

  function applyOffset(cam, sx, sy, portrait, spy) {
    var x = portrait ? 0 : sx, y = portrait ? spy : sy;
    if (Math.abs(x) > 0.0005 || Math.abs(y) > 0.0005) cam.setViewOffset(W, H, -x * W, -y * H, W, H);
    else cam.clearViewOffset();
  }

  function followPose(t, portrait) {
    var a = routeAt(t - 0.025), b = routeAt(t + 0.025);
    var fx = b.x - a.x, fz = b.z - a.z;
    var p = routeAt(t);
    var heading = Math.atan2(-fz, fx) / RAD;
    var yaw = Math.atan2(-fx, -fz) / RAD + 24;
    return { x: p.x, y: p.h * isl.rise + 0.35, z: p.z, yaw: yaw, heading: heading, pitch: portrait ? 40 : 33, dist: portrait ? 36 : 29 };
  }

  var _v = new T.Vector3(), _v2 = new T.Vector3();

  function update(dt) {
    time += dt;
    if (turbo > 0) turbo = Math.max(0, turbo - dt);
    var tb = turbo > 0 ? Math.min(1, turbo / 0.6) : 0;
    var s = clamp(state.s, 0, 4);
    var kk = reduceMotion ? 1 : 1 - Math.exp(-dt * 4.2);
    var aspect = W / H, portrait = aspect < 0.95;
    var distMul = aspect >= 1.25 ? 1 : Math.pow(1.25 / aspect, 0.85);

    /* thème */
    var cc = 1 - Math.exp(-dt * 6);
    COLOR_KEYS.forEach(function (n) { colors[n].lerp(colorGoal[n], cc); });
    colors.lineAlpha += (colorGoal.lineAlpha - colors.lineAlpha) * cc;
    colors.seaAlpha += (colorGoal.seaAlpha - colors.seaAlpha) * cc;

    var ga = 1 - smooth(3.15, 3.8, s);
    var ia = smooth(3.3, 3.95, s);
    info.ga = ga; info.ia = ia;
    info.dive = Math.sin(clamp((s - 2.7) / 1.3, 0, 1) * Math.PI);

    /* ------------------------------ GLOBE ------------------------------- */
    if (ga > 0.005) {
      var gi = Math.min(3, Math.floor(s)), gu = easeIO(clamp((s - gi - 0.12) / 0.76, 0, 1));
      GN.forEach(function (n) { gGoal[n] = lerp(GK[gi][n], GK[gi + 1][n], gu); });
      GN.forEach(function (n) { g[n] += (gGoal[n] - g[n]) * kk; });
      var spinSpeed = (6 + tb * 70) * (1 - smooth(0.2, 1.1, s) * 0.85);
      spin = (spin + dt * spinSpeed) % 360;
      var goalLon = s < 1.5 ? spin : REU[0] + 4;
      g.lon = angSmooth(g.lon, goalLon, reduceMotion ? 1 : s < 1.5 ? 1 - Math.exp(-dt * 8) : 1 - Math.exp(-dt * 3.4));

      var lon = g.lon + par.x * 2.6, lat = g.lat - par.y * 1.8;
      var dist = g.dist * distMul;
      globeCam.position.copy(ll2v(lon, lat, dist));
      globeCam.up.set(0, 1, 0);
      globeCam.lookAt(0, 0, 0);
      globeCam.fov = 30 + tb * 9;
      globeCam.updateProjectionMatrix();
      applyOffset(globeCam, g.sx, 0, portrait, g.spy);
      globeCam.updateMatrixWorld(true);

      view.lon = wrapDeg(g.lon); view.lat = g.lat; view.alt = Math.max(0, (g.dist - R) / R * 6371);

      gUni.uTime.value = time; gUni.uAlpha.value = ga;
      gUni.uPx.value = (H * dpr) / (2 * Math.tan(globeCam.fov * RAD / 2));
      gUni.uScale.value = clamp(165 / dist, 0.7, 2.1) * dpr * (small ? 0.8 : 1);
      gUni.uHalo.value = g.halo;
      gUni.uFocusAmt.value = g.fa;
      _v.copy(globeCam.position).normalize();
      _v2.set(-0.55, 0.6, 0).applyQuaternion(globeCam.quaternion);
      gUni.uLight.value.copy(_v).multiplyScalar(0.8).add(_v2).normalize();
      graticuleMat.color.copy(colors.line);
      graticuleMat.opacity = 0.08 * ga;
      starMat.color.copy(colors.dot); starMat.opacity = 0.3 * ga;

      /* marqueur Réunion */
      var rs = clamp((dist - R) / 60, 0.14, 2.0);
      reuPin.scale.set(rs, rs, rs);
      var pa = ga * clamp(1.2 - smooth(2.8, 3.5, s), 0, 1);
      /* le trait et la tête s'effacent quand on zoome : ils ne doivent jamais masquer l'île */
      var zoomFade = 1 - smooth(1.9, 2.9, s);
      /* pendant l'intro, le marqueur ne doit pas passer sur le texte de gauche */
      var pinCover = 1;
      if (!portrait && s < 1.35) {
        reuHead.getWorldPosition(_v).project(globeCam);
        pinCover = smooth(0.40, 0.64, _v.x * 0.5 + 0.5);
      }
      reuBeamMat.uniforms.uAlpha.value = pa * zoomFade * pinCover;
      reuHeadMat.opacity = pa * (0.25 + 0.75 * zoomFade) * pinCover;
      reuBeamMat.uniforms.uColor.value = colors.accent;
      reuRings.forEach(function (r, i) {
        var ph = ((time * 0.5) + i * 0.5) % 1, sc = 1 + ph * 5.5;
        r.scale.set(sc, 1, sc); r.material.opacity = (1 - ph) * 0.9 * pa * pinCover;
      });

      /* arcs + paquets */
      var arcVis = g.arcs > 0.01;
      arcGroup.visible = arcVis;
      if (arcVis) {
        arcMats.forEach(function (m) { m.opacity = 0.5 * g.arcs * ga; });
        var pp = packetGeo.attributes.position.array;
        for (var i = 0; i < PACKETS; i++) {
          var cv = arcCurves[i >> 1];
          var tt = ((time * 0.17) + (i & 1) * 0.5 + i * 0.11) % 1;
          var ix = Math.min(cv.length - 2, Math.floor(tt * (cv.length - 1))), fr = tt * (cv.length - 1) - ix;
          pp[i * 3] = lerp(cv[ix].x, cv[ix + 1].x, fr);
          pp[i * 3 + 1] = lerp(cv[ix].y, cv[ix + 1].y, fr);
          pp[i * 3 + 2] = lerp(cv[ix].z, cv[ix + 1].z, fr);
        }
        packetGeo.attributes.position.needsUpdate = true;
        packetMat.opacity = clamp(g.arcs * 1.1, 0, 1) * ga;
        packetMat.size = 2.2 * dpr;
      }
      cityBeacons.mat.uniforms.uAlpha.value = ga * (1 - smooth(1.9, 2.8, s) * 0.55);
      arcMats.forEach(function (m) { m.color.copy(colors.accent2); });
      packetMat.color.copy(colors.accent);
      reuHeadMat.color.copy(colors.accent);
      reuRings.forEach(function (r) { r.material.color.copy(colors.accent); });
    }

    /* ------------------------------- ÎLE -------------------------------- */
    if (ia > 0.005) {
      /* montée du relief + anneau de scan */
      var rp = clamp((s - 3.05) / 0.9, 0, 1);
      var rise = 1 - Math.pow(1 - rp, 3);
      isl.rise = rise;
      terrainMat.uniforms.uScan.value = rp >= 1 ? 999 : 150 * (1 - Math.pow(1 - rp, 2.2)) + 0.01;

      /* voiture */
      var snap = !wasIsl;
      wasIsl = true;
      var kc = reduceMotion || snap ? 1 : 1 - Math.exp(-dt * (turbo > 0 ? 6 : 2.7));
      carT += (clamp(state.road, 0, 1) - carT) * kc;
      if (snap) prevCarT = carT;
      var fp = followPose(carT, portrait);
      camHead = angSmooth(camHead, fp.yaw, reduceMotion || snap ? 1 : 1 - Math.exp(-dt * 2.4));
      carHead = angSmooth(carHead, fp.heading, reduceMotion || snap ? 1 : 1 - Math.exp(-dt * 6));

      /* visée */
      var hiU = smooth(3.45, 4.0, s);
      var pl = easeIO(clamp(state.place, 0, 1));
      var yawFollow = camHead;
      var sxFollow = -0.2 * (1 - smooth(0, 0.035, state.road)) * (1 - pl);
      var gx = lerp(0, fp.x, hiU), gy = lerp(0, fp.y, hiU), gz = lerp(2, fp.z, hiU);
      var gyaw = angLerp(0, yawFollow, hiU), gpitch = lerp(82, fp.pitch, hiU), gdist = lerp(165, fp.dist, hiU);
      var placeYaw = 12;
      islGoal.tx = lerp(gx, SP[0] - 2.5, pl); islGoal.ty = lerp(gy, 0.8, pl); islGoal.tz = lerp(gz, SP[1] - 1.5, pl);
      islGoal.yaw = angLerp(gyaw, placeYaw, pl);
      islGoal.pitch = lerp(gpitch, portrait ? 40 : 35, pl);
      islGoal.dist = lerp(gdist, portrait ? 46 : 38, pl);
      islGoal.sx = lerp(sxFollow, -0.24, pl);
      islGoal.spy = lerp(portrait ? -0.1 : 0, -0.18, pl);
      islGoal.pin = pl; islGoal.fs = pl; islGoal.fx = SP[0]; islGoal.fz = SP[1]; islGoal.fr = 9;

      var ik = reduceMotion || snap ? 1 : 1 - Math.exp(-dt * 5);
      ['tx', 'ty', 'tz', 'pitch', 'dist', 'sx', 'spy', 'pin', 'fs'].forEach(function (n) { isl[n] += (islGoal[n] - isl[n]) * ik; });
      isl.yaw = angSmooth(isl.yaw, islGoal.yaw, ik);
      isl.fx = islGoal.fx; isl.fz = islGoal.fz; isl.fr = islGoal.fr;

      var idist = isl.dist * (portrait && hiU < 0.5 ? 0.62 + distMul * 0.3 : 1);
      var yaw = (isl.yaw + par.x * 3 + (reduceMotion ? 0 : Math.sin(time * 0.12) * 1.6)) * RAD;
      var pitch = (isl.pitch - par.y * 2) * RAD;
      islandCam.position.set(
        isl.tx + idist * Math.sin(yaw) * Math.cos(pitch),
        isl.ty + idist * Math.sin(pitch),
        isl.tz + idist * Math.cos(yaw) * Math.cos(pitch)
      );
      islandCam.fov = 30 + tb * 10;
      islandCam.updateProjectionMatrix();
      islandCam.lookAt(isl.tx, isl.ty, isl.tz);
      applyOffset(islandCam, isl.sx, 0, portrait, isl.spy);
      islandCam.updateMatrixWorld(true);
      if (ia > 0.6) { view.lon = REU[0]; view.lat = REU[1]; view.alt = idist; }

      /* uniforms */
      var u = terrainMat.uniforms;
      u.uRise.value = rise; u.uTime.value = time; u.uLineAlpha.value = colors.lineAlpha; u.uFade.value = ia;
      u.uFocus.value.set(isl.fx, isl.fz, isl.fs * rise, Math.max(isl.fr, 0.5));
      u.uPin.value.z = isl.pin * 0.9 * rise;
      oceanMat.uniforms.uTime.value = time; oceanMat.uniforms.uAlpha.value = colors.seaAlpha * clamp(rise * 1.4, 0, 1) * ia;
      routeMat.uniforms.uRise.value = rise; routeMat.uniforms.uProg.value = carT; routeMat.uniforms.uFade.value = ia * clamp((rise - 0.5) * 2, 0, 1);
      routeMat.uniforms.uTime.value = time;
      iUni.uTime.value = time; iUni.uScale.value = clamp(30 / idist, 0.7, 2.4) * dpr * (small ? 0.85 : 1);
      iUni.uAlpha.value = ia * clamp((rise - 0.5) * 2, 0, 1);

      /* épingle */
      pinScale = clamp(idist / 40, 0.75, 2.4);
      pin.scale.set(pinScale, pinScale, pinScale);
      var pa2 = clamp(isl.pin * 1.1 + 0.15, 0, 1) * ia;
      pin.visible = rise > 0.6;
      beamMat.uniforms.uAlpha.value = 0.95 * pa2; headMat.opacity = pa2;
      rings.forEach(function (r, i) {
        var ph = ((time * 0.45) + i * 0.5) % 1, sc = 1 + ph * 8;
        r.scale.set(sc, 1, sc); r.material.opacity = (1 - ph) * 0.85 * pa2;
      });

      /* voiture : position, cap, tangage, roulis */
      var cp = routeAt(carT);
      var cs = clamp(idist / 29, 0.85, 2.2) * smooth(3.55, 3.95, s);
      car.visible = cs > 0.02 && rise > 0.6;
      car.position.set(cp.x, cp.h * rise + 0.04, cp.z);
      car.scale.set(cs, cs, cs);
      var ah = routeAt(carT + 0.012), bh = routeAt(carT - 0.012);
      var slope = Math.atan2((ah.h - bh.h) * rise, Math.hypot(ah.x - bh.x, ah.z - bh.z) || 1);
      var dHead = wrapDeg(fp.heading - carHead);
      carRoll += ((-dHead * 0.12 - carRoll) * (1 - Math.exp(-dt * 6)));
      car.rotation.y = carHead * RAD;
      car.rotation.z = slope * 0.9;
      carBody.rotation.x = clamp(carRoll, -0.14, 0.14);
      var moved = (carT - prevCarT) * routeLen;
      prevCarT = carT;
      carWheel += moved / 0.15 * (reduceMotion ? 0 : 1);
      car.userData.wheels.forEach(function (w) { w.rotation.z = -carWheel; });
      carMats.forEach(function (m) { m.opacity = ia; });
      carBodyMat.color.copy(colors.accent);
      beamCarMat.uniforms.uAlpha.value = (0.42 + tb * 0.5) * ia;
      shadowMat.opacity = 0.28 * ia;
      carBeam.scale.x = 1 + tb * 0.8;

      /* km / étape courante */
      info.carT = carT; info.km = Math.max(0, (1 - carT) * routeLen);
      var cur = 0;
      stops.forEach(function (st2, i) { if (carT >= st2.t - 0.004 || (state.road >= st2.t - 0.002 && carT >= st2.t - 0.06)) cur = i; });
      info.stop = cur;

      terrainMesh.visible = true;
    }

    if (ia <= 0.005) wasIsl = false;

    var pk = 1 - Math.exp(-dt * 3);
    par.x += (par.tx - par.x) * pk; par.y += (par.ty - par.y) * pk;

    /* ---------------------------- ÉTIQUETTES ---------------------------- */
    var camG = globeCam;
    labels.forEach(function (L) {
      var goal = 0, cam = islandCam, vis = true;
      if (L.kind === 'home') { goal = ga * (1 - smooth(2.7, 3.3, s)); cam = camG; }
      else if (L.kind === 'city') { goal = ga * smooth(0.55, 1.0, s) * (1 - smooth(1.7, 2.2, s)); cam = camG; }
      else if (L.kind === 'stop') {
        var near = 1 - clamp(Math.abs(carT - L.stop.t) / 0.075, 0, 1);
        goal = ia * clamp((isl.rise - 0.9) * 10, 0, 1) * Math.max(near, L.stop.id === 'pierre' ? state.place : 0);
      }
      L.w += (goal - L.w) * (1 - Math.exp(-dt * 7));
      if (L.w < 0.01) { if (L.el.style.opacity !== '0') L.el.style.opacity = '0'; return; }
      var p = L.getPos();
      _v.copy(p).project(cam);
      if (_v.z > 1) { L.el.style.opacity = '0'; return; }
      var op = L.w;
      if (cam === camG) {
        var cnorm = (L.kind === 'home' ? reuNormal : ll2v(CITIES[L.city][1], CITIES[L.city][2], 1));
        var face = cnorm.dot(_v2.copy(camG.position).normalize());
        op *= smooth(0.12, 0.32, face);
      }
      var x = (_v.x * 0.5 + 0.5) * W, y = (1 - (_v.y * 0.5 + 0.5)) * H;
      if (!portrait && s < 1.35 && cam === camG) op *= smooth(W * 0.40, W * 0.64, x);
      L.el.style.opacity = op.toFixed(3);
      L.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-100%)';
    });
  }

  function frame(now) {
    raf = 0;
    if (!active || document.hidden) return;
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    update(dt);
    renderer.clear();
    if (info.ga > 0.005) renderer.render(globeScene, globeCam);
    if (info.ia > 0.005) { renderer.clearDepth(); renderer.render(islandScene, islandCam); }
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (raf || !active || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function setActive(v) {
    if (active === v) return;
    active = v;
    document.documentElement.classList.toggle('world-on', v);
    if (v) start();
  }
  document.addEventListener('visibilitychange', start);
  window.addEventListener('resize', resize);

  /* Données pour la mini-carte HTML */
  function minimap() {
    var xs = COAST.map(function (p) { return p[0]; }), zs = COAST.map(function (p) { return p[1]; });
    var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), minz = Math.min.apply(null, zs), maxz = Math.max.apply(null, zs);
    var route = [];
    for (var i = 0; i <= RN; i += 4) route.push([rx[i], rz[i]]);
    return {
      coast: COAST, route: route, bounds: [minx, minz, maxx, maxz],
      stops: stops.map(function (s) { return { id: s.id, name: s.name, t: s.t, x: s.x, z: s.z }; }),
      km: routeLen
    };
  }

  /* Aperçu numérique : rend une image et mesure la couverture (tests) */
  function snapshot() {
    update(0.016);
    renderer.clear();
    if (info.ga > 0.005) renderer.render(globeScene, globeCam);
    if (info.ia > 0.005) { renderer.clearDepth(); renderer.render(islandScene, islandCam); }
    var c = document.createElement('canvas');
    c.width = 160; c.height = Math.max(1, Math.round(160 * H / W));
    var gx = c.getContext('2d', { willReadFrequently: true });
    gx.drawImage(canvas, 0, 0, c.width, c.height);
    var d = gx.getImageData(0, 0, c.width, c.height).data, n = 0;
    for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 20) n++;
    return { coverage: +(n / (d.length / 4)).toFixed(3), size: [W, H], s: state.s, ga: +info.ga.toFixed(2), ia: +info.ia.toFixed(2), dots: dotCount, routeKm: +routeLen.toFixed(1) };
  }

  resize();
  window.World = {
    setState: function (o) { if (o.s !== undefined) state.s = o.s; if (o.road !== undefined) state.road = o.road; if (o.place !== undefined) state.place = o.place; start(); },
    setTheme: setTheme, setActive: setActive, resize: resize, snapshot: snapshot, minimap: minimap,
    setParallax: function (x, y) { par.tx = x; par.ty = y; },
    turbo: function (ms) { turbo = (ms || 4000) / 1000; start(); },
    view: view, info: info, stops: stops,
    get routeKm() { return routeLen; },
    get ready() { return true; }
  };
})();
