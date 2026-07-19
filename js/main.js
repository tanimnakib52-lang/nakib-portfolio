/* ============================================================
   main.js — night-sky background + UI behaviour
   Sections: Sky (real photo + fallback) · Nav scroll state ·
             Hamburger menu · Scroll reveal · Footer year
   ============================================================ */

/* ======= NIGHT SKY ======= */
(function () {
  var cv = document.getElementById('starCanvas');
  if (!cv) return;
  var cx = cv.getContext('2d');
  var W, H, stars = [], meteors = [];
  var mx = 0, my = 0, t = 0, raf = null;
  var running = false;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  /* Real astrophotography: "The Milky Way panorama" — ESO/S. Brunier (CC BY 4.0).
     The small 152 KB version paints first, then silently upgrades to the
     1920px one. The procedural starfield below only shows while these load,
     or if they can't (e.g. offline). */
  var SKY_LOW = 'https://cdn.eso.org/images/screen/eso0932a.jpg';
  var SKY_HIGH = 'https://cdn.eso.org/images/wallpaper4/eso0932a.jpg';
  /* Darken the photo slightly so the text on top stays readable */
  var SKY_DIM = 0.25;
  var skyImg = null;
  var skyHigh = false;

  function loadSky(url, isHigh) {
    var im = new Image();
    im.onload = function () {
      if (isHigh) { skyImg = im; skyHigh = true; }
      else if (!skyHigh) { skyImg = im; } /* don't downgrade if hi-res won the race */
      if (reducedMotion) drawFrame(); /* static mode needs a repaint with the photo */
    };
    im.src = url;
  }
  loadSky(SKY_LOW, false);
  loadSky(SKY_HIGH, true);

  function rand(a, b) { return Math.random() * (b - a) + a; }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStars();
  }

  /* --- Fallback stars (photo not loaded yet) --- */
  var STAR_COLORS = [
    ['#9db4ff', 0.08], ['#c9d6ff', 0.14], ['#e9edff', 0.20],
    ['#ffffff', 0.26], ['#fff6e8', 0.16], ['#ffeacd', 0.11], ['#ffd9a3', 0.05]
  ];
  function starColor() {
    var r = Math.random(), acc = 0;
    for (var i = 0; i < STAR_COLORS.length; i++) {
      acc += STAR_COLORS[i][1];
      if (r < acc) return STAR_COLORS[i][0];
    }
    return '#ffffff';
  }

  function buildStars() {
    stars = [];
    var density = W < 768 ? 1400 : 1000;
    var n = Math.min(Math.floor(W * H / density), 600);
    for (var i = 0; i < n; i++) {
      var m = Math.pow(Math.random(), 3);
      stars.push({
        x: rand(0, W), y: rand(0, H),
        r: 0.15 + 1.1 * m,
        base: Math.min(1, 0.18 + 0.6 * m + rand(0, 0.15)),
        tw: rand(0.002, 0.014),
        tp: rand(0, Math.PI * 2),
        col: starColor()
      });
    }
  }

  function drawFallbackSky() {
    stars.forEach(function (s) {
      var twk = Math.sin(t * 50 * s.tw + s.tp);
      cx.globalAlpha = Math.min(1, Math.max(0, s.base * (0.75 + 0.25 * twk)));
      cx.fillStyle = s.col;
      cx.beginPath();
      cx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      cx.fill();
    });
    cx.globalAlpha = 1;
  }

  /* --- Real photo sky --- */
  function drawPhotoSky(ox, oy) {
    var iw = skyImg.width, ih = skyImg.height;
    if (!iw || !ih) return;
    /* cover-fit with extra margin so the parallax never reveals an edge */
    var margin = 50;
    var scale = Math.max((W + margin * 2) / iw, (H + margin * 2) / ih);
    var dw = iw * scale, dh = ih * scale;
    var drift = Math.sin(t * 0.03) * 8; /* very slow sway, like a long-exposure pan */
    var dx = (W - dw) / 2 - ox - drift;
    var dy = (H - dh) / 2 - oy;
    cx.drawImage(skyImg, dx, dy, dw, dh);

    cx.fillStyle = 'rgba(0,0,0,' + SKY_DIM + ')';
    cx.fillRect(0, 0, W, H);
  }

  /* --- Meteors / shooting stars --- */
  function spawnMeteor() {
    if (meteors.length >= 2 || Math.random() > 0.002) return;
    var ang = rand(0.1, 0.5);
    var spd = rand(4, 12);
    meteors.push({
      x: rand(0, W * 0.8), y: rand(0, H * 0.4),
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      len: rand(50, 100), life: 1,
      decay: rand(0.008, 0.015),
      w: rand(0.4, 1.2)
    });
  }

  function drawMeteors() {
    spawnMeteor();
    meteors = meteors.filter(function (m) { return m.life > 0; });
    meteors.forEach(function (m) {
      var gm = cx.createLinearGradient(m.x, m.y, m.x - m.vx * (m.len / 5), m.y - m.vy * (m.len / 5));
      gm.addColorStop(0, 'rgba(255,255,255,' + (m.life * 0.85) + ')');
      gm.addColorStop(1, 'rgba(255,255,255,0)');
      cx.strokeStyle = gm;
      cx.lineWidth = m.w;
      cx.lineCap = 'round';
      cx.beginPath();
      cx.moveTo(m.x, m.y);
      cx.lineTo(m.x - m.vx * (m.len / 5), m.y - m.vy * (m.len / 5));
      cx.stroke();
      m.x += m.vx; m.y += m.vy; m.life -= m.decay;
    });
  }

  function drawFrame() {
    cx.clearRect(0, 0, W, H);
    var ox = (mx / W - 0.5) * 15;
    var oy = (my / H - 0.5) * 10;
    if (skyImg) drawPhotoSky(ox, oy);
    else drawFallbackSky();
    drawMeteors();
  }

  function loop() {
    if (!running) return;
    t += 0.009;
    drawFrame();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (running || reducedMotion) return;
    running = true;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
  }

  /* Parallax input */
  window.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
  window.addEventListener('deviceorientation', function (e) {
    mx = W / 2 + (e.gamma || 0) * 6;
    my = H / 2 + (e.beta || 0) * 6;
  }, { passive: true });

  /* Debounced resize */
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (reducedMotion) drawFrame();
    }, 150);
  });

  /* Pause when the tab is hidden — saves battery/CPU */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });

  resize();
  if (reducedMotion) {
    drawFrame(); /* single static frame, no animation loop */
  } else {
    start();
  }
})();

/* ======= NAV SCROLL STATE ======= */
(function () {
  var nav = document.getElementById('nav');
  if (!nav) return;
  window.addEventListener('scroll', function () {
    nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });
})();

/* ======= HAMBURGER / MOBILE MENU ======= */
(function () {
  var btn = document.getElementById('ham');
  var menu = document.getElementById('mobMenu');
  if (!btn || !menu) return;
  var links = menu.querySelectorAll('.mlink');

  function toggle(open) {
    btn.classList.toggle('active', open);
    menu.classList.toggle('active', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('menu-open', open); /* lock page scroll behind the menu */
  }

  btn.addEventListener('click', function () {
    toggle(!btn.classList.contains('active'));
  });
  links.forEach(function (l) {
    l.addEventListener('click', function () { toggle(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') toggle(false);
  });
})();

/* ======= SCROLL REVEAL ======= */
(function () {
  var els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -25px 0px' });
  els.forEach(function (el) { obs.observe(el); });
})();

/* ======= FOOTER YEAR ======= */
(function () {
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();
