export const BOARD_WIDTH = 400;
export const BOARD_HEIGHT = 500;
export const TICK_MS = 50;
export const MAX_TICKS = 60_000 / TICK_MS;
export const CATCH_ITEMS = [
  { kind: 'apple', label: 'Apfel', points: 1 },
  { kind: 'carrot', label: 'Karotte', points: 1 },
  { kind: 'broccoli', label: 'Brokkoli', points: 1 },
  { kind: 'cookie', label: 'Keks', points: -1 },
  { kind: 'pizza', label: 'Pizza', points: -1 },
  { kind: 'book', label: 'Kochbuch', fatal: true },
  { kind: 'knife', label: 'Messer', fatal: true },
  { kind: 'pan', label: 'Pfanne', fatal: true },
  { kind: 'pot', label: 'Topf', fatal: true },
];

function random(state) {
  state.seed = (Math.imul(1664525, state.seed) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

export function createCatchGame(seed) {
  return { seed: seed >>> 0, tick: 0, x: 200, items: [], score: 0, over: false, reason: null };
}

// Fixed-step simulation shared by the browser and the score endpoint.
export function stepCatchGame(state, targetX) {
  if (state.over) return state;
  state.tick++;
  const target = Math.max(30, Math.min(370, Number(targetX) || 200));
  state.x += Math.max(-14, Math.min(14, target - state.x));
  if (state.tick % 15 === 1) {
    const chance = random(state);
    const index = chance < 0.57 ? Math.floor(random(state) * 3)
      : chance < 0.85 ? 3 + Math.floor(random(state) * 2)
        : 5 + Math.floor(random(state) * 4);
    state.items.push({ id: state.tick, index, x: 20 + random(state) * 360, y: -20 });
  }
  for (const item of state.items) {
    item.y += 3.8 + state.tick / 650;
    if (!item.caught && item.y >= 420 && item.y <= 466 && Math.abs(item.x - state.x) < 38) {
      item.caught = true;
      const definition = CATCH_ITEMS[item.index];
      if (definition.fatal) {
        state.over = true;
        state.reason = definition.label;
        break;
      }
      state.score += definition.points;
    }
  }
  state.items = state.items.filter(item => !item.caught && item.y < BOARD_HEIGHT + 20);
  if (!state.over && state.tick >= MAX_TICKS) {
    state.over = true;
    state.reason = 'Zeit abgelaufen';
  }
  return state;
}

export function replayCatchGame(seed, inputs) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > MAX_TICKS ||
      inputs.some(x => !Number.isInteger(x) || x < 30 || x > 370)) {
    throw new Error('Ungültige Spielaufzeichnung.');
  }
  const state = createCatchGame(seed);
  for (let i = 0; i < inputs.length; i++) {
    if (state.over) throw new Error('Aufzeichnung enthält Eingaben nach Spielende.');
    stepCatchGame(state, inputs[i]);
  }
  if (!state.over) throw new Error('Die Runde ist noch nicht beendet.');
  return state;
}
