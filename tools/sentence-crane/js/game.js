/* Sentence Crane: 1 to 4 players, split screen, one gamepad each.
   Each player has a pit of word blocks: one sentence plus one distractor.
   Move the crane, X drops the claw and grabs, X again lifts the word into the
   next slot of the sentence. A wrong word bounces back and jams the claw.
   Every player gets a different sentence for the same grammar function.

   Panels are drawn in logical units: LH tall, p.LW wide (set at round start
   from the panel's aspect ratio), then scaled to the screen. */
(() => {
  'use strict';

  const FONT = '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif';
  const PAL = {
    cream: '#f6efe2', sand: '#ebe1cc', pit: '#efe6d3', ink: '#2b2620', dim: '#6e6357',
    sage: '#5f7d50', sageT: '#dfe8d2', ocean: '#2f6f8f', clay: '#b0522c', clayT: '#f3dfd3',
    gold: '#d9a441', white: '#fffdf8', seam: '#2b2620',
  };
  // Okabe-Ito, colorblind safe, plus a shape per player (same as Key Party).
  const PLAYERS = [
    { color: '#e69f00', dark: '#9a6a00', shape: 'circle', glyph: '●' },
    { color: '#56b4e9', dark: '#2b6f94', shape: 'square', glyph: '■' },
    { color: '#009e73', dark: '#00634a', shape: 'triangle', glyph: '▲' },
    { color: '#cc79a7', dark: '#86486d', shape: 'diamond', glyph: '◆' },
  ];

  const LH = 480, MIN_LW = 720, MAX_LW = 1300;
  const HEAD_H = 50, BAR_Y = 58, RAIL_Y = 178, CLAW_UP = 222, FLOOR = 466, BLOCK_H = 46;
  const BLOCK_FONT = '700 24px ' + FONT;
  const LENGTHS = [45, 60, 90, 120];
  const COUNT_STEP = 800; // ms per countdown number
  const JAM_MS = 900;     // claw jam after a wrong word
  const DONE_MS = 1400;   // the finished-sentence card

  const params = new URLSearchParams(location.search);

  /* ---------------- sentence data ---------------- */

  const tokens = s => s.trim().split(/\s+/);
  const FUNCS = window.SENTENCE_CRANE_DATA.map(f => ({
    id: f.id, label: f.label, tip: f.tip,
    items: f.items.map(it => {
      const fw = new Set();
      const words = tokens(it.s).map((t, i) => {
        const m = t.match(/^\[(.+)\]$/);
        if (m) { fw.add(i); return m[1]; }
        return t;
      });
      return { words, fw, orders: [words].concat((it.alts || []).map(tokens)), d: it.d, why: it.why };
    }),
  }));
  FUNCS.forEach(f => f.items.forEach(it => { it.func = f; }));

  function selfCheck() {
    const errs = [];
    const key = a => a.slice().sort().join('|');
    FUNCS.forEach(f => f.items.forEach(it => {
      const s = it.words.join(' ');
      it.orders.forEach(o => { if (key(o) !== key(it.words)) errs.push('alt order uses different words: ' + o.join(' ')); });
      if (it.words.indexOf(it.d) >= 0) errs.push('distractor is also in the sentence: ' + s);
      if (it.words.length < 4 || it.words.length > 11) errs.push('sentence length out of range: ' + s);
      if (!it.why) errs.push('missing why: ' + s);
    }));
    return errs;
  }

  /* ---------------- helpers ---------------- */

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => 1 - Math.pow(1 - t, 3);

  function rr(x, y, w, h, r, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  }

  function shape(kind, x, y, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (kind === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
    else if (kind === 'square') ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
    else if (kind === 'triangle') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); }
    else { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
    ctx.fill();
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ---------------- sound ---------------- */

  const Sfx = (() => {
    let ac = null;
    function get() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      return ac;
    }
    function tone(freq, dur, type, vol, slideTo, delay) {
      const a = get();
      if (!a || a.state !== 'running') return;
      const t = a.currentTime + (delay || 0);
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t); o.stop(t + dur + 0.03);
    }
    const S = {
      join: () => tone(600, 0.09, 'triangle', 0.1, 900),
      grab: () => tone(300, 0.08, 'triangle', 0.1, 480),
      lift: () => tone(500, 0.12, 'sine', 0.08, 760),
      right: () => { tone(784, 0.12, 'sine', 0.12); tone(1175, 0.16, 'sine', 0.08, null, 0.05); },
      wrong: () => tone(170, 0.24, 'sawtooth', 0.06, 110),
      done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.11, null, i * 0.07)),
      tick: () => tone(660, 0.08, 'square', 0.05),
      go: () => tone(990, 0.28, 'square', 0.06),
      end: () => [784, 659, 523, 392].forEach((f, i) => tone(f, 0.24, 'triangle', 0.1, null, i * 0.1)),
    };
    ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, get));
    return {
      play: n => { try { S[n](); } catch (e) { /* no sound is fine */ } },
      wake: get,
      on: () => !!(ac && ac.state === 'running'),
    };
  })();

  /* ---------------- canvas ---------------- */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (players.length) fitPanels(true);
  }
  window.addEventListener('resize', resize);

  /* ---------------- state ---------------- */

  let state = 'join';        // join | count | play | timeup | results
  let stateAt = 0;
  let roundEnd = 0;
  let lastTick = 0;
  const settings = {
    mode: params.get('mode') || 'mixed',
    seconds: LENGTHS.indexOf(+params.get('seconds')) >= 0 ? +params.get('seconds') : 60,
  };
  const joined = [null, null, null, null]; // { slot, src, label, bot }
  let players = [];
  let infoRect = null;
  let row = 0;

  const MODES = [{ id: 'mixed', label: 'Mixed', tip: 'A new function for every sentence. Everyone gets the same function at the same time.' }]
    .concat(FUNCS.map(f => ({ id: f.id, label: f.label, tip: f.tip })));
  if (!MODES.some(m => m.id === settings.mode)) settings.mode = 'mixed';

  /* ---------------- dealing ---------------- */
  // Wave i holds one sentence per player, all from the same function and of
  // similar length, all different. Player k always gets waves[i][k] as their
  // i-th sentence, so players at the same point face comparable sentences.

  let usedBy = {}, mixQueue = [], waves = [], lastWave = [];
  function resetDeck() { usedBy = {}; mixQueue = []; waves = []; lastWave = []; }
  function makeWave(n) {
    let f;
    if (settings.mode === 'mixed') {
      if (!mixQueue.length) mixQueue = shuffle(FUNCS.slice());
      f = mixQueue.pop();
    } else f = FUNCS.find(x => x.id === settings.mode);
    const used = usedBy[f.id] || (usedBy[f.id] = new Set());
    let pool = f.items.filter(it => !used.has(it));
    if (pool.length < n) { used.clear(); pool = f.items.filter(it => lastWave.indexOf(it) < 0); }
    shuffle(pool);
    const L = pool[0].words.length;
    const rest = pool.slice(1).sort((a, b) => Math.abs(a.words.length - L) - Math.abs(b.words.length - L));
    const picks = [pool[0]].concat(rest.slice(0, n - 1));
    picks.forEach(it => used.add(it));
    lastWave = picks;
    return shuffle(picks);
  }
  function itemFor(p) {
    const i = p.waveIdx++;
    while (waves.length <= i) waves.push(makeWave(players.length));
    return waves[i][p.idx];
  }

  /* ---------------- players and layout ---------------- */

  function newPlayer(j, idx) {
    return {
      idx, slot: j.slot, src: j.src, label: j.label,
      bot: j.bot ? { err: 0.12, target: null, wait: 0, x: 0, press: {} } : null,
      score: 0, misses: 0, log: [], item: null, blocks: [], placed: [], slotMiss: 0, waveIdx: 0,
      claw: { x: 200, y: CLAW_UP, st: 'idle', held: null },
      jamUntil: 0, flying: null, toast: null, done: null, skipArm: 0,
      LW: MIN_LW, view: null,
    };
  }

  function panelRects(n) {
    const g = 4;
    if (n === 1) return [{ x: 0, y: 0, w: W, h: H }];
    if (n === 2) { const h = (H - g) / 2; return [{ x: 0, y: 0, w: W, h }, { x: 0, y: h + g, w: W, h }]; }
    const w = (W - g) / 2, h = (H - g) / 2;
    return [{ x: 0, y: 0, w, h }, { x: w + g, y: 0, w, h }, { x: 0, y: h + g, w, h }, { x: w + g, y: h + g, w, h }];
  }

  function fitPanels(keepWidth) {
    const rects = panelRects(players.length);
    players.forEach((p, k) => {
      const r = rects[k];
      if (!keepWidth) {
        const s0 = Math.min(r.h / LH, r.w / MIN_LW);
        p.LW = clamp(r.w / s0, MIN_LW, MAX_LW);
      }
      const s = Math.min(r.h / LH, r.w / p.LW);
      p.view = { r, s, ox: r.x + (r.w - p.LW * s) / 2, oy: r.y + (r.h - LH * s) / 2 };
    });
    infoRect = players.length === 3 ? rects[3] : null;
  }

  /* ---------------- sentence logic ---------------- */

  // Orders (main plus alts) that agree with what is already placed.
  function liveOrders(p) {
    return p.item.orders.filter(o => p.placed.every((w, i) => o[i] === w));
  }
  function nextWords(p) {
    const n = p.placed.length;
    return liveOrders(p).map(o => o[n]).filter(Boolean);
  }

  function nextSentence(p) {
    p.item = itemFor(p);
    p.placed = [];
    p.slotMiss = 0;
    p.skipArm = 0;
    spawnBlocks(p);
  }

  function spawnBlocks(p) {
    ctx.font = BLOCK_FONT;
    const list = shuffle(p.item.words.map(w => ({ word: w, isD: false })).concat([{ word: p.item.d, isD: true }]));
    const blocks = list.map(o => ({
      word: o.word, isD: o.isD, w: Math.ceil(ctx.measureText(o.word).width) + 30, h: BLOCK_H,
      x: 0, y: 0, vy: 0, st: 'spawn', delay: 0, flash: 0,
    }));
    const L = 24, span = p.LW - 48;
    const total = blocks.reduce((a, b) => a + b.w, 0);
    let k = Math.max(1, Math.ceil(total * 1.3 / span));
    let layers;
    for (;;) {
      layers = Array.from({ length: k }, () => []);
      blocks.forEach((b, i) => layers[i % k].push(b));
      if (layers.every(l => l.reduce((a, b) => a + b.w, 0) + 12 * l.length < span)) break;
      k++;
    }
    layers.forEach((layer, li) => {
      const free = span - layer.reduce((a, b) => a + b.w, 0);
      const weights = layer.concat([null]).map(() => 0.4 + Math.random());
      const sum = weights.reduce((a, b) => a + b, 0);
      let x = L;
      layer.forEach((b, i) => {
        x += free * weights[i] / sum;
        b.x = x; x += b.w;
        b.y = CLAW_UP + 4;
        b.delay = li * 0.3 + i * 0.035;
      });
    });
    p.blocks = blocks;
  }

  function settle(p, dt) {
    const pit = p.blocks.filter(b => b.st === 'pit');
    pit.sort((a, b) => b.y - a.y); // lowest first
    pit.forEach(b => {
      let support = FLOOR;
      pit.forEach(o => {
        if (o !== b && o.y >= b.y + b.h - 0.5 && o.x < b.x + b.w - 2 && o.x + o.w > b.x + 2) support = Math.min(support, o.y);
      });
      const target = support - b.h;
      if (b.y < target) {
        b.vy += 2600 * dt;
        b.y = Math.min(target, b.y + b.vy * dt);
        if (b.y === target) b.vy = 0;
      } else { b.y = target; b.vy = 0; }
    });
  }

  function blockUnder(p, x) {
    let best = null;
    p.blocks.forEach(b => {
      if (b.st === 'pit' && x >= b.x + 4 && x <= b.x + b.w - 4 && (!best || b.y < best.y)) best = b;
    });
    return best;
  }

  function toast(p, text, color, ms) {
    p.toast = { text, color: color || PAL.ink, until: performance.now() + (ms || 1800) };
  }

  function dropBack(p, b, x) {
    b.st = 'pit';
    b.vy = 0;
    b.x = clamp(x - b.w / 2, 24, p.LW - 24 - b.w);
    b.y = CLAW_UP - 10;
  }

  function deliver(p) {
    const b = p.claw.held;
    if (!b || p.flying) return;
    const slots = barLayout(p).slots;
    const t = slots[p.placed.length];
    p.claw.held = null;
    b.st = 'fly'; b.fx = b.x; b.fy = b.y; b.ft = 0;
    b.tx = t.x + t.w / 2 - b.w / 2; b.ty = t.y + t.h / 2 - b.h / 2;
    p.flying = b;
    Sfx.play('lift');
  }

  function land(p, b, now) {
    p.flying = null;
    const ok = nextWords(p).indexOf(b.word) >= 0;
    if (ok) {
      p.placed.push(b.word);
      p.blocks.splice(p.blocks.indexOf(b), 1);
      p.slotMiss = 0;
      p.toast = null;
      if (liveOrders(p).some(o => o.length === p.placed.length)) finishSentence(p, now);
      else Sfx.play('right');
      return;
    }
    p.misses++;
    p.slotMiss++;
    let msg;
    if (b.isD) msg = p.item.why;
    else if (liveOrders(p).some(o => o.indexOf(b.word, p.placed.length) >= 0)) msg = 'That word comes later in the sentence.';
    else msg = 'That word does not come next.';
    if (p.slotMiss >= 3) msg += ' The glowing word comes next.';
    toast(p, msg, PAL.clay, 2600);
    b.flash = 0.7;
    dropBack(p, b, 60 + Math.random() * (p.LW - 120));
    p.jamUntil = now + JAM_MS;
    Sfx.play('wrong');
    if (!p.bot) Input.rumble(p.src, 160, 0.5);
  }

  function finishSentence(p, now) {
    p.score++;
    p.log.push({ item: p.item, placed: p.placed.slice(), result: 'done' });
    p.done = { until: now + DONE_MS, words: p.placed.slice(), item: p.item };
    p.blocks.forEach(b => { if (b.st === 'held' || b.st === 'fly') b.st = 'pit'; });
    p.claw.held = null;
    p.toast = null;
    Sfx.play('done');
  }

  function skipSentence(p) {
    p.log.push({ item: p.item, placed: p.placed.slice(), result: 'skipped' });
    p.claw.held = null;
    p.flying = null;
    p.toast = null;
    nextSentence(p);
  }

  /* ---------------- bots (?bots=N, for demos and testing) ---------------- */

  function botThink(p, dt, now) {
    const bot = p.bot;
    bot.press = {};
    bot.x = 0;
    if (p.done || now < p.jamUntil) return;
    if (bot.wait > 0) { bot.wait -= dt; return; }
    const c = p.claw;
    if (c.held) {
      if (c.st === 'idle' && !p.flying) { bot.press.cross = true; bot.wait = 0.2 + Math.random() * 0.4; }
      return;
    }
    if (c.st !== 'idle' || p.flying) return;
    if (!bot.target || bot.target.st !== 'pit') {
      const nw = nextWords(p);
      const pit = p.blocks.filter(b => b.st === 'pit');
      const good = pit.filter(b => nw.indexOf(b.word) >= 0);
      const pool = Math.random() < bot.err || !good.length ? pit : good;
      bot.target = pool[Math.floor(Math.random() * pool.length)] || null;
      if (!bot.target) return;
    }
    const dx = bot.target.x + bot.target.w / 2 - c.x;
    if (Math.abs(dx) < 6) { bot.press.cross = true; bot.target = null; bot.wait = 0.1; }
    else bot.x = clamp(dx / 60, -1, 1);
  }

  /* ---------------- per-player update ---------------- */

  function updatePlayer(p, dt, now) {
    let src;
    if (p.bot) { botThink(p, dt, now); src = p.bot; }
    else src = Input.get(p.src) || { x: 0, press: {} };

    if (p.done) {
      if (now >= p.done.until) { p.done = null; nextSentence(p); }
      return;
    }

    p.blocks.forEach(b => {
      if (b.st === 'spawn') { b.delay -= dt; if (b.delay <= 0) b.st = 'pit'; }
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
    });
    settle(p, dt);

    if (p.flying) {
      const b = p.flying;
      b.ft = Math.min(1, b.ft + dt / 0.24);
      const e = ease(b.ft);
      b.x = b.fx + (b.tx - b.fx) * e;
      b.y = b.fy + (b.ty - b.fy) * e;
      if (b.ft >= 1) land(p, b, now);
      if (p.done) return;
    }

    const c = p.claw;
    const jammed = now < p.jamUntil;
    const press = src.press || {};

    if (press.triangle && !jammed) {
      if (now < p.skipArm) { skipSentence(p); return; }
      p.skipArm = now + 2000;
      toast(p, 'Press △ again to skip this sentence.', PAL.ocean, 2000);
    }

    if (c.st === 'idle' && !jammed) {
      const speed = Math.max(600, p.LW * 0.55);
      c.x = clamp(c.x + (src.x || 0) * speed * dt, 30, p.LW - 30);
    }

    if (press.circle && c.held && !jammed) {
      const b = c.held;
      c.held = null;
      dropBack(p, b, c.x);
      b.y = c.y;
    }

    if (press.cross && !jammed) {
      if (c.held) deliver(p);
      else if (c.st === 'idle') c.st = 'down';
    }

    if (c.st === 'down') {
      const b = blockUnder(p, c.x);
      const stop = b ? b.y : FLOOR;
      c.y += 1300 * dt;
      if (c.y >= stop) {
        c.y = stop;
        if (b) { c.held = b; b.st = 'held'; Sfx.play('grab'); }
        c.st = 'up';
      }
    } else if (c.st === 'up') {
      c.y -= 1100 * dt;
      if (c.y <= CLAW_UP) { c.y = CLAW_UP; c.st = 'idle'; }
    }
    if (c.held) { c.held.x = c.x - c.held.w / 2; c.held.y = c.y - 4; }
    if (p.toast && now > p.toast.until) p.toast = null;
  }

  /* ---------------- sentence bar layout ---------------- */

  function barLayout(p) {
    const total = p.item.words.length;
    for (const size of [24, 21, 18]) {
      ctx.font = '600 ' + size + 'px ' + FONT;
      const h = size + 18, gap = 8, lineH = h + 8, maxX = p.LW - 22;
      const slots = [];
      let x = 22, y = BAR_Y;
      for (let i = 0; i < total; i++) {
        const word = p.placed[i];
        const w = word ? Math.ceil(ctx.measureText(word).width) + 20 : Math.round(size * 2.4);
        if (x + w > maxX && x > 22) { x = 22; y += lineH; }
        slots.push({ x, y, w, h, word });
        x += w + gap;
      }
      if (y + h <= RAIL_Y - 12 || size === 18) return { size, slots };
    }
  }

  /* ---------------- drawing ---------------- */

  function drawBlock(b, pc, glow, now) {
    const fill = b.flash > 0 ? PAL.clayT : PAL.white;
    rr(b.x, b.y, b.w, b.h, 10, fill, b.flash > 0 ? PAL.clay : pc.color, 3);
    if (glow) {
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 260);
      rr(b.x - 4, b.y - 4, b.w + 8, b.h + 8, 13, null, PAL.gold, 4);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = PAL.ink;
    ctx.font = BLOCK_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.word, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }

  function drawHighlighted(words, item, x, y, size, maxW) {
    // One line of a finished sentence, function words in gold with an underline.
    ctx.font = '600 ' + size + 'px ' + FONT;
    const sp = ctx.measureText(' ').width;
    const widths = words.map(w => ctx.measureText(w).width);
    const lines = [[]];
    let lw = 0;
    words.forEach((w, i) => {
      if (lw + widths[i] > maxW && lines[lines.length - 1].length) { lines.push([]); lw = 0; }
      lines[lines.length - 1].push(i);
      lw += widths[i] + sp;
    });
    const fwText = new Set(item.words.filter((w, i) => item.fw.has(i)));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.forEach((ln, li) => {
      const total = ln.reduce((a, i) => a + widths[i] + sp, -sp);
      let cx = x - total / 2;
      const cy = y + li * (size + 12);
      ln.forEach(i => {
        const isFw = words[i] === item.words[i] ? item.fw.has(i) : fwText.has(words[i]);
        ctx.fillStyle = isFw ? '#a8761b' : PAL.ink;
        ctx.fillText(words[i], cx, cy);
        if (isFw) { ctx.fillStyle = PAL.gold; ctx.fillRect(cx, cy + size * 0.55, widths[i], 3); }
        cx += widths[i] + sp;
      });
    });
    return lines.length;
  }

  function drawPanel(p, now) {
    const v = p.view, LW = p.LW, pc = PLAYERS[p.slot];
    ctx.save();
    ctx.beginPath(); ctx.rect(v.r.x, v.r.y, v.r.w, v.r.h); ctx.clip();
    ctx.fillStyle = PAL.sand; ctx.fillRect(v.r.x, v.r.y, v.r.w, v.r.h);
    ctx.translate(v.ox, v.oy); ctx.scale(v.s, v.s);

    ctx.fillStyle = PAL.cream; ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = pc.color; ctx.fillRect(0, 0, LW, 6);

    // header: player, score, function
    shape(pc.shape, 30, 30, 13, pc.color);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = PAL.ink; ctx.font = '800 22px ' + FONT;
    ctx.fillText('P' + (p.slot + 1), 50, 31);
    ctx.font = '800 30px ' + FONT;
    ctx.fillText(String(p.score), 92, 31);
    if (p.item) {
      ctx.textAlign = 'right';
      ctx.font = '800 20px ' + FONT;
      ctx.fillStyle = PAL.ocean;
      ctx.fillText(p.item.func.label.toUpperCase(), LW - (players.length === 1 ? 150 : 20), 22);
      ctx.font = '500 15px ' + FONT;
      ctx.fillStyle = PAL.dim;
      ctx.fillText(p.item.func.tip, LW - (players.length === 1 ? 150 : 20), 42);
    }

    if (p.item && state !== 'count') {
      // sentence bar
      const bar = barLayout(p);
      ctx.font = '600 ' + bar.size + 'px ' + FONT;
      bar.slots.forEach((s, i) => {
        if (s.word) {
          rr(s.x, s.y, s.w, s.h, 9, PAL.sageT, PAL.sage, 2);
          ctx.fillStyle = PAL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(s.word, s.x + s.w / 2, s.y + s.h / 2 + 1);
        } else {
          const next = i === p.placed.length;
          ctx.setLineDash([6, 5]);
          if (next) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 300);
          rr(s.x, s.y, s.w, s.h, 9, next ? PAL.white : null, next ? pc.dark : '#c9bda5', next ? 3 : 2);
          ctx.globalAlpha = 1;
          ctx.setLineDash([]);
        }
      });
    }

    // pit and rail
    ctx.fillStyle = PAL.pit; ctx.fillRect(10, RAIL_Y + 8, LW - 20, FLOOR - RAIL_Y - 8);
    ctx.fillStyle = PAL.sand; ctx.fillRect(0, FLOOR, LW, LH - FLOOR);
    ctx.fillStyle = PAL.ink; ctx.fillRect(10, FLOOR, LW - 20, 3);
    rr(10, RAIL_Y - 4, LW - 20, 8, 4, PAL.ink);

    const glowSet = p.slotMiss >= 3 && p.item ? nextWords(p) : [];
    p.blocks.forEach(b => {
      if (b.st === 'pit' || b.st === 'held') drawBlock(b, pc, glowSet.indexOf(b.word) >= 0, now);
    });

    // crane
    const c = p.claw;
    const jammed = now < p.jamUntil;
    const sx = jammed ? Math.sin(now / 16) * 3 : 0;
    const cx = c.x + sx;
    rr(cx - 26, RAIL_Y - 13, 52, 24, 7, jammed ? PAL.clay : pc.dark);
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, RAIL_Y + 11); ctx.lineTo(cx, c.y - 14); ctx.stroke();
    rr(cx - 20, c.y - 18, 40, 10, 4, jammed ? PAL.clay : PAL.ink);
    const open = c.held ? 0 : 7;
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 16, c.y - 9); ctx.lineTo(cx - 18 - open, c.y + 4);
    ctx.moveTo(cx + 16, c.y - 9); ctx.lineTo(cx + 18 + open, c.y + 4);
    ctx.stroke();
    if (c.held) drawBlock(c.held, pc, false, now);
    if (jammed) {
      ctx.fillStyle = PAL.clay; ctx.font = '800 16px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText('JAMMED', cx, RAIL_Y - 24);
    }

    if (p.flying) drawBlock(p.flying, pc, false, now);

    // toast
    if (p.toast) {
      ctx.font = '700 21px ' + FONT;
      const maxW = LW - 80, lines = [''];
      p.toast.text.split(' ').forEach(w => {
        const t = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = t;
      });
      const tw = Math.max.apply(null, lines.map(l => ctx.measureText(l).width)) + 40;
      const th = 18 + lines.length * 26, ty = CLAW_UP + 14;
      rr(LW / 2 - tw / 2, ty, tw, th, 18, 'rgba(255,253,248,0.95)', p.toast.color, 2);
      ctx.fillStyle = p.toast.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach((l, i) => ctx.fillText(l, LW / 2, ty + 22 + i * 26));
    }

    // finished-sentence card
    if (p.done) {
      const k = clamp(1 - (p.done.until - now) / DONE_MS, 0, 1);
      ctx.fillStyle = 'rgba(246,239,226,' + Math.min(0.92, k * 6) + ')';
      ctx.fillRect(0, HEAD_H, LW, LH - HEAD_H);
      ctx.fillStyle = PAL.sage; ctx.font = '800 40px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+1', LW / 2, 150);
      drawHighlighted(p.done.words, p.done.item, LW / 2, 240, 30, LW - 80);
    }

    ctx.restore();
  }

  function fmtTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function drawTimer(now) {
    const left = state === 'play' ? roundEnd - now : (state === 'count' ? settings.seconds * 1000 : 0);
    const txt = fmtTime(left);
    const low = state === 'play' && left < 10000;
    if (infoRect) {
      const r = infoRect;
      ctx.fillStyle = PAL.cream; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = low ? PAL.clay : PAL.ink; ctx.font = '800 ' + Math.round(r.h * 0.28) + 'px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, r.x + r.w / 2, r.y + r.h * 0.3);
      players.forEach((p, k) => {
        const y = r.y + r.h * 0.58 + k * r.h * 0.13;
        shape(PLAYERS[p.slot].shape, r.x + r.w / 2 - 70, y, 12, PLAYERS[p.slot].color);
        ctx.fillStyle = PAL.ink; ctx.font = '700 ' + Math.round(r.h * 0.08) + 'px ' + FONT; ctx.textAlign = 'left';
        ctx.fillText('P' + (p.slot + 1) + '   ' + p.score, r.x + r.w / 2 - 48, y + 1);
      });
      return;
    }
    let x, y, size;
    if (players.length === 1) { x = W - 80; y = 34; size = 30; }
    else if (players.length === 2) { x = W - 90; y = H / 2; size = 30; }
    else { x = W / 2; y = H / 2; size = 34; }
    ctx.font = '800 ' + size + 'px ' + FONT;
    const w = ctx.measureText(txt).width + 34, h = size + 20;
    rr(x - w / 2, y - h / 2, w, h, h / 2, low ? PAL.clay : PAL.ink);
    ctx.fillStyle = PAL.cream; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + 1);
  }

  function drawOverlayText(text, sub) {
    ctx.fillStyle = 'rgba(43,38,32,0.45)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = PAL.cream; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 ' + Math.round(Math.min(W, H) * 0.22) + 'px ' + FONT;
    ctx.fillText(text, W / 2, H / 2);
    if (sub) {
      ctx.font = '600 ' + Math.round(Math.min(W, H) * 0.04) + 'px ' + FONT;
      ctx.fillText(sub, W / 2, H / 2 + Math.min(W, H) * 0.16);
    }
  }

  function draw(now) {
    ctx.fillStyle = PAL.seam; ctx.fillRect(0, 0, W, H);
    if (state === 'join' || state === 'results') return;
    players.forEach(p => drawPanel(p, now));
    drawTimer(now);
    if (state === 'count') {
      const n = 3 - Math.floor((now - stateAt) / COUNT_STEP);
      const label = MODES.find(m => m.id === settings.mode).label;
      drawOverlayText(n > 0 ? String(n) : 'GO', settings.mode === 'mixed' ? 'Mixed functions' : label);
    }
    if (state === 'timeup') drawOverlayText('TIME');
  }

  /* ---------------- join screen ---------------- */

  const $ = id => document.getElementById(id);

  function renderJoin() {
    $('slots').innerHTML = joined.map((j, i) => {
      const pc = PLAYERS[i];
      return '<div class="slot' + (j ? ' in' : '') + '" style="--pc:' + pc.color + '">' +
        '<div class="glyph">' + pc.glyph + '</div><div class="pn">P' + (i + 1) + '</div>' +
        '<div class="who">' + (j ? esc(j.bot ? 'Bot' : j.label) : 'Press ✕ to join') + '</div></div>';
    }).join('');
    $('modes').innerHTML = MODES.map(m =>
      '<button class="chip' + (m.id === settings.mode ? ' on' : '') + '" data-mode="' + m.id + '">' + esc(m.label) + '</button>').join('');
    $('lengths').innerHTML = LENGTHS.map(s =>
      '<button class="chip' + (s === settings.seconds ? ' on' : '') + '" data-sec="' + s + '">' + s + ' sec</button>').join('');
    document.querySelectorAll('.row').forEach(el => el.classList.toggle('focus', +el.dataset.row === row));
    $('modeTip').textContent = MODES.find(m => m.id === settings.mode).tip;
    const n = joined.filter(Boolean).length;
    $('startBtn').disabled = !n;
    $('startBtn').textContent = n ? 'Start (Options or Enter)' : 'Join first: press ✕ on a controller';
    $('soundHint').style.visibility = Sfx.on() ? 'hidden' : 'visible';
  }

  $('modes').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (b) { settings.mode = b.dataset.mode; row = 0; renderJoin(); }
  });
  $('lengths').addEventListener('click', e => {
    const b = e.target.closest('[data-sec]');
    if (b) { settings.seconds = +b.dataset.sec; row = 1; renderJoin(); }
  });
  $('startBtn').addEventListener('click', () => startRound());
  $('againBtn').addEventListener('click', () => startRound());
  $('setupBtn').addEventListener('click', () => toJoin());
  document.addEventListener('click', () => { if (state === 'join') setTimeout(renderJoin, 50); });

  function changeSetting(dir) {
    if (row === 0) {
      const i = MODES.findIndex(m => m.id === settings.mode);
      settings.mode = MODES[(i + dir + MODES.length) % MODES.length].id;
    } else {
      const i = LENGTHS.indexOf(settings.seconds);
      settings.seconds = LENGTHS[(i + dir + LENGTHS.length) % LENGTHS.length];
    }
    renderJoin();
  }

  function updateJoin() {
    Input.all().forEach(src => {
      const j = joined.findIndex(x => x && x.src === src.id);
      if (src.press.cross && j < 0) {
        const free = joined.findIndex(x => !x);
        if (free >= 0) { joined[free] = { slot: free, src: src.id, label: src.label }; Sfx.wake(); Sfx.play('join'); renderJoin(); }
      } else if (src.press.circle && j >= 0) { joined[j] = null; renderJoin(); }
      if (src.dir.up || src.dir.down) { row = 1 - row; renderJoin(); }
      if (src.dir.left) changeSetting(-1);
      if (src.dir.right) changeSetting(1);
      if (src.press.options && state === 'join') startRound();
    });
  }

  function toJoin() {
    state = 'join';
    players = [];
    $('results').classList.add('hidden');
    $('join').classList.remove('hidden');
    renderJoin();
    syncDataset();
  }

  function startRound() {
    if (!joined.some(Boolean)) return;
    resetDeck();
    players = joined.filter(Boolean).map((j, k) => newPlayer(j, k));
    fitPanels(false);
    players.forEach(p => { p.claw.x = p.LW / 2; });
    $('join').classList.add('hidden');
    $('results').classList.add('hidden');
    state = 'count';
    stateAt = performance.now();
    lastTick = -1;
    Sfx.wake();
    syncDataset();
  }

  /* ---------------- results ---------------- */

  function sentenceHtml(entry) {
    const it = entry.item;
    const words = entry.result === 'done' ? entry.placed : it.words;
    const fwText = new Set(it.words.filter((w, i) => it.fw.has(i)));
    return words.map((w, i) => {
      const isFw = w === it.words[i] ? it.fw.has(i) : fwText.has(w);
      return isFw ? '<mark>' + esc(w) + '</mark>' : esc(w);
    }).join(' ');
  }

  function showResults() {
    state = 'results';
    stateAt = performance.now();
    const ranked = players.slice().sort((a, b) => b.score - a.score || a.misses - b.misses);
    let place = 0, prev = null;
    $('podium').innerHTML = ranked.map((p, k) => {
      const key = p.score + '/' + p.misses;
      if (key !== prev) { place = k + 1; prev = key; }
      const pc = PLAYERS[p.slot];
      return '<div class="pod" style="--pc:' + pc.color + '"><div class="place">' + place + '</div>' +
        '<div class="glyph">' + pc.glyph + '</div><div class="pn">P' + (p.slot + 1) + '</div>' +
        '<div class="big">' + p.score + '</div><div class="small">' + (p.score === 1 ? 'sentence' : 'sentences') +
        ' · ' + p.misses + (p.misses === 1 ? ' miss' : ' misses') + '</div></div>';
    }).join('');
    $('review').innerHTML = players.map(p => {
      const pc = PLAYERS[p.slot];
      const rows = p.log.map(e => {
        const tag = e.result === 'done' ? '' : '<span class="tag">' + (e.result === 'skipped' ? 'skipped' : 'time ran out') + '</span>';
        return '<li class="' + e.result + '"><div class="fn">' + esc(e.item.func.label) + tag + '</div>' +
          '<div class="sent">' + sentenceHtml(e) + '</div>' +
          '<div class="extra">The extra word was <s>' + esc(e.item.d) + '</s>. ' + esc(e.item.why) + '</div></li>';
      }).join('') || '<li class="none">No sentences this round.</li>';
      return '<section style="--pc:' + pc.color + '"><h3><span class="glyph">' + pc.glyph + '</span> P' + (p.slot + 1) + '</h3><ol>' + rows + '</ol></section>';
    }).join('');
    $('results').classList.remove('hidden');
    $('results').scrollTop = 0;
    syncDataset();
  }

  function updateResults(now) {
    if (now - stateAt < 2500) return;
    Input.all().forEach(src => {
      const isPlayer = players.some(p => p.src === src.id) || src.kind === 'keys';
      if (!isPlayer) return;
      if (src.press.options) startRound();
      else if (src.press.circle) toJoin();
    });
  }
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (state === 'results' || state === 'play' || state === 'count')) toJoin();
  });

  /* ---------------- main loop ---------------- */

  function syncDataset() {
    document.body.dataset.state = state;
    document.body.dataset.scores = players.map(p => p.score).join(',');
  }

  let last = performance.now();
  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    Input.poll();
    if (state === 'join') updateJoin();
    else if (state === 'count') {
      const step = Math.floor((now - stateAt) / COUNT_STEP);
      if (step !== lastTick) { if (step < 3) Sfx.play('tick'); lastTick = step; }
      if (step >= 3) {
        state = 'play';
        roundEnd = now + settings.seconds * 1000;
        players.forEach(nextSentence);
        Sfx.play('go');
        syncDataset();
      }
    } else if (state === 'play') {
      players.forEach(p => updatePlayer(p, dt, now));
      if (now >= roundEnd) {
        players.forEach(p => {
          if (!p.done && p.item) p.log.push({ item: p.item, placed: p.placed.slice(), result: 'unfinished' });
        });
        state = 'timeup';
        stateAt = now;
        Sfx.play('end');
      }
      syncDataset();
    } else if (state === 'timeup') {
      if (now - stateAt > 1400) showResults();
    } else if (state === 'results') updateResults(now);
    draw(now);
    requestAnimationFrame(frame);
  }

  /* ---------------- boot ---------------- */

  resize();
  const errs = selfCheck();
  if (errs.length) {
    $('join').innerHTML = '<div class="card"><h1>Sentence bank error</h1><pre>' + esc(errs.join('\n')) + '</pre></div>';
    return;
  }
  const bots = clamp(+params.get('bots') || 0, 0, 4);
  for (let i = 0; i < bots; i++) joined[i] = { slot: i, src: 'bot' + i, label: 'Bot', bot: true };
  renderJoin();
  syncDataset();
  if (params.get('auto') && bots) startRound();
  requestAnimationFrame(frame);

  // For scripted checks in a headless browser.
  window.SentenceCrane = { players: () => players, state: () => state, funcs: FUNCS };
})();
