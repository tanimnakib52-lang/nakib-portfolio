/* ============================================================
   earth.js — 3D Earth in the hero (Three.js r134)
   Realistic day/night shader, drifting clouds, atmosphere glow.
   Rendering pauses when the hero scrolls out of view or the
   tab is hidden, so it costs nothing while reading the page.
   ============================================================ */

(function () {
  var canvas = document.getElementById('heroEarthCanvas');
  var wrap = document.getElementById('heroEarthWrap');
  if (!canvas || !wrap || typeof THREE === 'undefined') return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  /* 64 segments is visually identical to 128 at this size, at 1/4 the vertices */
  var SEGMENTS = 64;

  function getSize() { return wrap.clientWidth || 400; }

  var S = getSize();
  canvas.width = S * DPR;
  canvas.height = S * DPR;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance'
    });
  } catch (err) {
    /* No WebGL — hide the globe, page still works */
    wrap.style.display = 'none';
    return;
  }
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.15, 2.5);
  camera.lookAt(0, 0, 0);

  var tl = new THREE.TextureLoader();
  tl.crossOrigin = 'anonymous';
  var BASE = 'https://unpkg.com/three-globe@2.31.2/example/img/';
  /* NASA Blue Marble — true satellite composite, far more photoreal than the stylised day map */
  var texDay = tl.load(BASE + 'earth-blue-marble.jpg');
  var texNight = tl.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_lights_2048.png');
  var texCloud = tl.load(BASE + 'earth-clouds.png');

  /* Anisotropic filtering keeps the texture sharp at glancing angles near the limb */
  var maxAniso = renderer.capabilities.getMaxAnisotropy();
  texDay.anisotropy = maxAniso;
  texNight.anisotropy = maxAniso;
  texCloud.anisotropy = maxAniso;

  var SUN_DIR = new THREE.Vector3(1.0, 0.15, 0.0).normalize();

  /* --- Earth: day/night shader, world-space sun so the terminator
         stays fixed while the planet rotates --- */
  var earthMat = new THREE.ShaderMaterial({
    uniforms: {
      dayTex: { value: texDay },
      nightTex: { value: texNight },
      sunDir: { value: SUN_DIR }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'varying vec3 vNormalWorld;',
      'varying vec3 vNormalView;',
      'varying vec3 vPosWorld;',
      'varying vec3 vPos;',
      'void main(){',
      '  vUv=uv;',
      '  vNormalWorld=normalize((modelMatrix*vec4(normal,0.0)).xyz);',
      '  vNormalView=normalize(normalMatrix*normal);',
      '  vPosWorld=(modelMatrix*vec4(position,1.0)).xyz;',
      '  vPos=(modelViewMatrix*vec4(position,1.0)).xyz;',
      '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D dayTex,nightTex;',
      'uniform vec3 sunDir;',
      'varying vec2 vUv;',
      'varying vec3 vNormalWorld;',
      'varying vec3 vNormalView;',
      'varying vec3 vPosWorld;',
      'varying vec3 vPos;',
      'void main(){',
      '  vec3 n=normalize(vNormalWorld);',
      '  vec3 nv=normalize(vNormalView);',
      '  vec3 sd=normalize(sunDir);',
      '  float sun=dot(n,sd);',
      '',
      '  vec4 day=texture2D(dayTex,vUv);',
      '  vec4 night=texture2D(nightTex,vUv);',
      '',
      /* atmosphere softens the terminator — not a hard line */
      '  float blend=smoothstep(-0.06, 0.12, sun);',
      '',
      /* day side: lambert falloff so the surface dims toward the terminator */
      '  float daylight = 0.22 + 0.88*clamp(sun,0.0,1.0);',
      '  vec3 dayCol = day.rgb * daylight;',
      '',
      /* warm sunset band hugging the terminator */
      '  float sunset = smoothstep(0.35, 0.02, sun) * smoothstep(-0.12, 0.02, sun);',
      '  dayCol *= mix(vec3(1.0), vec3(1.18, 0.82, 0.60), sunset*0.7);',
      '',
      /* city lights on the night side; threshold kills JPEG noise */
      '  float lightLevel = max(0.0, night.r - 0.1);',
      '  vec3 cityLights = lightLevel * vec3(1.0, 0.87, 0.55) * 3.2;',
      '  vec3 cityBloom = pow(lightLevel, 1.5) * vec3(1.0, 0.7, 0.3) * 1.8;',
      /* faint moonlit blue instead of pitch black */
      '  vec3 nightBase = cityLights + cityBloom + vec3(0.010, 0.015, 0.028);',
      '',
      '  vec3 col=mix(nightBase,dayCol,blend);',
      '',
      /* atmosphere fresnel — blue by day, warming to orange at the terminator */
      '  vec3 viewDir=normalize(-vPos);',
      '  float fr=pow(1.0-max(dot(viewDir,nv),0.0),3.0);',
      '  vec3 atmCol=mix(vec3(1.0,0.45,0.20),vec3(0.35,0.58,1.0),smoothstep(0.0,0.30,sun));',
      '  vec3 atm=atmCol*fr*0.8*smoothstep(-0.12,0.10,sun);',
      '',
      /* sun glint on water */
      '  float spec=0.0;',
      '  if(day.b>day.r*1.05 && blend>0.2){',
      '    vec3 viewD=normalize(cameraPosition-vPosWorld);',
      '    vec3 h=normalize(sd+viewD);',
      '    spec=pow(max(dot(n,h),0.0),80.0)*0.45*max(sun,0.0);',
      '  }',
      '  vec3 specCol=vec3(1.0,0.95,0.85)*spec;',
      '',
      '  gl_FragColor=vec4(col+atm+specCol,1.0);',
      '}'
    ].join('\n')
  });

  var earth = new THREE.Mesh(new THREE.SphereGeometry(1, SEGMENTS, SEGMENTS), earthMat);
  /* real Earth axial tilt 23.5° — ZYX order avoids pole gimbal issues */
  earth.rotation.order = 'ZYX';
  earth.rotation.z = 0.41;
  scene.add(earth);

  /* --- Clouds --- */
  var cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texCloud },
      sunDir: { value: SUN_DIR }
    },
    transparent: true,
    depthWrite: false,
    vertexShader: [
      'varying vec2 vUv;',
      'varying vec3 vNormalWorld;',
      'void main(){',
      '  vUv=uv;',
      '  vNormalWorld=normalize((modelMatrix*vec4(normal,0.0)).xyz);',
      '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D map;',
      'uniform vec3 sunDir;',
      'varying vec2 vUv;',
      'varying vec3 vNormalWorld;',
      'void main(){',
      '  vec4 c=texture2D(map,vUv);',
      '  float poleFade=smoothstep(0.12,0.25,vUv.y)*(1.0-smoothstep(0.75,0.88,vUv.y));',
      '  float sun=dot(normalize(vNormalWorld),normalize(sunDir));',
      '  float light=smoothstep(-0.12,0.25,sun);',
      '',
      /* clouds shade with the sun like the surface below them */
      '  vec3 dayCloud=vec3(0.28+0.78*clamp(sun,0.0,1.0));',
      '',
      /* sunset-pink cloud tops near the terminator */
      '  float sunset=smoothstep(0.30,0.02,sun)*smoothstep(-0.10,0.02,sun);',
      '  dayCloud*=mix(vec3(1.0),vec3(1.15,0.75,0.55),sunset*0.8);',
      '',
      '  vec3 cloudCol=mix(vec3(0.02,0.035,0.07),dayCloud,light);',
      '  gl_FragColor=vec4(cloudCol, c.r * 0.65 * poleFade);',
      '}'
    ].join('\n')
  });
  var clouds = new THREE.Mesh(new THREE.SphereGeometry(1.007, SEGMENTS, SEGMENTS), cloudMat);
  clouds.rotation.order = 'ZYX';
  clouds.rotation.z = 0.41;
  scene.add(clouds);

  /* --- Outer atmosphere glow --- */
  var atmMat = new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(0.28, 0.55, 1.0) } },
    vertexShader: 'varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    /* thin, tight rim — a fat glow reads as cartoonish */
    fragmentShader: 'uniform vec3 glowColor;varying vec3 vN;void main(){float i=pow(0.62-dot(vN,vec3(0.0,0.0,1.0)),4.2);gl_FragColor=vec4(glowColor,i*0.6);}',
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.065, SEGMENTS, SEGMENTS), atmMat));

  /* --- Rotation: one full spin per minute (0 if reduced motion) --- */
  var ROT_SPEED = reducedMotion ? 0 : (2 * Math.PI) / 60; /* rad/sec */
  var cloudOff = 0;

  /* --- Drag to rotate (Pointer Events cover mouse + touch) --- */
  var drag = false, prev = { x: 0, y: 0 };
  var velX = 0, velY = 0, extraRotX = 0, extraRotY = 0;
  canvas.style.pointerEvents = 'auto';
  canvas.style.touchAction = 'pan-y'; /* vertical page scroll still works over the globe */

  canvas.addEventListener('pointerdown', function (e) {
    drag = true;
    prev = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    velX += (e.clientX - prev.x) * 0.005;
    velY += (e.clientY - prev.y) * 0.005;
    prev = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', function () { drag = false; });
  canvas.addEventListener('pointercancel', function () { drag = false; });

  window.addEventListener('resize', function () {
    var ns = getSize();
    canvas.width = ns * DPR;
    canvas.height = ns * DPR;
    renderer.setSize(canvas.width, canvas.height, false);
  }, { passive: true });

  /* --- Render loop, paused when the globe can't be seen --- */
  var raf = null;
  var inView = true;
  var running = false;

  function frame() {
    if (!running) return;
    var now = performance.now();

    extraRotY += velX;
    extraRotX += velY;
    /* clamp vertical rotation so the globe can't flip over */
    extraRotX = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, extraRotX));
    velX *= 0.90;
    velY *= 0.90;
    cloudOff += 0.00008;

    var autoY = ROT_SPEED * now / 1000;
    earth.rotation.y = autoY + extraRotY;
    earth.rotation.x = extraRotX;
    clouds.rotation.y = autoY + extraRotY + cloudOff;
    clouds.rotation.x = extraRotX;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function updateRunning() {
    var shouldRun = inView && !document.hidden;
    if (shouldRun && !running) {
      running = true;
      raf = requestAnimationFrame(frame);
    } else if (!shouldRun && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      updateRunning();
    }, { threshold: 0.01 }).observe(wrap);
  }
  document.addEventListener('visibilitychange', updateRunning);

  updateRunning();
})();
