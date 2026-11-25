/* =========================================================
   VAMPBUZZ - MONSTROS DO ALTO ESCALÃO
   Jogo 2D de plataforma: 6 fases, 2 chefões (Vamp e Buzz)
   ========================================================= */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const FONT = '"Press Start 2P", monospace';

  // tamanho lógico (muda conforme a tela)
  let W = 960, H = 540, GROUND = 480, PORTRAIT = false, SF = 1;

  const C = {
    purple: '#9b30ff', purpleD: '#3d0a66', purpleL: '#c77dff', purpleX: '#1c0530',
    green: '#39ff14', greenD: '#1f8f0a', greenL: '#b6ff9e',
    red: '#ff2a3d', redD: '#8a0010', gold: '#ffcc00', goldD: '#8a6200', white: '#ffffff'
  };

  // ---------- armazenamento ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let best = store.get('vb_best', 0);
  let muted = store.get('vb_muted', false);
  let heroIdx = store.get('vb_hero', 0);
  let diffIdx = store.get('vb_diff', 1);

  const HEROES = [
    { id: 'bruno', name: 'BRUNO', h: 96 },
    { id: 'johanne', name: 'JOHANNE', h: 96 },
    { id: 'wesley', name: 'WESLEY', h: 100 },
    { id: 'analu', name: 'ANALÚ', h: 78 }
  ];
  const DIFFS = [
    { name: 'FÁCIL', spd: 0.8, fire: 0.6, boss: 0.7, count: 0.7, hearts: 2 },
    { name: 'NORMAL', spd: 1, fire: 1, boss: 1, count: 1, hearts: 1 },
    { name: 'DIFÍCIL', spd: 1.25, fire: 1.45, boss: 1.35, count: 1.3, hearts: 0 }
  ];
  const PHASES = [
    { env: 'vamp', scene: 'cemiterio', name: 'CEMITÉRIO DOS MORCEGOS', enemies: { bat: 11 } },
    { env: 'buzz', scene: 'cidade', name: 'AVENIDA NEON', enemies: { drone: 5, bat: 6 } },
    { env: 'vamp', scene: 'castelo', name: 'O CASTELO DO VAMP', boss: 'vamp' },
    { env: 'buzz', scene: 'escritorio', name: 'ESCRITÓRIO DO ALTO ESCALÃO', enemies: { worker: 9, drone: 2 } },
    { env: 'vamp', scene: 'cemiterio', name: 'NOITE SEM FIM', enemies: { bat: 8, worker: 5, drone: 3 } },
    { env: 'buzz', scene: 'cobertura', name: 'A COBERTURA DO BUZZ', boss: 'buzz' }
  ];

  // ---------- imagens ----------
  const SRC = {
    bruno: 'assets/bruno.png', johanne: 'assets/johanne.png', wesley: 'assets/wesley.png',
    analu: 'assets/analu.png', vamp: 'assets/vamp.png', buzz: 'assets/buzz.png', logo: 'assets/logo.png'
  };
  const IMG = {}, SPR = {};
  function loadImages() {
    return Promise.all(Object.entries(SRC).map(([k, src]) => new Promise((res) => {
      const im = new Image();
      im.onload = () => { IMG[k] = im; res(); };
      im.onerror = () => { IMG[k] = null; res(); };
      im.src = src;
    })));
  }
  function makeSprite(img, h) {
    if (!img) return null;
    const w = Math.max(1, Math.round(img.width * h / img.height));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    return c;
  }
  function flipSprite(spr) {
    if (!spr) return null;
    const c = document.createElement('canvas'); c.width = spr.width; c.height = spr.height;
    const g = c.getContext('2d'); g.translate(spr.width, 0); g.scale(-1, 1); g.drawImage(spr, 0, 0);
    return c;
  }
  function whiteSprite(spr) {
    if (!spr) return null;
    const c = document.createElement('canvas'); c.width = spr.width; c.height = spr.height;
    const g = c.getContext('2d'); g.drawImage(spr, 0, 0);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function buildSprites() {
    for (const h of HEROES) {
      SPR[h.id] = makeSprite(IMG[h.id], h.h);
      SPR[h.id + '_f'] = flipSprite(SPR[h.id]);
      SPR[h.id + '_card'] = makeSprite(IMG[h.id], 200);
    }
    SPR.vamp = makeSprite(IMG.vamp, 340); SPR.vamp_f = flipSprite(SPR.vamp); SPR.vamp_w = whiteSprite(SPR.vamp);
    SPR.buzz = makeSprite(IMG.buzz, 340); SPR.buzz_f = flipSprite(SPR.buzz); SPR.buzz_w = whiteSprite(SPR.buzz);
  }

  // =========================================================
  //  ÁUDIO (tudo sintetizado: efeitos + trilhas)
  // =========================================================
  let actx = null, master, sfxBus, musicBus, noiseBuf;
  function audio() {
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(actx.destination);
        sfxBus = actx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
        musicBus = actx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
        noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function setMuted(m) {
    muted = m; store.set('vb_muted', m);
    if (master) master.gain.setTargetAtTime(m ? 0 : 1, actx.currentTime, 0.02);
  }
  function tone(bus, freq, t, dur, type, vol, slideTo) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(bus, t, dur, vol, type = 'highpass', freq = 1000, freqTo = null, q = 0.7) {
    const s = actx.createBufferSource(); s.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.02);
  }
  function now(d = 0) { return actx.currentTime + d; }
  const sfx = {
    ui() { if (!audio()) return; tone(sfxBus, 660, now(), 0.07, 'square', 0.07); },
    select() { if (!audio()) return; tone(sfxBus, 880, now(), 0.08, 'square', 0.08); tone(sfxBus, 1320, now(0.07), 0.1, 'square', 0.07); },
    start() { if (!audio()) return; [392, 523, 659, 784, 1047].forEach((f, i) => tone(sfxBus, f, now(i * 0.07), 0.12, 'square', 0.08)); },
    jump() { if (!audio()) return; tone(sfxBus, 280, now(), 0.17, 'square', 0.07, 620); },
    land() { if (!audio()) return; noise(sfxBus, now(), 0.06, 0.07, 'lowpass', 600); },
    drop() { if (!audio()) return; tone(sfxBus, 500, now(), 0.15, 'triangle', 0.1, 180); },
    garlic() { if (!audio()) return; noise(sfxBus, now(), 0.08, 0.12, 'bandpass', 900, 300, 2); tone(sfxBus, 240, now(), 0.1, 'square', 0.06, 120); },
    coinShot() { if (!audio()) return; tone(sfxBus, 1400, now(), 0.06, 'square', 0.05); tone(sfxBus, 2100, now(0.04), 0.09, 'square', 0.04); },
    hit() { if (!audio()) return; tone(sfxBus, 420, now(), 0.08, 'square', 0.08, 200); noise(sfxBus, now(), 0.05, 0.08, 'highpass', 2000); },
    enemyDie() { if (!audio()) return; noise(sfxBus, now(), 0.25, 0.18, 'lowpass', 3000, 200); tone(sfxBus, 600, now(), 0.25, 'square', 0.07, 80); },
    batScreech() { if (!audio()) return; tone(sfxBus, 2400, now(), 0.12, 'sawtooth', 0.025, 1500); },
    laser() { if (!audio()) return; tone(sfxBus, 1500, now(), 0.15, 'square', 0.045, 300); },
    throwIt() { if (!audio()) return; noise(sfxBus, now(), 0.18, 0.08, 'bandpass', 600, 1800, 3); },
    hurt() {
      if (!audio()) return;
      tone(sfxBus, 520, now(), 0.35, 'sawtooth', 0.12, 90);
      tone(sfxBus, 260, now(0.05), 0.3, 'square', 0.08, 60);
      noise(sfxBus, now(), 0.2, 0.15, 'lowpass', 1500, 200);
    },
    coin() { if (!audio()) return; tone(sfxBus, 988, now(), 0.07, 'square', 0.07); tone(sfxBus, 1319, now(0.07), 0.16, 'square', 0.07); },
    heart() { if (!audio()) return; [523, 659, 784, 1047, 1319].forEach((f, i) => tone(sfxBus, f, now(i * 0.05), 0.12, 'triangle', 0.12)); },
    portal() { if (!audio()) return; for (let i = 0; i < 8; i++) tone(sfxBus, 400 + i * 120, now(i * 0.04), 0.2, 'sine', 0.06); },
    clear() { if (!audio()) return; [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(sfxBus, f, now(i * 0.11), i === 6 ? 0.6 : 0.13, 'square', 0.08)); },
    gameOver() { if (!audio()) return; [494, 466, 440, 415, 392, 330].forEach((f, i) => tone(sfxBus, f, now(0.3 + i * 0.22), i === 5 ? 0.8 : 0.2, 'square', 0.08)); },
    victory() {
      if (!audio()) return;
      const m = [523, 523, 523, 659, 784, 784, 659, 784, 1047, 1047, 1319, 1568];
      m.forEach((f, i) => { tone(sfxBus, f, now(i * 0.13), 0.14, 'square', 0.07); tone(sfxBus, f / 2, now(i * 0.13), 0.14, 'triangle', 0.1); });
    },
    // ---- TERROR ----
    scream() { // grito de terror do Vamp
      if (!audio()) return;
      const t = now();
      const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 1.4;
      const g = actx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.06);
      g.gain.setValueAtTime(0.22, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      bp.connect(g); g.connect(sfxBus);
      const lfo = actx.createOscillator(), lg = actx.createGain();
      lfo.frequency.value = 11; lg.gain.value = 60; lfo.connect(lg); lfo.start(t); lfo.stop(t + 1.35);
      [0, 23, 51].forEach((det) => {
        const o = actx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(950 + det, t);
        o.frequency.exponentialRampToValueAtTime(1250 + det, t + 0.25);
        o.frequency.exponentialRampToValueAtTime(160 + det, t + 1.3);
        lg.connect(o.frequency); o.connect(bp); o.start(t); o.stop(t + 1.35);
      });
      noise(sfxBus, t, 1.1, 0.12, 'bandpass', 2500, 400, 1.5);
      tone(sfxBus, 70, t, 1.2, 'sawtooth', 0.12, 40);
    },
    laugh() { // risada maligna
      if (!audio()) return;
      [300, 280, 262, 240, 220, 196].forEach((f, i) => {
        const t = now(i * 0.17);
        const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2;
        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        const o = actx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.15);
        o.connect(bp); bp.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.18);
      });
      tone(sfxBus, 55, now(), 1.1, 'sine', 0.2, 40);
    },
    bossHit() { if (!audio()) return; tone(sfxBus, 180, now(), 0.15, 'square', 0.12, 90); noise(sfxBus, now(), 0.1, 0.12, 'highpass', 3000); },
    inflate(k) { if (!audio()) return; tone(sfxBus, 180 + k * 400, now(), 0.18, 'sine', 0.2, 320 + k * 600); },
    jet() { if (!audio()) return; noise(sfxBus, now(), 0.9, 0.12, 'bandpass', 300, 1800, 1.5); },
    charge() { if (!audio()) return; tone(sfxBus, 200, now(), 0.6, 'sawtooth', 0.06, 900); },
    explosion(big) {
      if (!audio()) return;
      const d = big ? 1.6 : 0.6;
      noise(sfxBus, now(), d, big ? 0.5 : 0.25, 'lowpass', 4000, 60);
      tone(sfxBus, big ? 140 : 200, now(), d, 'sine', big ? 0.5 : 0.25, 30);
      if (big) tone(sfxBus, 90, now(0.05), d, 'sawtooth', 0.12, 25);
    },
    potLand() { if (!audio()) return; tone(sfxBus, 120, now(), 0.3, 'sine', 0.3, 50); [1047, 1319, 1568, 2093].forEach((f, i) => tone(sfxBus, f, now(0.2 + i * 0.08), 0.3, 'triangle', 0.08)); }
  };

  // ---------- trilhas sonoras ----------
  const VAMP_NOTES = [
    69, 72, 76, 72, 81, 79, 76, 72,
    65, 69, 72, 69, 77, 76, 72, 69,
    67, 72, 76, 72, 79, 77, 76, 74,
    67, 71, 74, 71, 79, null, 74, 71,
    81, null, 79, 76, 77, 76, 72, 74,
    77, null, 76, 72, 69, 72, 77, 76,
    76, null, 71, 68, 64, 68, 71, 74,
    76, 74, 72, 71, 68, null, 64, null
  ];
  const TRACKS = {
    title: { bpm: 112, lead: 'triangle', vol: 0.1, notes: VAMP_NOTES, bass: [45, 41, 48, 43, 45, 41, 40, 40], drums: 'soft' },
    vamp: { bpm: 140, lead: 'square', vol: 0.045, notes: VAMP_NOTES, bass: [45, 41, 48, 43, 45, 41, 40, 40], drums: 'rock' },
    buzz: {
      bpm: 150, lead: 'sawtooth', vol: 0.032, drums: 'disco', bass: [40, 36, 43, 38, 40, 36, 43, 38],
      notes: [
        64, 67, 71, 76, 74, 71, 67, 71,
        60, 64, 67, 72, 71, 67, 64, 67,
        67, 71, 74, 79, 78, 74, 71, 74,
        66, 69, 74, 78, 76, 74, 69, 66,
        76, null, 79, 76, 83, null, 79, 76,
        76, null, 79, 76, 84, 83, 79, 76,
        74, null, 79, 83, 86, 83, 79, 74,
        78, 76, 74, 69, 66, 69, 74, null
      ]
    },
    boss: {
      bpm: 104, lead: 'square', vol: 0.05, drums: 'boss', bass: [38, 34, 31, 33, 38, 34, 31, 33],
      pad: [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64], [62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]],
      notes: [
        62, null, 65, null, 69, null, 68, null,
        70, null, 69, null, 65, null, 62, null,
        67, null, 70, null, 74, null, 73, null,
        73, null, 69, null, 64, null, 61, null,
        74, 73, 74, null, 77, 76, 74, null,
        70, 69, 70, null, 74, 72, 70, null,
        67, null, 70, 74, 73, null, 70, 67,
        69, null, null, null, 61, null, 64, null
      ]
    }
  };
  const music = { name: null, step: 0, next: 0, timer: null };
  const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function scheduleMusic() {
    if (!music.name || !actx) return;
    const tr = TRACKS[music.name];
    while (music.next < actx.currentTime + 0.15) {
      const t = music.next, i = music.step % 64, bar = Math.floor(i / 8), beat = i % 8;
      const e8 = 60 / tr.bpm / 2;
      const n = tr.notes[i];
      if (n != null) {
        tone(musicBus, mtof(n), t, e8 * 0.9, tr.lead, tr.vol);
        if (tr.lead !== 'triangle') tone(musicBus, mtof(n) * 1.006, t + 0.012, e8 * 0.8, tr.lead, tr.vol * 0.3);
      }
      const root = tr.bass[bar];
      if (tr.drums === 'boss') {
        tone(musicBus, mtof(root + (beat === 6 ? 7 : 0)), t, e8 * 0.9, 'sawtooth', 0.07);
        tone(musicBus, mtof(root), t, e8 * 0.9, 'triangle', 0.16);
      } else {
        tone(musicBus, mtof(beat % 2 ? root + 12 : root), t, e8 * 0.85, 'triangle', 0.15);
      }
      if (tr.pad && beat === 0) for (const p of tr.pad[bar]) tone(musicBus, mtof(p - 12), t, e8 * 8, 'triangle', 0.035);
      const d = tr.drums;
      if (d === 'rock') {
        if (beat === 0 || beat === 4 || beat === 5) tone(musicBus, 150, t, 0.12, 'sine', 0.35, 45);
        if (beat === 2 || beat === 6) noise(musicBus, t, 0.12, 0.13, 'highpass', 1500);
        noise(musicBus, t, 0.03, 0.04, 'highpass', 7000);
      } else if (d === 'disco') {
        if (beat % 2 === 0) tone(musicBus, 150, t, 0.12, 'sine', 0.35, 45);
        if (beat === 2 || beat === 6) noise(musicBus, t, 0.12, 0.12, 'highpass', 1500);
        if (beat % 2 === 1) noise(musicBus, t, 0.08, 0.05, 'highpass', 6000);
      } else if (d === 'boss') {
        if (beat % 2 === 0) tone(musicBus, 120, t, 0.2, 'sine', 0.42, 35);
        if (beat === 4) noise(musicBus, t, 0.25, 0.18, 'bandpass', 900, null, 0.8);
        if (beat === 7) tone(musicBus, 200, t, 0.18, 'sine', 0.2, 80);
        if (bar % 4 === 3 && beat === 6) noise(musicBus, t, 0.6, 0.06, 'highpass', 5000);
      } else {
        if (beat === 0) tone(musicBus, 130, t, 0.15, 'sine', 0.25, 45);
        if (beat % 2 === 1) noise(musicBus, t, 0.03, 0.025, 'highpass', 7000);
      }
      music.step++; music.next += e8;
    }
  }
  function playMusic(name) {
    if (!audio()) return;
    if (music.name === name) return;
    music.name = name; music.step = 0; music.next = actx.currentTime + 0.1;
    musicBus.gain.cancelScheduledValues(actx.currentTime);
    musicBus.gain.setValueAtTime(0.5, actx.currentTime);
    if (!music.timer) music.timer = setInterval(scheduleMusic, 25);
  }
  function stopMusic() {
    music.name = null;
    if (actx) {
      musicBus.gain.setTargetAtTime(0.0001, actx.currentTime, 0.05);
    }
  }

  // =========================================================
  //  ESTADO DO JOGO
  // =========================================================
  let state = 'loading';
  let paused = false;
  let time = 0, stateT = 0;
  let shake = 0, flash = 0, flashColor = '255,255,255';
  const G = { phase: 0, score: 0, lives: 3, phaseStartScore: 0 };
  let L = null;          // fase atual
  let camX = 0;
  let pShots = [], eShots = [], parts = [], popups = [];
  const DEBUG_START = (() => { const m = location.search.match(/fase=(\d)/); return m ? Math.max(0, Math.min(5, +m[1] - 1)) : 0; })();

  const P = {
    x: 80, y: 0, vx: 0, vy: 0, onGround: true, onPlat: null, facing: 1, crouch: false,
    invuln: 0, dropT: 0, shootCd: 0, coyote: 0, jumpBuf: 0, recoil: 0, landSq: 0, dead: false
  };
  function hero() { return HEROES[heroIdx]; }
  function heroH() { return hero().h; }
  function pBox() {
    const h = heroH(), sp = SPR[hero().id];
    const w = sp ? sp.width * 0.5 : 40;
    const bh = P.crouch ? h * 0.55 : h * 0.9;
    return { x: P.x - w / 2, y: P.y - bh, w, h: bh };
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // =========================================================
  //  CONSTRUÇÃO DAS FASES
  // =========================================================
  function buildLevel(idx) {
    const ph = PHASES[idx], D = DIFFS[diffIdx];
    L = { ph, idx, env: ph.env, scene: ph.scene, width: W, plats: [], enemies: [], pickups: [], portal: null, boss: null, pot: null, arena: !!ph.boss };
    if (L.arena) {
      const pw = Math.min(200, W * 0.28);
      L.plats.push({ x: W * 0.06, y: GROUND - 125, w: pw });
      L.plats.push({ x: W * 0.94 - pw, y: GROUND - 125, w: pw });
      L.plats.push({ x: W / 2 - pw * 0.45, y: GROUND - 235, w: pw * 0.9 });
      L.pickups.push({ type: 'heart', x: W / 2, y: GROUND - 275, t: 0 });
      L.boss = ph.boss === 'vamp' ? makeVamp() : makeBuzz();
      return;
    }
    L.width = 3000 + idx * 300;
    // plataformas e moedas
    let x = 520;
    while (x < L.width - 600) {
      if (Math.random() < 0.72) {
        const w = Math.round(rand(150, 250));
        const low = { x, y: GROUND - 115, w };
        L.plats.push(low);
        for (let i = 0; i < Math.floor(w / 46); i++) L.pickups.push({ type: 'coin', x: x + 25 + i * 46, y: low.y - 30, t: Math.random() * 5 });
        if (Math.random() < 0.5) {
          const w2 = Math.round(rand(130, 200));
          const hx = x + w * 0.55;
          L.plats.push({ x: hx, y: GROUND - 225, w: w2 });
          for (let i = 0; i < Math.floor(w2 / 46); i++) L.pickups.push({ type: 'coin', x: hx + 25 + i * 46, y: GROUND - 255, t: Math.random() * 5 });
          x = hx + w2;
        } else x += w;
        x += rand(200, 380);
      } else {
        for (let i = 0; i < 5; i++) L.pickups.push({ type: 'coin', x: x + i * 46, y: GROUND - 34, t: Math.random() * 5 });
        x += 420;
      }
    }
    // inimigos
    const list = [];
    for (const [type, n] of Object.entries(ph.enemies)) {
      const c = Math.max(1, Math.round(n * D.count));
      for (let i = 0; i < c; i++) list.push(type);
    }
    list.sort(() => Math.random() - 0.5);
    const span = L.width - 1200;
    list.forEach((type, i) => {
      const ex = 700 + (i + 0.5) * span / list.length + rand(-60, 60);
      L.enemies.push(makeEnemy(type, ex));
    });
    // corações
    const hearts = D.hearts + (idx >= 3 ? 1 : 0);
    const highs = L.plats.filter(p => p.y < GROUND - 150);
    for (let i = 0; i < hearts; i++) {
      const p = highs.length ? highs[Math.floor((i + 0.5) * highs.length / hearts)] : null;
      if (p) L.pickups.push({ type: 'heart', x: p.x + p.w / 2, y: p.y - 34, t: 0 });
      else L.pickups.push({ type: 'heart', x: L.width * (0.3 + 0.4 * i), y: GROUND - 34, t: 0 });
    }
    L.portal = { x: L.width - 170, open: true, t: 0 };
  }

  function makeEnemy(type, x) {
    const D = DIFFS[diffIdx];
    if (type === 'bat') {
      const y = GROUND - rand(120, 270);
      return { type, x, y, baseY: y, hp: 1, t: Math.random() * 6, spd: rand(70, 115) * D.spd, active: false, flash: 0, w: 44, h: 26, pts: 50, homing: false };
    }
    if (type === 'drone') {
      const y = GROUND - rand(180, 280);
      return { type, x, y, homeX: x, homeY: y, hp: 2, t: Math.random() * 6, cd: rand(1, 2.5), active: false, flash: 0, w: 46, h: 30, pts: 80 };
    }
    // funcionário do alto escalão
    let surf = GROUND, minX = x - 150, maxX = x + 150;
    const plat = L.plats.find(p => x >= p.x + 20 && x <= p.x + p.w - 20);
    if (plat && Math.random() < 0.45) { surf = plat.y; minX = plat.x + 14; maxX = plat.x + plat.w - 14; }
    return { type: 'worker', x, y: surf, minX, maxX, dir: -1, hp: 3, t: Math.random() * 6, cd: rand(1.2, 2.5), spd: rand(55, 80) * D.spd, active: false, flash: 0, w: 40, h: 84, pts: 100 };
  }
  function enemyBox(e) {
    if (e.type === 'worker') return { x: e.x - 16, y: e.y - 80, w: 32, h: 80 };
    return { x: e.x - e.w / 2 + 4, y: e.y - e.h / 2 + 2, w: e.w - 8, h: e.h - 4 };
  }

  // ---------- CHEFÕES ----------
  function makeVamp() {
    const hp = Math.round(24 * DIFFS[diffIdx].boss);
    return { kind: 'vamp', x: W * 0.72, y: -200, hp, maxHp: hp, state: 'enter', t: 0, st: 0, tx: W * 0.7, ty: GROUND - 280, vx: 0, vy: 0, flash: 0, facing: -1, size: 175, atk: 0 };
  }
  function makeBuzz() {
    const lim = Math.round(22 * DIFFS[diffIdx].boss);
    return { kind: 'buzz', x: W + 220, y: GROUND - 300, fat: 0, limit: lim, state: 'enter', t: 0, st: 0, vx: 0, vy: 0, flash: 0, facing: -1, size: 140, atk: 0, swoopY: 0, rot: 0 };
  }
  function bossScale(b) { return b.kind === 'buzz' ? 1 + 0.85 * (b.fat / b.limit) + (b.state === 'inflate' ? b.st * 0.5 : 0) : 1; }
  function bossBox(b) {
    const s = bossScale(b);
    if (b.kind === 'vamp') return { x: b.x - 45, y: b.y - b.size * 0.45, w: 90, h: b.size * 0.88 };
    if (b.state === 'swoop' && b.st > 0) return { x: b.x - 60, y: b.swoopY - 25, w: 120, h: 50 };
    const hh = b.size * (0.8 + (s - 1) * 0.5), ww = b.size * 0.55 * s;
    return { x: b.x - ww / 2, y: b.y - hh / 2, w: ww, h: hh };
  }

  // =========================================================
  //  FLUXO DO JOGO
  // =========================================================
  function newGame() {
    G.phase = DEBUG_START; G.score = 0; G.lives = 3;
    sfx.start();
    startPhase();
  }
  function startPhase() {
    G.phaseStartScore = G.score;
    buildLevel(G.phase);
    P.x = (isTouch && !PORTRAIT) ? 270 : 90; P.y = GROUND; P.vx = 0; P.vy = 0; P.onGround = true; P.onPlat = null; P.facing = 1;
    P.invuln = 0; P.crouch = false; P.dead = false; P.dropT = 0; P.shootCd = 0;
    camX = 0;
    pShots = []; eShots = []; parts = []; popups = [];
    setState('intro');
    playMusic(L.arena ? 'boss' : L.env);
  }
  function setState(s) { state = s; stateT = 0; }
  function phaseClear() {
    setState('clear');
    stopMusic();
    sfx.clear();
    G.score += 500 + G.lives * 100;
  }
  function nextPhase() {
    G.phase++;
    G.lives = Math.min(3, G.lives + 1);
    startPhase();
  }
  function gameOver() {
    setState('gameover');
    stopMusic();
    sfx.gameOver();
    saveBest();
  }
  function victory() {
    setState('victory');
    stopMusic();
    sfx.victory();
    G.score += G.lives * 1000;
    saveBest();
    setTimeout(() => { if (state === 'victory') playMusic('title'); }, 2200);
  }
  function saveBest() { if (G.score > best) { best = G.score; store.set('vb_best', best); } }
  function toMenu() { paused = false; setState('title'); playMusic('title'); }

  // =========================================================
  //  ENTRADA (teclado, mouse, toque)
  // =========================================================
  const keys = {};
  let jumpPressed = false, downPressed = false, mouseShoot = false;
  let isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);
  const pointers = new Map();   // pointerId -> nome do botão
  let ui = [];                  // botões de menu desenhados neste quadro
  let CTRL = {};                // botões de toque
  const PAUSE_BTN = { x: 0, y: 0, w: 46, h: 42 };

  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function ctrlAt(p) {
    let bestN = null, bd = 1e9;
    for (const [n, b] of Object.entries(CTRL)) {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < b.r * 1.25 && d < bd) { bd = d; bestN = n; }
    }
    return bestN;
  }
  function pressCtrl(n) {
    if (n === 'jump') jumpPressed = true;
    if (n === 'down') downPressed = true;
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio();
    if (e.pointerType === 'touch') isTouch = true;
    const p = toGame(e);
    if (state === 'play' && !paused) {
      if (inRect(p, PAUSE_BTN)) { paused = true; sfx.ui(); return; }
      if (isTouch && e.pointerType !== 'mouse') {
        const n = ctrlAt(p);
        if (n) { pointers.set(e.pointerId, n); pressCtrl(n); }
        return;
      }
      mouseShoot = true;
      return;
    }
    for (let i = ui.length - 1; i >= 0; i--) {
      if (inRect(p, ui[i])) { ui[i].action(); return; }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const n = ctrlAt(toGame(e));
    const old = pointers.get(e.pointerId);
    if (n && n !== old) {
      // deslizar o dedo entre esquerda/direita
      if ((old === 'left' || old === 'right') && (n === 'left' || n === 'right')) pointers.set(e.pointerId, n);
    }
  });
  const endPointer = (e) => { pointers.delete(e.pointerId); if (e.pointerType === 'mouse') mouseShoot = false; };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('touchstart', (e) => { if (e.target === canvas) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  const JUMP_KEYS = ['ArrowUp', 'KeyW', 'Space'];
  const DOWN_KEYS = ['ArrowDown', 'KeyS'];
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    audio();
    if (e.repeat) { keys[e.code] = true; return; }
    keys[e.code] = true;
    if (e.code === 'KeyM') { setMuted(!muted); return; }
    if (state === 'title') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { heroIdx = (heroIdx + 3) % 4; store.set('vb_hero', heroIdx); sfx.ui(); }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { heroIdx = (heroIdx + 1) % 4; store.set('vb_hero', heroIdx); sfx.ui(); }
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { diffIdx = (diffIdx + 2) % 3; store.set('vb_diff', diffIdx); sfx.ui(); }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { diffIdx = (diffIdx + 1) % 3; store.set('vb_diff', diffIdx); sfx.ui(); }
      if (e.code === 'Enter' || e.code === 'Space') newGame();
      return;
    }
    if (state === 'play') {
      if (e.code === 'KeyP' || e.code === 'Escape') { paused = !paused; sfx.ui(); return; }
      if (paused) { if (e.code === 'Enter') paused = false; return; }
      if (JUMP_KEYS.includes(e.code)) jumpPressed = true;
      if (DOWN_KEYS.includes(e.code)) downPressed = true;
      return;
    }
    if ((state === 'gameover') && e.code === 'Enter') { retryPhase(); }
    if ((state === 'victory') && e.code === 'Enter') { toMenu(); }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; pointers.clear(); mouseShoot = false; if (state === 'play') paused = true; });
  document.addEventListener('visibilitychange', () => {
    if (!actx) return;
    if (document.hidden) { actx.suspend(); if (state === 'play') paused = true; }
    else { actx.resume(); music.next = actx.currentTime + 0.05; }
  });

  function retryPhase() { G.score = G.phaseStartScore; G.lives = 3; sfx.start(); startPhase(); }

  function input() {
    const t = new Set(pointers.values());
    return {
      left: keys.ArrowLeft || keys.KeyA || t.has('left'),
      right: keys.ArrowRight || keys.KeyD || t.has('right'),
      jump: JUMP_KEYS.some(k => keys[k]) || t.has('jump'),
      down: DOWN_KEYS.some(k => keys[k]) || t.has('down'),
      shoot: keys.KeyX || keys.KeyJ || keys.KeyK || keys.KeyF || keys.Enter || t.has('shoot') || mouseShoot
    };
  }

  // =========================================================
  //  PARTÍCULAS E EFEITOS
  // =========================================================
  function burst(x, y, n, colors, spd = 300, size = 6, life = 0.7, g = 600) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * spd;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.2, life: life * rand(0.6, 1), max: life, size: Math.round(rand(size * 0.5, size)), color: colors[i % colors.length], g });
    }
  }
  function explosion(x, y, scale = 1, big = false) {
    burst(x, y, Math.round(30 * scale), ['#fff7a8', C.gold, '#ff8a00', C.red, C.purple, C.green], 420 * scale, 10 * scale, 0.9, 300);
    parts.push({ ring: true, x, y, r: 10, vr: 520 * scale, life: 0.4, max: 0.4, color: big ? C.green : '#ffdd55' });
    shake = Math.max(shake, big ? 0.7 : 0.25);
  }
  function popup(x, y, text, color = '#fff', size = 12) { popups.push({ x, y, text, color, size, life: 1 }); }

  // =========================================================
  //  ATUALIZAÇÃO
  // =========================================================
  const GRAV = 2000, JUMP_V = 800, RUN = 250;

  function update(dt) {
    time += dt; stateT += dt;
    if (shake > 0) shake -= dt;
    if (flash > 0) flash -= dt;
    for (const p of parts) {
      p.life -= dt;
      if (p.ring) { p.r += p.vr * dt; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
    }
    parts = parts.filter(p => p.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 45 * dt; }
    popups = popups.filter(p => p.life > 0);

    if (state === 'title' || state === 'loading') return;
    if (paused) return;

    if (state === 'intro') { if (stateT > 2.6) setState('play'); updateBoss(dt, true); return; }
    if (state === 'clear') { if (stateT > 2.8) { if (G.phase >= 5) victory(); else nextPhase(); } return; }
    if (state === 'dying') {
      P.vy += GRAV * dt * 0.6; P.y += P.vy * dt;
      if (stateT > 1.6) gameOver();
      return;
    }
    if (state === 'victory') {
      if (Math.random() < 0.3) parts.push({ x: rand(0, W), y: -10, vx: rand(-30, 30), vy: rand(60, 160), life: 4, max: 4, size: 8, color: [C.gold, C.green, C.purple, '#fff'][Math.floor(Math.random() * 4)], g: 30 });
      return;
    }
    if (state !== 'play') return;

    updatePlayer(dt);
    updateCamera();
    updateEnemies(dt);
    updateBoss(dt, false);
    updateShots(dt);
    updatePickups(dt);
  }

  function updatePlayer(dt) {
    const k = input();
    P.invuln = Math.max(0, P.invuln - dt);
    P.dropT = Math.max(0, P.dropT - dt);
    P.shootCd -= dt; P.recoil = Math.max(0, P.recoil - dt); P.landSq = Math.max(0, P.landSq - dt);
    P.coyote -= dt; P.jumpBuf -= dt;

    // descer de plataforma / abaixar
    if (downPressed) {
      if (P.onGround && P.onPlat) { P.dropT = 0.28; P.onGround = false; P.onPlat = null; P.vy = 80; sfx.drop(); }
      downPressed = false;
    }
    P.crouch = k.down && P.onGround && !P.onPlat;

    let move = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    if (P.crouch) move = 0;
    const target = move * RUN;
    P.vx += (target - P.vx) * Math.min(1, dt * 14);
    if (move) P.facing = move;

    if (jumpPressed) { P.jumpBuf = 0.12; jumpPressed = false; }
    if (P.jumpBuf > 0 && (P.onGround || P.coyote > 0)) {
      P.vy = -JUMP_V; P.onGround = false; P.onPlat = null; P.jumpBuf = 0; P.coyote = 0;
      sfx.jump();
      burst(P.x, P.y, 5, ['#6b4a8a'], 120, 5, 0.3, 300);
    }
    if (!k.jump && P.vy < -420) P.vy = -420; // soltar cedo = pulo baixo

    // tiro
    if (k.shoot && P.shootCd <= 0) shootPlayer();

    // física
    const prevY = P.y;
    P.vy = Math.min(P.vy + GRAV * dt, 1100);
    P.x += P.vx * dt;
    P.y += P.vy * dt;
    P.x = clamp(P.x, 24, L.width - 24);

    const wasGround = P.onGround;
    P.onGround = false;
    if (P.vy >= 0) {
      if (P.y >= GROUND) { P.y = GROUND; P.vy = 0; P.onGround = true; P.onPlat = null; }
      else if (P.dropT <= 0) {
        for (const pl of L.plats) {
          if (P.x > pl.x - 8 && P.x < pl.x + pl.w + 8 && prevY <= pl.y + 1 && P.y >= pl.y) {
            P.y = pl.y; P.vy = 0; P.onGround = true; P.onPlat = pl; break;
          }
        }
      }
    }
    if (P.onGround && !wasGround) { P.landSq = 0.1; sfx.land(); }
    if (wasGround && !P.onGround && P.vy >= 0) P.coyote = 0.08;
  }

  function shootPlayer() {
    const garlic = L.env === 'vamp';
    P.shootCd = 0.26; P.recoil = 0.1;
    const h = heroH();
    const y = P.y - (P.crouch ? h * 0.3 : h * 0.55);
    if (garlic) {
      pShots.push({ kind: 'garlic', x: P.x + P.facing * 22, y, vx: P.facing * 560 + P.vx * 0.3, vy: -170, g: 480, life: 1.3, rot: 0 });
      sfx.garlic();
    } else {
      pShots.push({ kind: 'coin', x: P.x + P.facing * 22, y, vx: P.facing * 640 + P.vx * 0.3, vy: 0, g: 0, life: 1.1, rot: 0 });
      sfx.coinShot();
    }
  }

  function updateCamera() {
    const target = clamp(P.x - W * (PORTRAIT ? 0.3 : 0.36), 0, Math.max(0, L.width - W));
    camX += (target - camX) * 0.18;
    if (Math.abs(target - camX) < 0.5) camX = target;
  }

  function hurtPlayer(fromX) {
    if (P.invuln > 0 || state !== 'play') return;
    G.lives--;
    sfx.hurt();
    shake = 0.35; flash = 0.18; flashColor = '255,40,60';
    burst(P.x, P.y - heroH() / 2, 16, [C.red, '#fff', C.purpleL], 260, 7, 0.6);
    if (G.lives <= 0) {
      P.dead = true; P.vy = -600;
      setState('dying'); stopMusic();
      return;
    }
    P.invuln = 1.7;
    P.vy = -420; P.onGround = false; P.onPlat = null;
    P.vx = (P.x < fromX ? -1 : 1) * 260;
    popup(P.x, P.y - heroH() - 10, '-1 VIDA', C.red, 12);
  }

  function updateEnemies(dt) {
    const pb = pBox();
    const D = DIFFS[diffIdx];
    for (const e of L.enemies) {
      if (!e.active) { if (e.x < camX + W + 90) { e.active = true; if (e.type === 'bat') sfx.batScreech(); } else continue; }
      e.t += dt; e.flash = Math.max(0, e.flash - dt);
      if (e.type === 'bat') {
        const dx = P.x - e.x;
        const dir = e.homing ? Math.sign(dx) || -1 : -1;
        e.x += dir * e.spd * dt;
        const near = Math.abs(dx) < 320;
        const ty = near ? P.y - heroH() * 0.6 : e.baseY;
        e.y += (ty - e.y) * Math.min(1, dt * (near ? 1.4 : 0.8));
        e.y += Math.sin(e.t * 6) * 60 * dt;
        if (!e.homing && e.x < camX - 160) e.gone = true;
      } else if (e.type === 'drone') {
        e.x = e.homeX + Math.sin(e.t * 0.8) * 70;
        e.y = e.homeY + Math.sin(e.t * 2.2) * 12;
        e.cd -= dt * D.fire;
        if (e.cd <= 0 && Math.abs(P.x - e.x) < W * 0.75) {
          const dx = P.x - e.x, dy = (P.y - heroH() * 0.5) - e.y, d = Math.hypot(dx, dy) || 1;
          const s = 300 * D.spd;
          eShots.push({ kind: 'laser', x: e.x, y: e.y + 8, vx: dx / d * s, vy: dy / d * s, g: 0, r: 7, life: 3 });
          sfx.laser();
          e.cd = rand(1.9, 3);
        }
      } else if (e.type === 'worker') {
        const dx = P.x - e.x;
        if (Math.abs(dx) < 260 && Math.abs(P.y - e.y) < 160) e.dir = Math.sign(dx) || e.dir;
        e.x += e.dir * e.spd * dt;
        if (e.x < e.minX) { e.x = e.minX; e.dir = 1; }
        if (e.x > e.maxX) { e.x = e.maxX; e.dir = -1; }
        e.cd -= dt * D.fire;
        if (e.cd <= 0 && Math.abs(dx) < 460 && Math.abs(dx) > 40) {
          eShots.push({ kind: 'brief', x: e.x, y: e.y - 50, vx: Math.sign(dx) * rand(200, 280) * D.spd, vy: -420, g: 950, r: 11, life: 3, rot: 0 });
          sfx.throwIt();
          e.cd = rand(2.2, 3.4);
        }
      }
      if (overlap(pb, enemyBox(e))) hurtPlayer(e.x);
    }
    L.enemies = L.enemies.filter(e => !e.dead && !e.gone);
  }

  function killEnemy(e) {
    e.dead = true;
    G.score += e.pts;
    sfx.enemyDie();
    const col = e.type === 'bat' ? [C.purple, C.purpleL, '#000'] : e.type === 'drone' ? [C.green, '#000', '#fff'] : ['#222', C.green, C.purple];
    burst(e.x, e.y - (e.type === 'worker' ? 40 : 0), 18, col, 300, 7, 0.6);
    popup(e.x, e.y - 50, '+' + e.pts, C.green);
  }

  // ---------- IA dos chefões ----------
  function updateBoss(dt, intro) {
    const b = L.boss;
    if (!b) return;
    b.t += dt; b.st += dt; b.flash = Math.max(0, b.flash - dt);
    const D = DIFFS[diffIdx];
    if (b.kind === 'vamp') updateVamp(b, dt, D, intro);
    else updateBuzz(b, dt, D, intro);
    if (!intro && b.state !== 'dying' && b.state !== 'dead' && b.state !== 'inflate' && b.state !== 'enter') {
      if (overlap(pBox(), bossBox(b))) hurtPlayer(b.x);
    }
  }
  function bossGo(b, s) { b.state = s; b.st = 0; }

  function updateVamp(b, dt, D, intro) {
    b.facing = P.x < b.x ? -1 : 1;
    if (b.state === 'enter') {
      b.y += (GROUND - 290 - b.y) * Math.min(1, dt * 2);
      if (b.st > 0.05 && !b.laughed) { b.laughed = true; sfx.laugh(); }
      if (!intro && b.st > 1) bossGo(b, 'hover');
      return;
    }
    if (b.state === 'hover') {
      if (b.st === 0 || Math.floor(b.t * 0.8) !== b.lastPick) {
        b.lastPick = Math.floor(b.t * 0.8);
        b.tx = rand(W * 0.15, W * 0.85); b.ty = GROUND - rand(220, 330);
      }
      b.x += (b.tx - b.x) * Math.min(1, dt * 1.6 * D.spd);
      b.y += (b.ty - b.y) * Math.min(1, dt * 1.6 * D.spd) + Math.sin(b.t * 3) * 20 * dt;
      if (b.st > 2.2 / D.fire) {
        b.atk = (b.atk + 1 + Math.floor(Math.random() * 2)) % 3;
        bossGo(b, ['diveWarn', 'orbs', 'bats'][b.atk]);
        if (b.state === 'diveWarn' || b.state === 'bats') sfx.scream();
      }
      return;
    }
    if (b.state === 'diveWarn') {
      if (b.st > 0.7) {
        const dx = P.x - b.x, dy = (P.y - 60) - b.y, d = Math.hypot(dx, dy) || 1;
        const s = 560 * D.spd;
        b.vx = dx / d * s; b.vy = dy / d * s;
        bossGo(b, 'dive');
      }
      return;
    }
    if (b.state === 'dive') {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (Math.random() < 0.6) parts.push({ x: b.x + rand(-30, 30), y: b.y + rand(-50, 50), vx: 0, vy: 0, life: 0.4, max: 0.4, size: 8, color: C.purpleD, g: 0 });
      if (b.y > GROUND - b.size * 0.45 || b.st > 1.1 || b.x < 40 || b.x > W - 40) {
        b.y = Math.min(b.y, GROUND - b.size * 0.45);
        b.x = clamp(b.x, 60, W - 60);
        bossGo(b, 'hover');
      }
      return;
    }
    if (b.state === 'orbs') {
      if (b.st > 0.4 && !b.fired) {
        b.fired = true;
        const n = 2 + diffIdx * 2;
        const base = Math.atan2((P.y - 50) - b.y, P.x - b.x);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.22;
          eShots.push({ kind: 'orb', x: b.x, y: b.y, vx: Math.cos(a) * 290 * D.spd, vy: Math.sin(a) * 290 * D.spd, g: 0, r: 11, life: 4 });
        }
        sfx.throwIt(); sfx.laser();
      }
      if (b.st > 1) { b.fired = false; bossGo(b, 'hover'); }
      return;
    }
    if (b.state === 'bats') {
      if (b.st > 0.5 && !b.fired) {
        b.fired = true;
        for (let i = 0; i < 2 + diffIdx; i++) {
          const bat = makeEnemy('bat', b.x + rand(-60, 60));
          bat.y = b.y + rand(-40, 40); bat.baseY = bat.y; bat.active = true; bat.homing = true; bat.pts = 30;
          L.enemies.push(bat);
        }
        burst(b.x, b.y, 20, [C.purpleD, '#000'], 200, 10, 0.6, 0);
      }
      if (b.st > 1.2) { b.fired = false; bossGo(b, 'hover'); }
      return;
    }
    if (b.state === 'dying') {
      b.x += Math.sin(b.t * 60) * 2;
      if (Math.random() < dt * 10) { explosion(b.x + rand(-70, 70), b.y + rand(-80, 80), 0.6); sfx.explosion(false); }
      if (b.st > 2.2) {
        explosion(b.x, b.y, 2.4, true); sfx.explosion(true);
        flash = 0.5; flashColor = '255,255,255';
        burst(b.x, b.y, 60, [C.purple, C.red, '#000', C.green], 600, 14, 1.4, 400);
        bossGo(b, 'dead');
        L.boss = null;
        L.enemies = [];
        L.portal = { x: W - 120, open: true, t: 0 };
        sfx.portal();
        popup(W / 2, GROUND - 320, 'VAMP DERROTADO!', C.green, 18);
      }
    }
  }

  function updateBuzz(b, dt, D, intro) {
    const s = bossScale(b);
    const slow = 1 - 0.45 * (b.fat / b.limit);
    b.facing = P.x < b.x ? -1 : 1;
    if (b.state === 'enter') {
      if (!b.jetted) { b.jetted = true; sfx.jet(); }
      b.x += (W * 0.65 - b.x) * Math.min(1, dt * 1.8);
      b.y = GROUND - 300 + Math.sin(b.t * 2) * 10;
      if (!intro && b.st > 1) bossGo(b, 'fly');
      return;
    }
    if (b.state === 'fly') {
      const tt = b.t * 0.9 * D.spd * slow;
      const tx = W / 2 + Math.sin(tt) * W * 0.3;
      const ty = GROUND - 290 + Math.sin(tt * 2) * 55;
      b.x += (tx - b.x) * Math.min(1, dt * 3);
      b.y += (ty - b.y) * Math.min(1, dt * 3);
      b.rot = Math.sin(tt) * 0.12;
      if (b.st > 2.4 / D.fire) {
        b.atk = (b.atk + 1 + Math.floor(Math.random() * 2)) % 3;
        bossGo(b, ['laser', 'swoopWarn', 'stars'][b.atk]);
        if (b.state === 'swoopWarn') sfx.charge();
      }
      return;
    }
    if (b.state === 'laser') {
      const n = 2 + diffIdx;
      const shotIdx = Math.floor(b.st / 0.28);
      if (shotIdx < n && shotIdx >= (b.shots || 0)) {
        b.shots = shotIdx + 1;
        const dx = P.x - b.x, dy = (P.y - 50) - b.y, d = Math.hypot(dx, dy) || 1;
        eShots.push({ kind: 'laser', x: b.x, y: b.y - 20, vx: dx / d * 420 * D.spd, vy: dy / d * 420 * D.spd, g: 0, r: 8, life: 3 });
        sfx.laser();
      }
      if (b.st > n * 0.28 + 0.4) { b.shots = 0; bossGo(b, 'fly'); }
      return;
    }
    if (b.state === 'swoopWarn') {
      // vai para a lateral e avisa
      const side = P.x < W / 2 ? 1 : -1;
      b.side = side;
      b.x += ((side > 0 ? W + 40 : -40) - b.x) * Math.min(1, dt * 3);
      b.swoopY = GROUND - heroH() * 1.05;
      b.y += (b.swoopY - b.y) * Math.min(1, dt * 3);
      if (b.st > 1.1) { bossGo(b, 'swoop'); sfx.jet(); }
      return;
    }
    if (b.state === 'swoop') {
      b.x -= b.side * 620 * D.spd * slow * dt;
      b.y = b.swoopY;
      b.rot = -b.side * 1.45;
      if (Math.random() < 0.8) parts.push({ x: b.x + b.side * 60, y: b.y + rand(-10, 10), vx: b.side * 120, vy: 0, life: 0.35, max: 0.35, size: 7, color: Math.random() < 0.5 ? C.green : C.purple, g: 0 });
      if ((b.side > 0 && b.x < -120) || (b.side < 0 && b.x > W + 120)) {
        b.x = b.side > 0 ? -60 : W + 60; b.y = GROUND - 300; b.rot = 0;
        bossGo(b, 'fly');
      }
      return;
    }
    if (b.state === 'stars') {
      if (!b.fired) {
        b.fired = true;
        const n = 3 + diffIdx * 2;
        for (let i = 0; i < n; i++) {
          const x = i === 0 ? P.x : rand(40, W - 40);
          eShots.push({ kind: 'star', x, y: -30, vx: 0, vy: 0, g: 0, r: 12, life: 5, warn: 0.9 + i * 0.12 });
        }
        sfx.charge();
      }
      if (b.st > 1.6) { b.fired = false; bossGo(b, 'fly'); }
      return;
    }
    if (b.state === 'inflate') {
      b.x += Math.sin(b.t * 50) * 3;
      if (Math.random() < dt * 8) sfx.inflate(0.6 + b.st * 0.4);
      if (b.st > 1.8) {
        explosion(b.x, b.y, 2.6, true); sfx.explosion(true);
        flash = 0.6; flashColor = '255,230,120';
        for (let i = 0; i < 70; i++) parts.push({ coin: true, x: b.x, y: b.y, vx: rand(-500, 500), vy: rand(-700, -100), life: 2.5, max: 2.5, size: 1, color: C.gold, g: 900, t: Math.random() * 5 });
        burst(b.x, b.y, 50, [C.green, C.purple, '#fff'], 600, 12, 1.2, 400);
        L.boss = null; L.enemies = [];
        eShots = [];
        L.pot = { x: W * 0.72, y: -120, vy: 0, landed: false, t: 0 };
        popup(W / 2, GROUND - 330, 'BUZZ EXPLODIU!', C.gold, 18);
      }
    }
    void s;
  }

  function hitBoss(b) {
    if (['dying', 'dead', 'inflate', 'enter'].indexOf(b.state) >= 0) return;
    b.flash = 0.1;
    if (b.kind === 'vamp') {
      b.hp--; G.score += 20; sfx.bossHit();
      if (b.hp <= 0) { bossGo(b, 'dying'); sfx.scream(); G.score += 3000; eShots = []; }
    } else {
      b.fat++; G.score += 20;
      sfx.inflate(b.fat / b.limit);
      popup(b.x + rand(-40, 40), b.y - 80, 'ENGORDOU!', C.gold, 10);
      if (b.fat >= b.limit) { bossGo(b, 'inflate'); G.score += 5000; eShots = []; }
    }
  }

  function updateShots(dt) {
    // tiros do herói
    for (const s of pShots) {
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += s.g * dt; s.rot += dt * 14;
      if (s.y > GROUND) { s.life = 0; burst(s.x, GROUND, 4, s.kind === 'garlic' ? ['#fff', '#e8e0c8'] : [C.gold], 120, 4, 0.3); }
      const sb = { x: s.x - 9, y: s.y - 9, w: 18, h: 18 };
      for (const e of L.enemies) {
        if (!e.active || e.dead) continue;
        if (overlap(sb, enemyBox(e))) {
          s.life = 0; e.hp--; e.flash = 0.12;
          if (e.hp <= 0) killEnemy(e); else sfx.hit();
          burst(s.x, s.y, 5, s.kind === 'garlic' ? ['#fff', '#f3e9c6'] : [C.gold, '#fff'], 150, 4, 0.3);
          break;
        }
      }
      const b = L.boss;
      if (s.life > 0 && b && ['dying', 'dead', 'inflate', 'enter'].indexOf(b.state) < 0 && overlap(sb, bossBox(b))) {
        s.life = 0; hitBoss(b);
        burst(s.x, s.y, 6, s.kind === 'garlic' ? ['#fff', C.purpleL] : [C.gold, '#fff'], 180, 5, 0.3);
      }
      if (s.x < camX - 50 || s.x > camX + W + 50) s.life = 0;
    }
    pShots = pShots.filter(s => s.life > 0);

    // tiros inimigos
    const pb = pBox();
    for (const s of eShots) {
      if (s.warn > 0) { s.warn -= dt; if (s.warn <= 0) s.vy = 520 * DIFFS[diffIdx].spd; continue; }
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += s.g * dt;
      if (s.rot !== undefined) s.rot += dt * 10;
      if (s.y > GROUND - 4) { s.life = 0; burst(s.x, GROUND - 4, 6, s.kind === 'star' ? [C.green, '#fff'] : s.kind === 'brief' ? ['#5a3a1a', '#000'] : [C.purple, C.red], 140, 5, 0.3); }
      if (overlap(pb, { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 })) { s.life = 0; hurtPlayer(s.x); }
    }
    eShots = eShots.filter(s => s.life > 0 && s.x > camX - 300 && s.x < camX + W + 300);
  }

  function updatePickups(dt) {
    const pb = pBox();
    for (const p of L.pickups) {
      p.t += dt;
      if (p.got) continue;
      if (overlap(pb, { x: p.x - 14, y: p.y - 14, w: 28, h: 28 })) {
        p.got = true;
        if (p.type === 'coin') { G.score += 10; sfx.coin(); burst(p.x, p.y, 6, [C.gold, '#fff'], 150, 4, 0.3, 0); }
        else {
          if (G.lives < 3) { G.lives++; popup(p.x, p.y - 20, '+1 VIDA', C.green); }
          else { G.score += 200; popup(p.x, p.y - 20, '+200', C.green); }
          sfx.heart(); burst(p.x, p.y, 14, [C.red, '#fff', C.purpleL], 200, 6, 0.5, 0);
        }
      }
    }
    L.pickups = L.pickups.filter(p => !p.got);

    // portal
    if (L.portal) {
      L.portal.t += dt;
      const pr = { x: L.portal.x - 30, y: GROUND - 130, w: 60, h: 130 };
      if (overlap(pb, pr)) phaseClear();
    }
    // pote de ouro
    if (L.pot) {
      const pot = L.pot;
      pot.t += dt;
      if (!pot.landed) {
        pot.vy += 1400 * dt; pot.y += pot.vy * dt;
        if (pot.y >= GROUND) { pot.y = GROUND; pot.landed = true; sfx.potLand(); shake = 0.3; burst(pot.x, GROUND, 20, [C.gold, '#fff'], 300, 6, 0.6); }
      } else if (Math.random() < dt * 8) {
        parts.push({ x: pot.x + rand(-40, 40), y: GROUND - 70 + rand(-20, 10), vx: 0, vy: -40, life: 0.6, max: 0.6, size: 4, color: Math.random() < 0.5 ? C.gold : '#fff', g: 0 });
      }
      if (pot.landed && overlap(pb, { x: pot.x - 50, y: GROUND - 90, w: 100, h: 90 })) {
        L.pot = null;
        burst(pot.x, GROUND - 50, 40, [C.gold, '#fff', C.green], 400, 8, 1.2);
        victory();
      }
    }
  }

  // =========================================================
  //  DESENHO
  // =========================================================
  // A fonte pixelada desenha maiúsculas acentuadas de forma estranha:
  // desenhamos a letra sem acento e pintamos o acento em pixels por cima.
  const ACC = { 'Á': ['A', 'a'], 'É': ['E', 'a'], 'Í': ['I', 'a'], 'Ó': ['O', 'a'], 'Ú': ['U', 'a'], 'Â': ['A', 'c'], 'Ê': ['E', 'c'], 'Ô': ['O', 'c'], 'Ã': ['A', 't'], 'Õ': ['O', 't'] };
  const ACC_RE = /[ÁÉÍÓÚÂÊÔÃÕ]/;
  function accentMark(kind, cx, top, u, color) {
    ctx.fillStyle = color;
    if (kind === 'a') { ctx.fillRect(cx, top, 2 * u, u); ctx.fillRect(cx - u, top + u, 2 * u, u); }
    else if (kind === 'c') { ctx.fillRect(cx - u / 2, top, u, u); ctx.fillRect(cx - 1.5 * u, top + u, u, u); ctx.fillRect(cx + u / 2, top + u, u, u); }
    else { ctx.fillRect(cx - 2 * u, top + u, u, u); ctx.fillRect(cx - u, top, 2 * u, u); ctx.fillRect(cx + u, top + u, u, u); ctx.fillRect(cx + 2 * u, top, u, u); }
  }
  function text(str, x, y, size, color, outline = 0, align = 'center', shadow = 0, shadowColor = '#000') {
    if (ACC_RE.test(str)) {
      const chars = [...str];
      const base = chars.map(c => ACC[c] ? ACC[c][0] : c).join('');
      plainText(base, x, y, size, color, outline, align, shadow, shadowColor);
      ctx.font = `${size}px ${FONT}`;
      const w = ctx.measureText(base).width, cw = w / chars.length;
      const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      const u = Math.max(1, Math.round(size / 8));
      const top = Math.round(y - size / 2 - u * 3);
      chars.forEach((c, i) => {
        if (!ACC[c]) return;
        const cx = Math.round(left + i * cw + cw / 2 - u / 2);
        if (shadow) accentMark(ACC[c][1], cx + shadow, top + shadow, u, shadowColor);
        if (outline) { const o = Math.max(1, Math.round(outline / 3)); for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) accentMark(ACC[c][1], cx + dx, top + dy, u, '#000'); }
        accentMark(ACC[c][1], cx, top, u, color);
      });
      return;
    }
    plainText(str, x, y, size, color, outline, align, shadow, shadowColor);
  }
  function plainText(str, x, y, size, color, outline = 0, align = 'center', shadow = 0, shadowColor = '#000') {
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'miter'; ctx.miterLimit = 2;
    if (shadow) {
      ctx.fillStyle = shadowColor; ctx.strokeStyle = shadowColor; ctx.lineWidth = outline;
      if (outline) ctx.strokeText(str, x + shadow, y + shadow);
      ctx.fillText(str, x + shadow, y + shadow);
    }
    if (outline) { ctx.strokeStyle = '#000'; ctx.lineWidth = outline; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }
  function fitSize(str, maxW, size) {
    ctx.font = `${size}px ${FONT}`;
    str = [...str].map(c => ACC[c] ? ACC[c][0] : c).join('');
    const w = ctx.measureText(str).width;
    return w > maxW ? Math.max(6, Math.floor(size * maxW / w)) : size;
  }
  function wrap(str, maxW, size) {
    ctx.font = `${size}px ${FONT}`;
    const words = str.split(' '), lines = []; let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function pixelCircle(cx, cy, r, color) {
    ctx.fillStyle = color;
    const p = 4;
    for (let y = -r; y <= r; y += p) {
      const hw = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)) / p) * p;
      ctx.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2, p);
    }
  }
  function drawHeart(cx, cy, s, color, outline = true) {
    const shape = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
    const ox = Math.round(cx - 3.5 * s), oy = Math.round(cy - 3 * s);
    if (outline) { ctx.fillStyle = '#000'; ctx.fillRect(ox - s, oy - s, 9 * s, 8 * s); }
    ctx.fillStyle = color;
    shape.forEach((row, j) => { for (let i = 0; i < 7; i++) if (row[i] === 'X') ctx.fillRect(ox + i * s, oy + j * s, s, s); });
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    if (color !== '#333') ctx.fillRect(ox + s, oy + s, s, s);
  }
  function drawCoin(x, y, t, size = 1) {
    const spin = Math.abs(Math.cos(t * 4));
    const w = Math.max(2, Math.round(9 * spin)) * 2 * size, h = 22 * size;
    const X = Math.round(x - w / 2), Y = Math.round(y - h / 2);
    ctx.fillStyle = C.goldD; ctx.fillRect(X - 2 * size, Y + 2 * size, w + 4 * size, h - 4 * size); ctx.fillRect(X, Y, w, h);
    ctx.fillStyle = C.gold; ctx.fillRect(X + 2 * size, Y + 2 * size, Math.max(2, w - 4 * size), h - 4 * size);
    if (w > 10 * size) { ctx.fillStyle = '#fff3a0'; ctx.fillRect(X + 4 * size, Y + 4 * size, 3 * size, h - 10 * size); }
  }
  function drawGarlic(x, y, rot, s = 1) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); ctx.scale(s, s);
    ctx.fillStyle = '#000'; ctx.fillRect(-10, -8, 20, 18);
    ctx.fillStyle = '#f4f0e0'; ctx.fillRect(-8, -6, 16, 14);
    ctx.fillStyle = '#d8ceb0'; ctx.fillRect(-3, -6, 2, 14); ctx.fillRect(3, -5, 2, 12);
    ctx.fillStyle = '#c9b98d'; ctx.fillRect(-8, 6, 16, 2);
    ctx.fillStyle = '#7bbf3a'; ctx.fillRect(-2, -12, 4, 6);
    ctx.restore();
  }

  // ---------- cenários ----------
  function drawSky(top, bottom) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
    for (let i = 0; i < 90; i++) {
      const x = (hash(i) * W * 3 - camX * 0.05) % W, y = hash(i + 50) * GROUND * 0.75;
      const a = 0.35 + 0.65 * Math.abs(Math.sin(time * 1.4 + i));
      ctx.fillStyle = `rgba(230,210,255,${a})`;
      ctx.fillRect(Math.round((x + W) % W), Math.round(y), i % 6 === 0 ? 3 : 2, i % 6 === 0 ? 3 : 2);
    }
  }
  function drawVampBG() {
    const castle = L && L.scene === 'castelo';
    if (castle) return drawCastleInterior();
    drawSky('#07000f', '#3a0a5c');
    const my = Math.max(120, GROUND - 360);
    pixelCircle(W * 0.78, my, 62, 'rgba(200,255,190,0.12)');
    pixelCircle(W * 0.78, my, 48, '#e9ffd8');
    pixelCircle(W * 0.78 - 14, my - 10, 10, '#c4e6b5');
    pixelCircle(W * 0.78 + 16, my + 14, 7, '#c4e6b5');
    // castelo distante
    const off = camX * 0.12;
    ctx.fillStyle = '#1a0630';
    for (let rep = -1; rep < Math.ceil(W / 900) + 1; rep++) {
      const bx = Math.round(rep * 900 - (off % 900));
      const base = GROUND - 40;
      const tw = [[60, 160, 40], [130, 230, 50], [220, 130, 120], [370, 260, 44], [450, 180, 70], [560, 140, 160], [760, 200, 46]];
      for (const [x, h, w] of tw) {
        ctx.fillRect(bx + x, base - h, w, h);
        for (let k = 0; k < w; k += 12) ctx.fillRect(bx + x + k, base - h - 8, 7, 8);
        ctx.fillStyle = 'rgba(57,255,20,0.55)';
        if (h > 150) ctx.fillRect(bx + x + w / 2 - 3, base - h + 30, 6, 10);
        ctx.fillStyle = '#1a0630';
      }
    }
    // colinas / lápides / árvores
    const off2 = camX * 0.45;
    ctx.fillStyle = '#12021f';
    for (let rep = -1; rep < Math.ceil(W / 700) + 1; rep++) {
      const bx = Math.round(rep * 700 - (off2 % 700));
      ctx.fillRect(bx, GROUND - 30, 700, 30);
      ctx.fillRect(bx + 80, GROUND - 52, 220, 22);
      ctx.fillRect(bx + 420, GROUND - 46, 180, 16);
      // árvore seca
      const tx = bx + 520;
      ctx.fillRect(tx, GROUND - 170, 14, 140);
      ctx.fillRect(tx - 40, GROUND - 150, 44, 8); ctx.fillRect(tx - 40, GROUND - 168, 8, 20);
      ctx.fillRect(tx + 14, GROUND - 130, 40, 8); ctx.fillRect(tx + 46, GROUND - 152, 8, 24);
      // lápides
      for (const lx of [40, 170, 300, 610]) {
        ctx.fillStyle = '#2a0b45';
        ctx.fillRect(bx + lx, GROUND - 58, 30, 40); ctx.fillRect(bx + lx + 4, GROUND - 64, 22, 6);
        ctx.fillStyle = '#4a1a75'; ctx.fillRect(bx + lx + 13, GROUND - 54, 4, 18); ctx.fillRect(bx + lx + 8, GROUND - 48, 14, 4);
        ctx.fillStyle = '#12021f';
      }
    }
    // névoa
    ctx.fillStyle = 'rgba(155,48,255,0.08)';
    for (let i = 0; i < 3; i++) ctx.fillRect(0, GROUND - 40 - i * 16 + Math.sin(time + i) * 4, W, 14);
  }
  function drawCastleInterior() {
    ctx.fillStyle = '#140326'; ctx.fillRect(0, 0, W, GROUND);
    // tijolos
    ctx.fillStyle = '#1f0738';
    for (let y = 0; y < GROUND; y += 28) {
      const sh = (y / 28) % 2 ? 30 : 0;
      for (let x = -60; x < W + 60; x += 60) ctx.fillRect(x + sh + 2, y + 2, 56, 24);
    }
    // janelas em arco
    const n = Math.max(2, Math.round(W / 320));
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5) * W / n, top = Math.max(60, GROUND - 400), wh = Math.min(260, GROUND - top - 120);
      ctx.fillStyle = '#000'; ctx.fillRect(cx - 54, top, 108, wh + 6);
      pixelCircle(cx, top, 54, '#000');
      ctx.fillStyle = '#2b0a50'; ctx.fillRect(cx - 46, top, 92, wh);
      pixelCircle(cx, top, 46, '#2b0a50');
      pixelCircle(cx + 10, top + 20, 18, '#e9ffd8');
      ctx.fillStyle = '#000'; ctx.fillRect(cx - 3, top - 46, 6, wh + 46); ctx.fillRect(cx - 46, top + wh * 0.45, 92, 6);
      // estandarte
      ctx.fillStyle = C.purpleD; ctx.fillRect(cx - 120, top - 10, 36, 120);
      ctx.fillStyle = C.green; ctx.fillRect(cx - 108, top + 30, 12, 12);
    }
    // tochas
    for (let i = 0; i <= n; i++) {
      const tx = i * W / n, ty = GROUND - 190;
      ctx.fillStyle = '#333'; ctx.fillRect(tx - 5, ty, 10, 30);
      const f = Math.sin(time * 20 + i) * 3;
      ctx.fillStyle = 'rgba(57,255,20,0.18)'; ctx.fillRect(tx - 30, ty - 50, 60, 60);
      ctx.fillStyle = C.green; ctx.fillRect(tx - 7, ty - 20 + f, 14, 20 - f);
      ctx.fillStyle = C.greenL; ctx.fillRect(tx - 3, ty - 12 + f, 6, 10);
    }
  }
  function drawBuzzBG() {
    drawSky('#000000', '#1d0638');
    const roof = L && L.scene === 'cobertura';
    // sol neon listrado
    const sy = Math.max(130, GROUND - (roof ? 330 : 300));
    for (let r = 70; r > 0; r -= 4) {
      const k = r / 70;
      ctx.fillStyle = `rgb(${Math.round(57 + 100 * (1 - k))},${Math.round(255 * k)},${Math.round(20 + 200 * (1 - k))})`;
    }
    pixelCircle(W * 0.25, sy, 70, '#2a0a4a');
    pixelCircle(W * 0.25, sy, 62, C.green);
    ctx.fillStyle = '#1d0638';
    for (let k = 0; k < 6; k++) ctx.fillRect(W * 0.25 - 70, sy + 10 + k * 10, 140, 3 + k);
    // grade synthwave no horizonte
    ctx.strokeStyle = 'rgba(155,48,255,0.35)'; ctx.lineWidth = 2;
    const hz = GROUND - (roof ? 120 : 170);
    for (let i = 0; i < 6; i++) { const y = hz + i * i * 5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // prédios
    const layers = roof ? [[0.08, '#0d0219', 90, 220, 'rgba(155,48,255,0.6)'], [0.2, '#07010f', 40, 120, 'rgba(57,255,20,0.7)']] :
      [[0.12, '#12042a', 120, 300, 'rgba(155,48,255,0.6)'], [0.4, '#050009', 80, 220, 'rgba(57,255,20,0.75)']];
    layers.forEach(([par, col, minH, maxH, win], li) => {
      const off = camX * par;
      const seg = 110;
      const start = Math.floor(off / seg) - 1;
      for (let i = start; i < start + Math.ceil(W / seg) + 3; i++) {
        const bw = 70 + Math.round(hash(i * 3 + li) * 40);
        const bh = minH + Math.round(hash(i * 7 + li * 11) * (maxH - minH));
        const x = Math.round(i * seg - off);
        const base = roof ? GROUND - 60 : GROUND;
        ctx.fillStyle = col; ctx.fillRect(x, base - bh, bw, bh);
        ctx.fillStyle = win;
        for (let wy = base - bh + 12; wy < base - 12; wy += 18)
          for (let wx = x + 8; wx < x + bw - 8; wx += 14)
            if (hash(wx * 0.37 + wy * 1.3 + li) < 0.35) ctx.fillRect(wx, wy, 6, 8);
        if (li === 1 && L && L.scene === 'escritorio' && hash(i + 99) < 0.4 && bw > 80) {
          ctx.fillStyle = '#000'; ctx.fillRect(x + 4, base - bh - 26, bw - 8, 22);
          ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.strokeRect(x + 4, base - bh - 26, bw - 8, 22);
          text('S.A.', x + bw / 2, base - bh - 15, 10, C.green);
        }
      }
    });
    if (roof) {
      // grade da cobertura e heliponto
      ctx.fillStyle = '#000'; ctx.fillRect(0, GROUND - 60, W, 60);
      ctx.fillStyle = C.purpleD;
      for (let x = 0; x < W; x += 24) ctx.fillRect(x, GROUND - 56, 4, 56);
      ctx.fillRect(0, GROUND - 60, W, 5);
    }
  }
  function drawGround() {
    const vamp = L.env === 'vamp';
    ctx.fillStyle = vamp ? '#1c0530' : '#05000a';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = vamp ? '#2d0b4d' : '#160428';
    const bw = 48, bh = 22, off = camX % bw;
    for (let r = 0; r * bh < H - GROUND; r++) {
      const sh = r % 2 ? bw / 2 : 0;
      for (let x = -bw; x < W + bw; x += bw) ctx.fillRect(Math.round(x - off + sh), GROUND + 8 + r * bh, bw - 4, bh - 4);
    }
    ctx.fillStyle = vamp ? C.greenD : C.green; ctx.fillRect(0, GROUND, W, 6);
    if (vamp) { ctx.fillStyle = C.green; for (let x = -((camX) % 20); x < W; x += 20) ctx.fillRect(Math.round(x), GROUND, 8, 3); }
    else { ctx.fillStyle = C.purple; ctx.fillRect(0, GROUND + 6, W, 2); }
    if (L.scene === 'cobertura') { // heliponto
      const hx = W / 2 - camX;
      ctx.fillStyle = 'rgba(57,255,20,0.25)';
      text('H', hx, GROUND + 30, 26, 'rgba(57,255,20,0.35)');
    }
  }
  function drawPlats() {
    const vamp = L.env === 'vamp';
    for (const p of L.plats) {
      const x = Math.round(p.x - camX), y = Math.round(p.y), w = Math.round(p.w);
      if (x > W || x + w < 0) continue;
      if (vamp) {
        ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 2, w + 4, 22);
        ctx.fillStyle = '#4a1a75'; ctx.fillRect(x, y, w, 18);
        ctx.fillStyle = '#2d0b4d'; for (let k = 0; k < w; k += 30) ctx.fillRect(x + k, y + 8, 26, 8);
        ctx.fillStyle = C.green; for (let k = 4; k < w - 4; k += 14) ctx.fillRect(x + k, y, 8, 4 + (k % 3));
      } else {
        ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 2, w + 4, 18);
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x, y, w, 14);
        ctx.fillStyle = C.green; ctx.fillRect(x, y, w, 3);
        ctx.fillStyle = C.purple; for (let k = 6; k < w - 6; k += 22) { ctx.fillRect(x + k, y + 6, 10, 3); }
      }
    }
  }
  function drawPortal() {
    const p = L.portal; if (!p) return;
    const x = Math.round(p.x - camX), y = GROUND;
    if (x < -100 || x > W + 100) return;
    const pulse = Math.sin(time * 5) * 4;
    ctx.fillStyle = 'rgba(57,255,20,0.15)'; ctx.fillRect(x - 60 - pulse, y - 170 - pulse, 120 + pulse * 2, 170 + pulse);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 44, y - 150, 88, 150);
    ctx.fillStyle = L.env === 'vamp' ? C.purple : C.green; ctx.fillRect(x - 38, y - 144, 76, 144);
    ctx.fillStyle = '#0b0014'; ctx.fillRect(x - 30, y - 136, 60, 136);
    for (let i = 0; i < 6; i++) {
      const yy = y - 130 + ((time * 80 + i * 22) % 130);
      ctx.fillStyle = i % 2 ? C.green : C.purpleL; ctx.fillRect(x - 24 + (i * 9) % 44, yy, 6, 6);
    }
    text('SAÍDA', x, y - 166, 10, C.green, 4);
  }
  function drawPickups() {
    for (const p of L.pickups) {
      const x = p.x - camX; if (x < -40 || x > W + 40) continue;
      const by = p.y + Math.sin(p.t * 3) * 4;
      if (p.type === 'coin') drawCoin(x, by, p.t);
      else drawHeart(x, by, 4, C.red);
    }
    if (L.pot) drawPot(L.pot);
  }
  function drawPot(pot) {
    const x = Math.round(pot.x - camX), y = Math.round(pot.y);
    // brilho
    ctx.fillStyle = `rgba(255,204,0,${0.15 + 0.1 * Math.sin(time * 4)})`;
    ctx.fillRect(x - 80, y - 150, 160, 150);
    // moedas empilhadas
    ctx.fillStyle = C.goldD; ctx.fillRect(x - 46, y - 92, 92, 20);
    ctx.fillStyle = C.gold;
    for (let i = 0; i < 8; i++) ctx.fillRect(x - 44 + i * 11, y - 100 + (i % 3) * 4, 10, 10);
    ctx.fillRect(x - 30, y - 110, 60, 12); ctx.fillRect(x - 14, y - 118, 28, 10);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 6, y - 116, 4, 4); ctx.fillRect(x + 20, y - 98, 4, 4);
    // pote
    ctx.fillStyle = '#000'; ctx.fillRect(x - 56, y - 80, 112, 14); ctx.fillRect(x - 50, y - 66, 100, 60); ctx.fillRect(x - 40, y - 6, 80, 6);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x - 52, y - 78, 104, 10); ctx.fillRect(x - 46, y - 64, 92, 56);
    ctx.fillStyle = '#444'; ctx.fillRect(x - 38, y - 58, 10, 40);
    ctx.fillStyle = C.green; ctx.fillRect(x - 46, y - 40, 92, 4);
    text('POTE DE OURO', x, y - 140, 10, C.gold, 4);
  }

  // ---------- inimigos ----------
  function drawBat(e) {
    const x = Math.round(e.x - camX), y = Math.round(e.y);
    const up = Math.sin(e.t * 18) > 0;
    const body = e.flash > 0 ? '#fff' : '#2b0a4a';
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 10, y - 10, 20, 20);
    ctx.fillStyle = body; ctx.fillRect(x - 8, y - 8, 16, 16);
    ctx.fillRect(x - 8, y - 14, 4, 6); ctx.fillRect(x + 4, y - 14, 4, 6);
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#4a1a75';
    if (up) {
      ctx.fillRect(x - 26, y - 14, 18, 8); ctx.fillRect(x - 22, y - 6, 14, 4); ctx.fillRect(x - 30, y - 18, 8, 6);
      ctx.fillRect(x + 8, y - 14, 18, 8); ctx.fillRect(x + 8, y - 6, 14, 4); ctx.fillRect(x + 22, y - 18, 8, 6);
    } else {
      ctx.fillRect(x - 26, y - 2, 18, 8); ctx.fillRect(x - 22, y + 6, 10, 4); ctx.fillRect(x - 30, y + 2, 6, 10);
      ctx.fillRect(x + 8, y - 2, 18, 8); ctx.fillRect(x + 12, y + 6, 10, 4); ctx.fillRect(x + 24, y + 2, 6, 10);
    }
    ctx.fillStyle = C.green; ctx.fillRect(x - 6, y - 4, 4, 4); ctx.fillRect(x + 2, y - 4, 4, 4);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, y + 4, 2, 3); ctx.fillRect(x + 2, y + 4, 2, 3);
  }
  function drawDrone(e) {
    const x = Math.round(e.x - camX), y = Math.round(e.y);
    const sp = Math.sin(e.t * 40) > 0;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 24, y - 12, 48, 22);
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#222'; ctx.fillRect(x - 22, y - 10, 44, 18);
    ctx.fillStyle = C.green; ctx.fillRect(x - 22, y - 10, 44, 3);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 26, y - 18, 4, 8); ctx.fillRect(x + 22, y - 18, 4, 8);
    ctx.fillStyle = '#aaa';
    ctx.fillRect(x - (sp ? 36 : 30), y - 20, sp ? 24 : 12, 3); ctx.fillRect(x + (sp ? 12 : 18), y - 20, sp ? 24 : 12, 3);
    ctx.fillStyle = C.red; ctx.fillRect(x - 5, y - 4, 10, 8);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 2, 3, 3);
    ctx.fillStyle = 'rgba(57,255,20,0.25)'; ctx.fillRect(x - 14, y + 10, 28, 4);
  }
  function drawWorker(e) {
    const x = Math.round(e.x - camX), y = Math.round(e.y);
    if (x < -60 || x > W + 60) return;
    const f = e.dir;
    const step = Math.sin(e.t * 9) > 0;
    const suit = e.flash > 0 ? '#fff' : '#1b1b24', pants = e.flash > 0 ? '#fff' : '#121218';
    ctx.save(); ctx.translate(x, y); if (f > 0) ctx.scale(-1, 1);
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-18, -2, 36, 4);
    // pernas
    ctx.fillStyle = pants;
    ctx.fillRect(-12, -30, 10, step ? 28 : 24); ctx.fillRect(2, -30, 10, step ? 24 : 28);
    ctx.fillStyle = '#000'; ctx.fillRect(-14, step ? -4 : -8, 14, 6); ctx.fillRect(0, step ? -8 : -4, 14, 6);
    // corpo / paletó
    ctx.fillStyle = '#000'; ctx.fillRect(-17, -64, 34, 36);
    ctx.fillStyle = suit; ctx.fillRect(-15, -62, 30, 33);
    ctx.fillStyle = '#eee'; ctx.fillRect(-5, -62, 10, 16);
    ctx.fillStyle = C.green; ctx.fillRect(-2, -60, 4, 18);
    ctx.fillStyle = C.purple; ctx.fillRect(-15, -62, 4, 30); ctx.fillRect(11, -62, 4, 30);
    // braço + maleta
    ctx.fillStyle = suit; ctx.fillRect(-22, -60, 7, 24);
    ctx.fillStyle = '#c98a5c'; ctx.fillRect(-22, -37, 7, 6);
    ctx.fillStyle = '#000'; ctx.fillRect(-30, -34, 20, 16);
    ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-28, -32, 16, 12);
    ctx.fillStyle = C.gold; ctx.fillRect(-22, -30, 4, 3);
    // cabeça
    ctx.fillStyle = '#000'; ctx.fillRect(-12, -84, 24, 22);
    ctx.fillStyle = '#c98a5c'; ctx.fillRect(-10, -82, 20, 18);
    ctx.fillStyle = '#000'; ctx.fillRect(-10, -76, 20, 5); // óculos escuros
    ctx.fillStyle = C.green; ctx.fillRect(-8, -75, 3, 2);
    ctx.fillStyle = '#6a3a2a'; ctx.fillRect(-4, -68, 8, 2);
    // chapéu
    ctx.fillStyle = '#000'; ctx.fillRect(-18, -86, 36, 5); ctx.fillRect(-11, -100, 22, 15);
    ctx.fillStyle = C.purple; ctx.fillRect(-11, -90, 22, 4);
    ctx.restore();
  }
  function drawEnemies() {
    for (const e of L.enemies) {
      if (!e.active) continue;
      if (e.type === 'bat') drawBat(e);
      else if (e.type === 'drone') drawDrone(e);
      else drawWorker(e);
    }
  }

  // ---------- chefões ----------
  function drawBoss() {
    const b = L.boss; if (!b) return;
    const x = b.x - camX, y = b.y;
    if (b.kind === 'vamp') {
      const spr = b.flash > 0 ? SPR.vamp_w : (b.facing > 0 ? SPR.vamp_f : SPR.vamp);
      if (!spr) return;
      const h = b.size, w = spr.width * h / spr.height;
      // aura
      const warn = b.state === 'diveWarn' || b.state === 'bats' || b.state === 'orbs';
      ctx.fillStyle = warn ? `rgba(255,42,61,${0.25 + 0.2 * Math.sin(time * 30)})` : 'rgba(155,48,255,0.18)';
      pixelCircle(x, y, h * 0.55, ctx.fillStyle);
      ctx.save(); ctx.translate(x, y);
      ctx.rotate(Math.sin(b.t * 2) * 0.04 + (b.state === 'dive' ? b.vx * 0.0006 : 0));
      if (b.state === 'diveWarn') ctx.translate(rand(-3, 3), rand(-3, 3));
      ctx.drawImage(spr, -w / 2, -h / 2, w, h);
      ctx.restore();
      if (warn) { // olhos vermelhos brilhando
        ctx.fillStyle = C.red;
        ctx.fillRect(x - 20, y - h * 0.32, 10, 6); ctx.fillRect(x + 10, y - h * 0.32, 10, 6);
      }
    } else {
      const spr = b.flash > 0 ? SPR.buzz_w : (b.facing > 0 ? SPR.buzz_f : SPR.buzz);
      if (!spr) return;
      const s = bossScale(b);
      const h = b.size * (1 + (s - 1) * 0.55), w = spr.width * b.size / spr.height * s;
      // jato
      if (b.state !== 'inflate') {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i % 2 ? C.green : '#fff';
          const fl = 10 + Math.random() * 16;
          if (b.state === 'swoop') continue;
          ctx.fillRect(x - 14 + i * 10, y + h / 2 - 6, 6, fl);
        }
      }
      if (b.state === 'swoopWarn') {
        text('ABAIXE! ▼', W / 2, GROUND - heroH() * 2.2, 16, Math.floor(time * 6) % 2 ? C.green : C.red, 6);
        ctx.fillStyle = 'rgba(255,42,61,0.25)';
        ctx.fillRect(0, b.swoopY - 25, W, 50);
      }
      ctx.save(); ctx.translate(x, y); ctx.rotate(b.rot || 0);
      if (b.state === 'inflate') ctx.translate(rand(-4, 4), rand(-4, 4));
      ctx.drawImage(spr, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  // ---------- herói ----------
  function drawHero() {
    const hh = hero();
    const spr = P.facing < 0 ? SPR[hh.id + '_f'] : SPR[hh.id];
    if (P.invuln > 0 && Math.floor(time * 14) % 2 === 0 && state === 'play') return;
    const x = Math.round(P.x - camX), y = Math.round(P.y);
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const shW = spr ? spr.width * 0.7 : 40;
    const surf = P.onPlat ? P.onPlat.y : GROUND;
    if (!P.dead) ctx.fillRect(Math.round(x - shW / 2), Math.round(P.onGround ? y : Math.min(GROUND, findSurface())), Math.round(shW), 5);
    if (!spr) { ctx.fillStyle = C.green; ctx.fillRect(x - 20, y - hh.h, 40, hh.h); return; }
    const running = P.onGround && Math.abs(P.vx) > 30;
    let sx = 1, sy = 1, rot = 0, bob = 0;
    if (running) { bob = Math.abs(Math.sin(time * 15)) * 5; rot = Math.sin(time * 15) * 0.07 + P.facing * 0.05; }
    else if (!P.onGround) { sy = P.vy < 0 ? 1.07 : 0.97; sx = P.vy < 0 ? 0.94 : 1.03; rot = P.facing * 0.1; }
    else { sy = 1 + Math.sin(time * 3) * 0.015; }
    if (P.crouch) { sy = 0.6; sx = 1.12; }
    if (P.landSq > 0) { sy *= 0.88; sx *= 1.08; }
    if (P.dead) rot = time * 8;
    const w = spr.width * sx, h = spr.height * sy;
    ctx.save();
    ctx.translate(x - (P.recoil > 0 ? P.facing * 3 : 0), y - bob);
    ctx.rotate(rot);
    ctx.drawImage(spr, -w / 2, -h, w, h);
    ctx.restore();
    void surf;
  }
  function findSurface() {
    let s = GROUND;
    for (const pl of L.plats) if (P.x > pl.x && P.x < pl.x + pl.w && pl.y >= P.y && pl.y < s) s = pl.y;
    return s;
  }

  function drawShots() {
    for (const s of pShots) {
      const x = s.x - camX;
      if (s.kind === 'garlic') drawGarlic(x, s.y, s.rot);
      else drawCoin(x, s.y, s.rot, 0.8);
    }
    for (const s of eShots) {
      const x = s.x - camX;
      if (s.warn > 0) {
        if (Math.floor(time * 10) % 2) { ctx.fillStyle = 'rgba(57,255,20,0.6)'; ctx.fillRect(x - 20, GROUND - 6, 40, 6); }
        text('!', x, GROUND - 24, 16, C.green, 4);
        continue;
      }
      if (s.kind === 'laser') {
        ctx.fillStyle = 'rgba(57,255,20,0.35)'; ctx.fillRect(x - 10, s.y - 10, 20, 20);
        ctx.fillStyle = C.green; ctx.fillRect(x - 6, s.y - 6, 12, 12);
        ctx.fillStyle = '#fff'; ctx.fillRect(x - 3, s.y - 3, 6, 6);
      } else if (s.kind === 'orb') {
        pixelCircle(x, s.y, 14, 'rgba(255,42,61,0.3)');
        pixelCircle(x, s.y, 10, C.red);
        pixelCircle(x - 2, s.y - 2, 4, '#ffb3bb');
      } else if (s.kind === 'brief') {
        ctx.save(); ctx.translate(x, s.y); ctx.rotate(s.rot);
        ctx.fillStyle = '#000'; ctx.fillRect(-12, -9, 24, 18);
        ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-10, -7, 20, 14);
        ctx.fillStyle = C.gold; ctx.fillRect(-2, -7, 4, 3);
        ctx.restore();
      } else if (s.kind === 'star') {
        ctx.fillStyle = 'rgba(57,255,20,0.3)'; ctx.fillRect(x - 3, s.y - 60, 6, 50);
        ctx.fillStyle = C.green;
        ctx.fillRect(x - 4, s.y - 14, 8, 28); ctx.fillRect(x - 14, s.y - 4, 28, 8);
        ctx.fillStyle = '#fff'; ctx.fillRect(x - 3, s.y - 3, 6, 6);
      }
    }
  }
  function drawParts() {
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      if (p.ring) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(p.x - camX, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
      } else if (p.coin) {
        p.t += 0.016; drawCoin(p.x - camX, p.y, p.t, 0.7);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - (state === 'victory' ? 0 : camX)), Math.round(p.y), p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      text(p.text, p.x - (L && !L.arena ? camX : 0), p.y, p.size, p.color, 4);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- HUD ----------
  function drawHUD() {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(8, 8, 210, 66);
    ctx.fillStyle = C.purple; ctx.fillRect(8, 8, 210, 3); ctx.fillRect(8, 71, 210, 3);
    for (let i = 0; i < 3; i++) drawHeart(30 + i * 34, 30, 4, i < G.lives ? C.red : '#333');
    if (L.env === 'vamp') drawGarlic(190, 30, 0, 1.1); else drawCoin(190, 30, time, 0.9);
    text('FASE ' + (G.phase + 1) + '/6', 18, 58, 10, C.green, 0, 'left');
    const pw = 52;
    PAUSE_BTN.x = W - pw - 8; PAUSE_BTN.y = 8;
    text(String(G.score).padStart(6, '0'), W - pw - 22, 24, 14, '#fff', 5, 'right');
    text('PONTOS', W - pw - 22, 46, 8, C.purpleL, 4, 'right');
    // pausa
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h);
    ctx.strokeStyle = C.green; ctx.lineWidth = 3; ctx.strokeRect(PAUSE_BTN.x + 1.5, PAUSE_BTN.y + 1.5, PAUSE_BTN.w - 3, PAUSE_BTN.h - 3);
    ctx.fillStyle = '#fff'; ctx.fillRect(PAUSE_BTN.x + 15, PAUSE_BTN.y + 11, 6, 20); ctx.fillRect(PAUSE_BTN.x + 26, PAUSE_BTN.y + 11, 6, 20);

    // barra do chefão
    const b = L.boss;
    if (b && b.state !== 'dead') {
      const bw = Math.min(440, W - 60), bx = (W - bw) / 2, by = PORTRAIT ? 96 : 86;
      const vamp = b.kind === 'vamp';
      const k = clamp(vamp ? b.hp / b.maxHp : b.fat / b.limit, 0, 1);
      text(vamp ? 'VAMP' : 'BUZZ  -  GORDURA', W / 2, by - 12, 10, vamp ? C.purpleL : C.green, 4);
      ctx.fillStyle = '#000'; ctx.fillRect(bx - 4, by - 2, bw + 8, 22);
      ctx.fillStyle = '#2a0a3a'; ctx.fillRect(bx, by + 2, bw, 14);
      ctx.fillStyle = vamp ? C.purple : C.gold; ctx.fillRect(bx, by + 2, Math.round(bw * k), 14);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx, by + 2, Math.round(bw * k), 4);
    }
  }

  // ---------- controles de toque ----------
  function layoutControls() {
    if (PORTRAIT) {
      const cy = GROUND + (H - GROUND) / 2;
      const r = 50;
      CTRL = {
        left: { x: 66, y: cy - 30, r, icon: 'left' },
        right: { x: 184, y: cy - 30, r, icon: 'right' },
        down: { x: 125, y: cy + 62, r: 44, icon: 'down' },
        jump: { x: W - 70, y: cy - 30, r: 56, icon: 'jump' },
        shoot: { x: W - 182, y: cy + 40, r: 50, icon: 'shoot' }
      };
    } else {
      const r = 46;
      CTRL = {
        left: { x: 64, y: H - 74, r, icon: 'left' },
        right: { x: 176, y: H - 74, r, icon: 'right' },
        down: { x: 120, y: H - 168, r: 40, icon: 'down' },
        jump: { x: W - 72, y: H - 92, r: 54, icon: 'jump' },
        shoot: { x: W - 190, y: H - 66, r: 46, icon: 'shoot' }
      };
    }
  }
  function drawControls() {
    if (!isTouch || state !== 'play' || paused) return;
    const act = new Set(pointers.values());
    for (const [n, b] of Object.entries(CTRL)) {
      const on = act.has(n);
      ctx.globalAlpha = on ? 0.9 : 0.55;
      pixelCircle(b.x, b.y, b.r, '#000');
      pixelCircle(b.x, b.y, b.r - 4, on ? (n === 'shoot' ? C.purple : C.greenD) : 'rgba(40,10,70,0.9)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      const s = Math.round(b.r * 0.35);
      if (b.icon === 'left' || b.icon === 'right') {
        const d = b.icon === 'left' ? -1 : 1;
        for (let i = 0; i < s; i += 4) ctx.fillRect(Math.round(b.x - d * s / 2 + d * i), Math.round(b.y - (s - i)), 4, (s - i) * 2);
      } else if (b.icon === 'jump' || b.icon === 'down') {
        const d = b.icon === 'jump' ? -1 : 1;
        for (let i = 0; i < s; i += 4) ctx.fillRect(Math.round(b.x - (s - i)), Math.round(b.y - d * s / 2 + d * i), (s - i) * 2, 4);
        text(b.icon === 'jump' ? 'PULAR' : 'DESCER', b.x, b.y + b.r * 0.6, 7, '#fff');
      } else {
        if (L.env === 'vamp') drawGarlic(b.x, b.y - 4, 0, 1.6); else drawCoin(b.x, b.y - 4, time, 1.2);
        text('ATIRAR', b.x, b.y + b.r * 0.62, 7, '#fff');
      }
    }
  }

  // ---------- botões de menu ----------
  function button(x, y, w, h, label, action, opts = {}) {
    const col = opts.color || C.green;
    const sel = opts.selected;
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = sel ? col : C.purpleX; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    const size = fitSize(label, w - 20, opts.size || 14);
    text(label, x + w / 2, y + h / 2 + 1, size, sel ? '#000' : '#fff');
    ui.push({ x, y, w, h, action });
  }

  // ---------- TELA INICIAL ----------
  const titleBats = Array.from({ length: 7 }, (_, i) => ({ x: Math.random() * 1400, y: 40 + Math.random() * 300, s: 40 + Math.random() * 60, t: Math.random() * 6 }));
  function drawTitle() {
    // fundo metade vamp / metade buzz
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2a0548'); g.addColorStop(0.5, '#0b0014'); g.addColorStop(1, '#063300');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(230,210,255,${0.3 + 0.6 * Math.abs(Math.sin(time + i))})`;
      ctx.fillRect(Math.round(hash(i) * W), Math.round(hash(i + 9) * H), 2, 2);
    }
    ctx.strokeStyle = 'rgba(57,255,20,0.18)'; ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) { const y = H - 10 - i * i * 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    camX = 0;
    for (const b of titleBats) {
      b.t += 0.016; b.x -= b.s * 0.016; if (b.x < -40) { b.x = W + 40; b.y = 40 + Math.random() * H * 0.6; }
      drawBat({ x: b.x + camX * 0, y: b.y + Math.sin(b.t * 3) * 10, t: b.t, flash: 0 });
    }
    camX = 0;

    // layout
    const portrait = H > W;
    const logo = IMG.logo;
    let logoW = portrait ? W * 0.94 : Math.min(W * 0.5, 480);
    let logoH = logo ? logoW * logo.height / logo.width : 120;
    if (!portrait && logoH > H * 0.33) { logoH = H * 0.33; logoW = logoH * logo.width / logo.height; }
    const top = portrait ? Math.max(20, H * 0.04) : 8;
    const bob = Math.sin(time * 2) * 4;
    if (logo) ctx.drawImage(logo, W / 2 - logoW / 2, top + bob, logoW, logoH);
    else text('VAMPBUZZ', W / 2, top + 60, 40, C.green, 8);

    let y = top + logoH + (portrait ? 30 : 14);
    text('ESCOLHA SEU HERÓI', W / 2, y, portrait ? 13 : 11, C.green, 4);
    y += portrait ? 22 : 14;
    const gap = 10;
    const cw = Math.min(portrait ? 140 : 132, (W - 30 - gap * 3) / 4);
    const ch = portrait ? Math.min(220, cw * 1.75) : Math.min(150, H * 0.28);
    const cx0 = W / 2 - (cw * 4 + gap * 3) / 2;
    HEROES.forEach((hh, i) => {
      const x = cx0 + i * (cw + gap), sel = i === heroIdx;
      const lift = sel ? Math.round(Math.abs(Math.sin(time * 4)) * -6) : 0;
      ctx.fillStyle = sel ? 'rgba(57,255,20,0.25)' : 'rgba(0,0,0,0)';
      ctx.fillRect(x - 6, y - 6 + lift, cw + 12, ch + 12);
      ctx.fillStyle = '#000'; ctx.fillRect(x, y + lift, cw, ch);
      ctx.fillStyle = sel ? '#1a3a0a' : C.purpleX; ctx.fillRect(x + 4, y + 4 + lift, cw - 8, ch - 8);
      ctx.strokeStyle = sel ? C.green : C.purple; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5 + lift, cw - 3, ch - 3);
      const spr = SPR[hh.id + '_card'];
      if (spr) {
        const maxH = (ch - 34) * (hh.id === 'analu' ? 0.82 : 1);
        let sh = maxH, sw = spr.width * sh / spr.height;
        if (sw > cw - 14) { sw = cw - 14; sh = spr.height * sw / spr.width; }
        ctx.drawImage(spr, x + cw / 2 - sw / 2, y + ch - 28 - sh + lift, sw, sh);
      }
      text(hh.name, x + cw / 2, y + ch - 14 + lift, fitSize(hh.name, cw - 10, 10), sel ? C.green : '#fff');
      ui.push({ x, y, w: cw, h: ch, action: () => { heroIdx = i; store.set('vb_hero', i); sfx.select(); } });
    });
    y += ch + (portrait ? 40 : 22);
    text('DIFICULDADE', W / 2, y, portrait ? 13 : 11, C.purpleL, 4);
    y += portrait ? 20 : 12;
    const dw = Math.min(150, (W - 40 - 20) / 3), dh = portrait ? 50 : 38;
    const dx0 = W / 2 - (dw * 3 + 20) / 2;
    DIFFS.forEach((d, i) => {
      button(dx0 + i * (dw + 10), y, dw, dh, d.name, () => { diffIdx = i; store.set('vb_diff', i); sfx.select(); },
        { selected: i === diffIdx, color: i === 0 ? C.green : i === 1 ? C.purple : C.red, size: portrait ? 13 : 11 });
    });
    y += dh + (portrait ? 30 : 16);
    const sw = Math.min(340, W - 60), sh = portrait ? 74 : 54;
    const pulse = Math.sin(time * 5) > 0;
    button(W / 2 - sw / 2, y, sw, sh, '▶ INICIAR', () => newGame(), { selected: pulse, color: C.green, size: portrait ? 22 : 18 });
    y += sh + 18;
    if (!isTouch) {
      text('← → MOVER   ↑ PULAR   ↓ DESCER   X ATIRAR   P PAUSA', W / 2, Math.min(H - 14, y + 4), fitSize('← → MOVER   ↑ PULAR   ↓ DESCER   X ATIRAR   P PAUSA', W - 40, 9), '#ccc');
    } else if (portrait) {
      text('VIRE O CELULAR PARA JOGAR DEITADO', W / 2, Math.min(H - 20, y + 20), fitSize('VIRE O CELULAR PARA JOGAR DEITADO', W - 40, 9), '#aaa');
    }
    text('RECORDE: ' + best, 12, H - 14, 9, C.gold, 4, 'left');
    // som
    const mb = { x: W - 56, y: H - 50, w: 46, h: 42 };
    ctx.fillStyle = '#000'; ctx.fillRect(mb.x, mb.y, mb.w, mb.h);
    ctx.strokeStyle = C.purple; ctx.lineWidth = 3; ctx.strokeRect(mb.x + 1.5, mb.y + 1.5, mb.w - 3, mb.h - 3);
    drawSpeaker(mb.x + 10, mb.y + 13);
    ui.push({ ...mb, action: () => { setMuted(!muted); if (!muted) sfx.ui(); } });
  }
  function drawSpeaker(x, y) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y + 4, 6, 8); ctx.fillRect(x + 6, y + 2, 4, 12); ctx.fillRect(x + 10, y, 4, 16);
    if (muted) {
      ctx.fillStyle = C.red;
      for (let i = 0; i < 5; i++) { ctx.fillRect(x + 17 + i * 3, y + 1 + i * 3, 3, 3); ctx.fillRect(x + 29 - i * 3, y + 1 + i * 3, 3, 3); }
    } else { ctx.fillRect(x + 18, y + 4, 3, 8); ctx.fillRect(x + 24, y + 1, 3, 14); }
  }

  // ---------- sobreposições ----------
  function panel(w, h) {
    const x = (W - w) / 2, y = (H - h) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.purple; ctx.lineWidth = 6; ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);
    return { x, y };
  }
  function drawIntro() {
    const k = Math.min(1, stateT * 3), out = stateT > 2.2 ? (stateT - 2.2) / 0.4 : 0;
    ctx.globalAlpha = Math.max(0, 1 - out);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, H / 2 - 110, W, 220);
    ctx.fillStyle = C.purple; ctx.fillRect(0, H / 2 - 110, W, 5); ctx.fillRect(0, H / 2 + 105, W, 5);
    const x = W / 2 + (1 - k) * -W;
    text('FASE ' + (G.phase + 1), x, H / 2 - 60, 36, C.green, 8, 'center', 6, C.greenD);
    const nm = PHASES[G.phase].name;
    const lines = wrap(nm, W - 60, 16);
    lines.forEach((l, i) => text(l, W / 2 - (1 - k) * -W, H / 2 + i * 26, 16, '#fff', 6));
    if (L.boss && Math.floor(time * 4) % 2) text('!! CHEFÃO: ' + (L.boss.kind === 'vamp' ? 'VAMP' : 'BUZZ') + ' !!', W / 2, H / 2 + 66, fitSize('!! CHEFÃO: VAMP !!', W - 40, 16), C.red, 6);
    else if (!L.boss) text(L.env === 'vamp' ? 'ARMA: ALHO' : 'ARMA: MOEDAS DE OURO', W / 2, H / 2 + 66, 11, C.gold, 4);
    ctx.globalAlpha = 1;
  }
  function drawClear() {
    const p = panel(Math.min(560, W - 30), 220);
    text('FASE ' + (G.phase + 1), W / 2, p.y + 50, 22, C.green, 6);
    text('CONCLUÍDA!', W / 2, p.y + 90, 22, '#fff', 6);
    text('BÔNUS +' + (500 + G.lives * 100), W / 2, p.y + 140, 14, C.gold, 4);
    text('PONTOS: ' + G.score, W / 2, p.y + 176, 12, C.purpleL, 4);
  }
  function drawGameOverScreen() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
    const pw = Math.min(560, W - 30), p = panel(pw, 330);
    text('FIM DE JOGO', W / 2, p.y + 54, fitSize('FIM DE JOGO', pw - 40, 30), C.red, 8, 'center', 5, C.redD);
    text('PONTOS: ' + G.score, W / 2, p.y + 110, 16, '#fff', 4);
    text('RECORDE: ' + best, W / 2, p.y + 144, 11, C.gold, 4);
    text('FASE ' + (G.phase + 1) + ' - ' + hero().name, W / 2, p.y + 172, fitSize('FASE 6 - JOHANNE', pw - 40, 11), C.purpleL, 4);
    const bw = Math.min(220, (pw - 60) / 2);
    button(W / 2 - bw - 8, p.y + 220, bw, 60, 'TENTAR DE NOVO', () => retryPhase(), { selected: true, size: 11 });
    button(W / 2 + 8, p.y + 220, bw, 60, 'MENU', () => toMenu(), { color: C.purple, size: 12 });
  }
  function drawVictory() {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
    const pw = Math.min(640, W - 24), ph = 380, p = panel(pw, ph);
    const t1 = 'VOCÊ ZEROU!';
    text(t1, W / 2, p.y + 56 + Math.sin(time * 5) * 3, fitSize(t1, pw - 40, 34), C.gold, 8, 'center', 5, C.goldD);
    const lines = wrap('OS MONSTROS DO ALTO ESCALÃO FORAM DERROTADOS!', pw - 60, 11);
    lines.forEach((l, i) => text(l, W / 2, p.y + 112 + i * 22, 11, C.green, 4));
    const ly = p.y + 112 + lines.length * 22 + 20;
    text('HERÓI: ' + hero().name + '  -  ' + DIFFS[diffIdx].name, W / 2, ly, fitSize('HERÓI: JOHANNE  -  DIFÍCIL', pw - 40, 11), C.purpleL, 4);
    text('PONTOS: ' + G.score, W / 2, ly + 36, 18, '#fff', 5);
    text(G.score >= best ? 'NOVO RECORDE!' : 'RECORDE: ' + best, W / 2, ly + 70, 12, C.gold, 4);
    const bw = Math.min(240, (pw - 60) / 2);
    button(W / 2 - bw - 8, p.y + ph - 80, bw, 58, 'JOGAR DE NOVO', () => { G.score = 0; newGame(); }, { selected: true, size: 11 });
    button(W / 2 + 8, p.y + ph - 80, bw, 58, 'MENU', () => toMenu(), { color: C.purple, size: 12 });
  }
  function drawPause() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
    const pw = Math.min(460, W - 30), p = panel(pw, 330);
    text('PAUSA', W / 2, p.y + 50, 26, C.green, 6);
    const bw = pw - 80;
    button(W / 2 - bw / 2, p.y + 90, bw, 54, '▶ CONTINUAR', () => { paused = false; sfx.ui(); }, { selected: true, size: 14 });
    button(W / 2 - bw / 2, p.y + 160, bw, 54, muted ? 'SOM: DESLIGADO' : 'SOM: LIGADO', () => { setMuted(!muted); sfx.ui(); }, { color: C.purple, size: 12 });
    button(W / 2 - bw / 2, p.y + 230, bw, 54, 'SAIR PARA O MENU', () => toMenu(), { color: C.red, size: 12 });
  }

  // ---------- render principal ----------
  function render() {
    ctx.setTransform(SF, 0, 0, SF, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ui = [];
    if (state === 'loading') {
      ctx.fillStyle = '#0b0014'; ctx.fillRect(0, 0, W, H);
      text('CARREGANDO...', W / 2, H / 2, 16, C.green);
      return;
    }
    if (state === 'title') { drawTitle(); drawParts(); return; }

    ctx.save();
    if (shake > 0) ctx.translate(Math.round(rand(-7, 7)), Math.round(rand(-7, 7)));
    if (L.env === 'vamp') drawVampBG(); else drawBuzzBG();
    drawGround();
    drawPlats();
    drawPortal();
    drawPickups();
    drawEnemies();
    drawBoss();
    if (state !== 'victory') drawHero();
    drawShots();
    drawParts();
    ctx.restore();

    if (flash > 0) { ctx.fillStyle = `rgba(${flashColor},${Math.min(0.8, flash * 2)})`; ctx.fillRect(0, 0, W, H); }
    drawHUD();
    drawControls();
    if (state === 'intro') drawIntro();
    if (state === 'clear') drawClear();
    if (state === 'gameover') drawGameOverScreen();
    if (state === 'victory') drawVictory();
    if (paused && state === 'play') drawPause();
  }

  // ---------- tela responsiva ----------
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const aspect = vw / vh;
    const oldW = W, oldG = GROUND;
    if (aspect >= 1.15) {
      H = 540; W = Math.round(H * Math.min(aspect, 2.4)); PORTRAIT = false;
      GROUND = H - 64;
    } else {
      W = 520; H = Math.round(W / Math.max(aspect, 1 / 2.4)); PORTRAIT = true;
      if (H < 560) H = 560;
      GROUND = H - Math.min(250, Math.max(90, Math.round(H * 0.22)));
    }
    const s = Math.min(vw / W, vh / H);
    const cssW = Math.floor(W * s), cssH = Math.floor(H * s);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let bw = Math.round(cssW * dpr);
    if (bw > 2400) bw = 2400;
    canvas.width = bw; canvas.height = Math.round(bw * H / W);
    SF = canvas.width / W;
    layoutControls();
    // ajusta a fase atual ao novo tamanho
    if (L) {
      if (L.arena) {
        const k = W / oldW;
        for (const p of L.plats) { p.x *= k; }
        L.width = W;
        L.plats[0].y = GROUND - 125; L.plats[1].y = GROUND - 125; L.plats[2].y = GROUND - 235;
        if (L.boss) { L.boss.x *= k; }
        if (L.portal) L.portal.x = W - 120;
        if (L.pot) L.pot.x = W * 0.72;
      }
      const dG = GROUND - oldG;
      if (dG) {
        for (const p of L.plats) if (!L.arena) p.y += dG;
        for (const e of L.enemies) { e.y += dG; if (e.baseY !== undefined) e.baseY += dG; if (e.homeY !== undefined) e.homeY += dG; }
        for (const p of L.pickups) p.y += dG;
        for (const sh of pShots) sh.y += dG;
        for (const sh of eShots) sh.y += dG;
        if (L.boss) { L.boss.y += dG; if (L.boss.ty) L.boss.ty += dG; }
        if (L.pot && L.pot.landed) L.pot.y = GROUND;
        P.y += dG;
      }
      P.y = Math.min(P.y, GROUND);
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  // ---------- loop ----------
  let last = performance.now();
  function loop(t) {
    let dt = (t - last) / 1000; last = t;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const fontReady = (document.fonts && document.fonts.load)
    ? Promise.race([document.fonts.load('16px "Press Start 2P"'), new Promise(r => setTimeout(r, 2500))])
    : Promise.resolve();
  Promise.all([loadImages(), fontReady]).then(() => {
    buildSprites();
    setState('title');
    // a música do menu começa no primeiro toque (regra dos navegadores)
    const kick = () => { if (state === 'title') playMusic('title'); window.removeEventListener('pointerdown', kick); window.removeEventListener('keydown', kick); };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
  });

  // ganchos para teste automatizado
  window.__vb = { get state() { return state; }, G, P, start: () => newGame(), get L() { return L; }, setState, hitBoss: () => L && L.boss && hitBoss(L.boss) };
})();
