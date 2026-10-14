/* Sentence Crane: input (copied from Key Party, keep the two in step). Gamepads (standard mapping, PS4) plus two keyboard sets.
   Every source exposes the same shape each frame:
     { id, kind, connected, x, y, hold:{cross,square,triangle,circle,options},
       press:{...same keys, true only on the frame the button went down},
       dir:{up,down,left,right} (edge, with repeat, for menus) }
   Gamepad buttons (standard mapping): 0 cross, 1 circle, 2 square, 3 triangle,
   9 options, 12 up, 13 down, 14 left, 15 right. Axes 0/1 = left stick. */
const Input = (() => {
  'use strict';
  const DEADZONE = 0.25;
  const BUTTONS = { cross: 0, circle: 1, square: 2, triangle: 3, options: 9 };
  const KEY_SETS = [
    { id: 'k0', label: 'Keys WASD', up: 'w', down: 's', left: 'a', right: 'd', cross: 'f', square: 'g', triangle: 'h', circle: 'r', options: 'Enter' },
    { id: 'k1', label: 'Keys Arrows', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', cross: ',', square: '.', triangle: '/', circle: "'", options: 'Enter' },
  ];
  const held = new Set();
  const sources = {}; // id -> state
  let anyInputAt = 0;
  const listeners = [];

  function normKey(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = normKey(e);
    held.add(k);
    anyInputAt = performance.now();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', '/', ','].indexOf(k) >= 0 || k.length === 1) e.preventDefault();
  }, { passive: false });
  window.addEventListener('keyup', e => { held.delete(normKey(e)); });
  window.addEventListener('blur', () => held.clear());

  window.addEventListener('gamepadconnected', e => {
    anyInputAt = performance.now();
    listeners.forEach(fn => fn('connected', 'g' + e.gamepad.index, e.gamepad));
  });
  window.addEventListener('gamepaddisconnected', e => {
    const id = 'g' + e.gamepad.index;
    if (sources[id]) sources[id].connected = false;
    listeners.forEach(fn => fn('disconnected', id, e.gamepad));
  });

  function blank(id, kind, label) {
    return {
      id, kind, label, connected: true, x: 0, y: 0,
      hold: { cross: false, square: false, triangle: false, circle: false, options: false },
      press: { cross: false, square: false, triangle: false, circle: false, options: false },
      prev: { cross: false, square: false, triangle: false, circle: false, options: false },
      dir: { up: false, down: false, left: false, right: false },
      dirOnce: { up: false, down: false, left: false, right: false }, // edge only, never repeats
      dirHeld: { up: 0, down: 0, left: 0, right: 0 },
      gp: null,
    };
  }

  function dz(v) {
    if (Math.abs(v) < DEADZONE) return 0;
    const s = Math.sign(v);
    return s * (Math.abs(v) - DEADZONE) / (1 - DEADZONE);
  }

  // Menu direction edges with key-repeat (first after 0.35 s, then every 0.12 s).
  function updateDirs(st, now, up, down, left, right) {
    const want = { up, down, left, right };
    Object.keys(want).forEach(d => {
      st.dir[d] = false; st.dirOnce[d] = false;
      if (want[d]) {
        if (!st.dirHeld[d]) { st.dir[d] = true; st.dirOnce[d] = true; st.dirHeld[d] = now + 350; }
        else if (now >= st.dirHeld[d]) { st.dir[d] = true; st.dirHeld[d] = now + 120; }
      } else st.dirHeld[d] = 0;
    });
  }

  function finishButtons(st, raw, now) {
    Object.keys(BUTTONS).forEach(b => {
      st.press[b] = raw[b] && !st.prev[b];
      st.hold[b] = raw[b];
      st.prev[b] = raw[b];
      if (raw[b]) anyInputAt = now;
    });
  }

  function poll() {
    const now = performance.now();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      const g = pads[i];
      const id = 'g' + i;
      if (!g || !g.connected) { if (sources[id]) sources[id].connected = false; continue; }
      const st = sources[id] || (sources[id] = blank(id, 'pad', 'Pad ' + (i + 1)));
      st.connected = true;
      st.gp = g;
      const b = idx => !!(g.buttons[idx] && (g.buttons[idx].pressed || g.buttons[idx].value > 0.5));
      let x = dz(g.axes[0] || 0), y = dz(g.axes[1] || 0);
      if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      st.x = x; st.y = y;
      if (m > 0.05) anyInputAt = now;
      const raw = {};
      Object.keys(BUTTONS).forEach(k => { raw[k] = b(BUTTONS[k]); });
      finishButtons(st, raw, now);
      updateDirs(st, now, y < -0.6, y > 0.6, x < -0.6, x > 0.6);
    }
    KEY_SETS.forEach(ks => {
      const st = sources[ks.id] || (sources[ks.id] = blank(ks.id, 'keys', ks.label));
      let x = (held.has(ks.right) ? 1 : 0) - (held.has(ks.left) ? 1 : 0);
      let y = (held.has(ks.down) ? 1 : 0) - (held.has(ks.up) ? 1 : 0);
      if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      st.x = x; st.y = y;
      if (x || y) anyInputAt = now;
      const raw = {};
      Object.keys(BUTTONS).forEach(k => { raw[k] = held.has(ks[k]); });
      finishButtons(st, raw, now);
      updateDirs(st, now, held.has(ks.up), held.has(ks.down), held.has(ks.left), held.has(ks.right));
    });
  }

  function get(id) { return sources[id] || null; }
  function all() { return Object.keys(sources).map(k => sources[k]).filter(s => s.connected); }
  function onChange(fn) { listeners.push(fn); }
  function rumble(id, ms, strength) {
    const st = sources[id];
    const gp = st && st.gp;
    if (!gp || !gp.vibrationActuator || !gp.vibrationActuator.playEffect) return;
    try { gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength }); } catch (e) { /* ignore */ }
  }
  function lastInput() { return anyInputAt; }
  function keyLabel(id) {
    const ks = KEY_SETS.find(k => k.id === id);
    if (!ks) return '';
    return ks.id === 'k0' ? 'WASD, F grab, R drop, H skip' : "Arrows, comma grab, ' drop, / skip";
  }

  function debug() { return Array.from(held).join('|'); }

  return { poll, get, all, onChange, rumble, lastInput, keyLabel, KEY_SETS, debug };
})();
