import { useEffect, useRef, useState } from 'react';
import { gameDay } from '../modules/gamification.js';
import { gamesRequest } from '../modules/gamesClient.js';

function readPending(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

export default function useGames(personIndex, refreshKey) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [game, setGame] = useState(null);
  const [result, setResult] = useState(null);
  const [today, setToday] = useState(gameDay);
  const pendingKey = `tischplan_catch_pending_${personIndex}`;
  const [pending, setPending] = useState(() => readPending(pendingKey));
  const sequence = useRef(0);
  const mounted = useRef(true);
  const actionBusy = useRef(false);
  const activeGame = useRef(null);

  const refresh = async (action = null) => {
    const ticket = ++sequence.current;
    try {
      const next = await gamesRequest(personIndex, action);
      if (mounted.current && ticket === sequence.current) { setData(next); setError(''); }
    } catch (e) {
      if (mounted.current && ticket === sequence.current) setError(e.message);
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current++; };
  }, []);
  // The server's daily token also covers StrictMode, reopening and retries.
  useEffect(() => { refresh({ action: 'open' }); }, [personIndex, today]);
  useEffect(() => { if (refreshKey > 0) refresh(); }, [refreshKey]);
  useEffect(() => {
    const update = () => {
      if (document.hidden || activeGame.current) return;
      const day = gameDay();
      if (day !== today) setToday(day);
      else refresh();
    };
    const timer = setInterval(update, 60000);
    window.addEventListener('focus', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); };
  }, [today, personIndex]);

  const startGame = async (ranked, characters) => {
    if (actionBusy.current) return;
    actionBusy.current = true; setBusy(true); setError(''); setResult(null);
    try {
      const session = ranked ? await gamesRequest(personIndex, { action: 'start' })
        : { seed: crypto.getRandomValues(new Uint32Array(1))[0] };
      if (!mounted.current) return;
      const next = { ...session, ranked, character: characters[session.seed % 2] };
      activeGame.current = next; setGame(next);
    } catch (e) {
      setError(e.message);
      if (e.code === 'DAILY_LIMIT') refresh();
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const submitResult = async payload => {
    if (actionBusy.current) return;
    actionBusy.current = true; setBusy(true);
    try {
      const saved = await gamesRequest(personIndex, payload);
      try { localStorage.removeItem(pendingKey); } catch { /* Server receipt is authoritative. */ }
      if (mounted.current) {
        setPending(null); setResult({ score: saved.score, text: 'Tagespunkte gespeichert.' });
        await refresh();
      }
    } catch (e) {
      if (mounted.current) setError(`${e.message} Dein Ergebnis wartet auf Übertragung. Bitte „Ergebnis senden“ wählen.`);
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const finishGame = outcome => {
    const session = activeGame.current;
    activeGame.current = null; setGame(null);
    if (!session?.ranked) {
      setResult({ score: outcome.score, text: `${outcome.reason}. Training – keine Leaderboard-Punkte.` });
      return;
    }
    const payload = { action: outcome.abandoned ? 'abandon' : 'finish', sessionId: session.sessionId,
      ...(outcome.abandoned ? {} : { inputs: outcome.inputs }) };
    setPending(payload);
    try { localStorage.setItem(pendingKey, JSON.stringify(payload)); }
    catch { setError('Ergebnis nicht lokal gespeichert. Diese Ansicht bitte bis zur Übertragung offen lassen.'); }
    setResult({ score: outcome.score, text: `${outcome.reason}. Ergebnis wird übertragen …` });
    submitResult(payload);
  };

  return { data, error, setError, busy, game, result, setResult, today, pending, refresh, startGame, submitResult, finishGame };
}
