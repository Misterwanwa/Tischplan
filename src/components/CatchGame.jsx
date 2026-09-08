import React, { useEffect, useRef, useState } from 'react';
import { Apple, Carrot, Cookie, Pizza, BookOpen, X } from 'lucide-react';
import { BOARD_WIDTH, BOARD_HEIGHT, TICK_MS, MAX_TICKS, CATCH_ITEMS, createCatchGame, stepCatchGame } from '../modules/catchGame.js';

function ItemIcon({ kind }) {
  const icons = { apple: Apple, carrot: Carrot, cookie: Cookie, pizza: Pizza, book: BookOpen };
  const Icon = icons[kind];
  if (Icon) return <Icon size={25} aria-hidden="true" />;
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {kind === 'broccoli' && <><path d="M10 21h4l-1-8h-2z" /><path d="M7 14a4 4 0 1 1-1-8 5 5 0 0 1 10 0 4 4 0 1 1 1 8z" /></>}
      {kind === 'knife' && <><path d="m5 21 6-9L19 2c1 6-1 10-5 12l-2-2" /><path d="m5 21-2-2 6-8 3 2" /></>}
      {kind === 'pan' && <><ellipse cx="9" cy="14" rx="7" ry="5" /><path d="m15 11 7-8M3 17v2h12v-2" /></>}
      {kind === 'pot' && <><path d="M5 9h14v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM2 11h3m14 0h3M4 6h16M10 3h4v3" /></>}
    </svg>
  );
}

export function CatchLegend() {
  return (
    <div className="grid grid-cols-3 gap-2 text-xs text-center">
      <div className="rounded-lg bg-emerald-50 p-2 text-emerald-800"><Apple className="mx-auto mb-1" size={20} />Obst & Gemüse<br /><strong>+1 Punkt</strong></div>
      <div className="rounded-lg bg-amber-50 p-2 text-amber-900"><Cookie className="mx-auto mb-1" size={20} />Junkfood<br /><strong>−1 Punkt</strong></div>
      <div className="rounded-lg bg-rose-50 p-2 text-rose-800"><BookOpen className="mx-auto mb-1" size={20} />Kochbuch, Messer,<br />Pfanne, Topf: <strong>Ende</strong></div>
    </div>
  );
}

export default function CatchGame({ seed, character, ranked, onFinish }) {
  const gameRef = useRef(createCatchGame(seed));
  const inputs = useRef([]);
  const targetX = useRef(200);
  const keys = useRef({ left: false, right: false });
  const done = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const board = useRef(null);
  const modal = useRef(null);
  const [view, setView] = useState(() => ({ ...gameRef.current }));

  const finish = (abandoned = false) => {
    if (done.current) return;
    done.current = true;
    onFinishRef.current({
      inputs: [...inputs.current], score: abandoned ? 0 : gameRef.current.score,
      reason: abandoned ? 'Runde abgebrochen' : gameRef.current.reason, abandoned,
    });
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const previousFocus = document.activeElement;
    modal.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let last = performance.now();
    let accumulator = 0;
    let frame;
    const tick = now => {
      if (done.current) return;
      accumulator += now - last;
      last = now;
      const state = gameRef.current;
      while (accumulator >= TICK_MS && !state.over) {
        accumulator -= TICK_MS;
        if (keys.current.left) targetX.current = Math.max(30, targetX.current - 14);
        if (keys.current.right) targetX.current = Math.min(370, targetX.current + 14);
        const target = Math.round(targetX.current);
        inputs.current.push(target);
        stepCatchGame(state, target);
      }
      setView({ ...state, items: state.items.map(item => ({ ...item })) });
      if (state.over) finishRef.current();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const visibility = () => { if (document.hidden) finishRef.current(true); };
    const resetKeys = () => { keys.current = { left: false, right: false }; };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', resetKeys);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', resetKeys);
      document.body.style.overflow = originalOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  const move = event => {
    const bounds = board.current.getBoundingClientRect();
    targetX.current = Math.max(30, Math.min(370, (event.clientX - bounds.left) / bounds.width * BOARD_WIDTH));
  };
  const key = (event, down) => {
    if (['ArrowLeft', 'a', 'A', 'ArrowRight', 'd', 'D'].includes(event.key)) {
      event.preventDefault();
      keys.current[['ArrowLeft', 'a', 'A'].includes(event.key) ? 'left' : 'right'] = down;
    }
    if (event.key === 'Escape' && down) { event.preventDefault(); finish(true); }
    if (event.key === 'Tab') { event.preventDefault(); modal.current?.focus(); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-stone-950/90 flex items-center justify-center p-2 sm:p-4">
      <section ref={modal} role="dialog" aria-modal="true" aria-labelledby="catch-title" tabIndex={-1}
        onKeyDown={event => key(event, true)} onKeyUp={event => key(event, false)}
        className="w-full max-w-md bg-white rounded-2xl overflow-hidden outline-none shadow-2xl">
        <header className="flex items-center justify-between p-3 bg-stone-900 text-white">
          <div><h2 id="catch-title" className="font-bold">Lebensmittel-Catch</h2><p className="text-xs text-stone-300">{ranked ? 'Tageswertung' : 'Training · keine Punkte fürs Leaderboard'}</p></div>
          <button type="button" onClick={() => finish(true)} className="p-2 rounded-lg hover:bg-white/20" aria-label="Runde abbrechen (0 Tagespunkte)"><X size={20} /></button>
        </header>
        <div className="flex justify-between px-4 py-2 font-mono font-bold text-sm" aria-live="off">
          <span>{view.score} Punkte</span><span>{Math.max(0, Math.ceil((MAX_TICKS - view.tick) * TICK_MS / 1000))} s</span>
        </div>
        <div ref={board} role="application" aria-label="Catch-Spielfeld. Mit Pfeiltasten, A und D oder durch Ziehen bewegen. Escape bricht ab."
          onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); move(event); }}
          onPointerMove={event => { if (event.buttons || event.pointerType === 'mouse') move(event); }}
          className="relative mx-auto bg-gradient-to-b from-sky-100 via-emerald-50 to-emerald-200 overflow-hidden select-none"
          style={{ width: 'min(100%, 52vh)', aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}`, touchAction: 'none' }}>
          <div className="absolute bottom-0 h-[8%] w-full bg-emerald-700/20" />
          {view.items.map(item => {
            const definition = CATCH_ITEMS[item.index];
            return <div key={item.id} title={definition.label}
              className={`absolute flex items-center justify-center w-8 h-8 rounded-full border-2 shadow-sm ${definition.fatal ? 'bg-rose-100 border-rose-500 text-rose-900' : definition.points > 0 ? 'bg-white border-emerald-600 text-emerald-800' : 'bg-amber-100 border-amber-500 text-amber-900'}`}
              style={{ left: `${item.x / BOARD_WIDTH * 100}%`, top: `${item.y / BOARD_HEIGHT * 100}%`, transform: 'translate(-50%, -50%)' }}>
              <ItemIcon kind={definition.kind} />
            </div>;
          })}
          <img src={character} alt="Deine zufällig zugeteilte Spielerfigur" draggable={false}
            className="absolute object-contain pointer-events-none"
            style={{ left: `${view.x / BOARD_WIDTH * 100}%`, top: '81%', width: '16%', height: '16%', transform: 'translateX(-50%)' }} />
          <div className="absolute rounded-full bg-emerald-900/60 h-1" style={{ left: `${view.x / 4}%`, top: '94%', width: '17%', transform: 'translateX(-50%)' }} />
        </div>
        <p className="p-3 text-center text-xs text-stone-600">Ziehen, Maus oder ← / → · App-Wechsel beendet die Runde mit 0 Punkten.</p>
      </section>
    </div>
  );
}
