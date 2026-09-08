import React, { useEffect, useState } from 'react';
import { Trophy, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import CatchGame, { CatchLegend } from './CatchGame.jsx';
import GamePreferences from './GamePreferences.jsx';
import useGames from './useGames.js';
import { CHALLENGES, CHARACTER_ASSETS } from '../modules/gamification.js';

const button = 'px-3 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold disabled:opacity-40';
const dateLabel = day => day.split('-').reverse().join('.');
const statuses = { completed: 'Geschafft', failed: 'Nicht geschafft', expired: 'Abgelaufen', declined: 'Abgelehnt' };

export default function GamesHub({ personIndex, settings, onUpdateSettings, refreshKey }) {
  const api = useGames(personIndex, refreshKey);
  const [expanded, setExpanded] = useState(false);
  const [section, setSection] = useState('game');
  const [characters, setCharacters] = useState(settings.people?.[personIndex]?.gameCharacters || ['', '']);
  const [imagesReady, setImagesReady] = useState(false);
  const valid = characters.length === 2 && characters[0] !== characters[1] && characters.every(src => CHARACTER_ASSETS.includes(src));
  useEffect(() => {
    let cancelled = false;
    setImagesReady(false);
    if (valid) Promise.all(characters.map(src => new Promise((resolve, reject) => {
      const image = new Image(); image.onload = resolve; image.onerror = reject; image.src = src;
    }))).then(() => { if (!cancelled) setImagesReady(true); }).catch(() => {
      if (!cancelled) api.setError('Eine Charakterdatei konnte nicht geladen werden. Bitte Build oder Verbindung prüfen.');
    });
    return () => { cancelled = true; };
  }, [characters[0], characters[1], valid]);
  const own = api.data?.leaderboard.find(entry => entry.profile === personIndex);
  const active = api.data?.challenges.find(challenge => challenge.status === 'active');
  const history = api.data?.challenges.filter(challenge => challenge.status !== 'active') || [];
  const roundUsed = api.data?.today === api.today && !!api.data?.round;
  return (
    <section className="bg-white border border-amber-200 rounded-2xl overflow-hidden shadow-sm" aria-label="Minispiele und Leaderboard">
      <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="w-full p-4 flex items-center justify-between text-left bg-amber-50 gap-2">
        <span className="flex items-center gap-2"><Trophy className="text-amber-700 shrink-0" size={22} /><span><span className="font-bold text-sm block">Spielplatz & Leaderboard</span><span className="text-xs text-stone-600">{own ? `${own.total} Punkte · ${own.streak} Tage Streak` : 'Catch-Spiel, Tagespunkte und Challenges'}</span></span></span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {active && <div className="p-4 border-t border-amber-100 bg-emerald-50" role="status">
        <h3 className="text-sm font-bold text-emerald-900">{active.start_day === api.today ? 'Neue Challenge: ' : ''}{CHALLENGES[active.kind].title} · +{CHALLENGES[active.kind].points} Punkte</h3>
        <p className="text-xs text-emerald-900 mt-1">{CHALLENGES[active.kind].description}</p>
        <p className="text-xs font-semibold mt-2">{active.progress} / {CHALLENGES[active.kind].required} abgeschlossene Tage · {dateLabel(active.start_day)} – {dateLabel(active.end_day)}</p>
        <p className="text-xs text-stone-600 mt-1">Auswertung nach Tagesende. Mahlzeiten vollständig erfassen; Challenges sind freiwillig.</p>
        <button type="button" className="text-xs underline mt-2 text-stone-600" onClick={() => {
          if (window.confirm('Challenge ohne Punkte beenden? Heute gibt es keinen weiteren Losversuch.')) api.refresh({ action: 'decline', id: active.id });
        }}>Challenge ablehnen</button>
      </div>}
      {expanded && <div className="p-4 space-y-4">
        <nav className="flex gap-2" aria-label="Spielplatz-Bereiche">
          {['game', 'leaderboard'].map(key => <button key={key} type="button" onClick={() => setSection(key)} aria-pressed={section === key} className={section === key ? button : 'px-3 py-2 rounded-lg border text-xs'}>{key === 'game' ? 'Catch-Spiel' : 'Leaderboard'}</button>)}
          <button type="button" onClick={() => api.refresh()} className="p-2 border rounded-lg ml-auto" aria-label="Punkte aktualisieren"><RefreshCw size={15} /></button>
        </nav>
        {api.error && <p role="alert" className="text-xs text-rose-800 rounded-lg bg-rose-50 p-3">{api.error}</p>}
        {api.pending && <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs"><p className="mb-2">Ein Ergebnis wartet auf die Serverbestätigung.</p><button type="button" disabled={api.busy} onClick={() => api.submitResult(api.pending)} className={button}>Ergebnis senden</button></div>}
        {api.result && <p role="status" className="text-sm bg-stone-100 p-3 rounded-lg">{typeof api.result.score === 'number' && <strong>{api.result.score} Punkte · </strong>}{api.result.text}</p>}
        {section === 'game' ? <>
          <CatchLegend />
          <p className="text-xs text-stone-600">60 Sekunden sammeln. Küchengegenstände beenden die Runde; bisherige Plus- und Minuspunkte werden gewertet. Abbrechen oder App-Wechsel: 0 Punkte. Die erste gestartete Tagesrunde zählt, danach unbegrenzt Training.</p>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className={button} disabled={api.busy || !api.data || !!api.error || roundUsed || !!api.pending || !imagesReady} onClick={() => api.startGame(true, characters)}>{api.busy ? 'Bitte warten …' : roundUsed ? 'Tagesrunde bereits verbraucht' : 'Tagesrunde starten'}</button>
            <button type="button" className="px-3 py-2 rounded-lg border border-stone-300 text-xs font-semibold disabled:opacity-40" disabled={api.busy || !imagesReady} onClick={() => api.startGame(false, characters)}>Training ohne Punkte</button>
          </div>
          {!valid && <p className="text-xs text-amber-900">Ordne unten zuerst die braune und die weiße Figur zu.</p>}
          {roundUsed && <p className="text-xs text-stone-500">Heute: {api.data.round.finished_at ? `${api.data.round.score} Punkte` : 'Versuch reserviert oder abgebrochen (0 Punkte, falls kein Ergebnis folgt)'}.</p>}
          <GamePreferences personIndex={personIndex} settings={settings} onUpdateSettings={onUpdateSettings} characters={characters} setCharacters={setCharacters} valid={valid} onMessage={text => api.setResult({ text })} />
        </> : <>
          {api.data ? <ol className="space-y-2">{api.data.leaderboard.map((entry, index) => <li key={entry.profile} className={`border rounded-xl p-3 ${entry.profile === personIndex ? 'border-amber-400 bg-amber-50' : 'border-stone-200'}`}>
            <div className="flex justify-between gap-2"><strong className="text-sm">{index + 1}. {entry.name}{entry.profile === personIndex ? ' (du)' : ''}</strong><strong className="text-sm">{entry.total} Punkte</strong></div>
            <p className="text-xs mt-1">{entry.streak} Tage aktueller Streak</p>
            <p className="text-xs text-stone-500 mt-1">Tage: {entry.streakPoints} · Catch: {entry.gamePoints} · Challenges: {entry.challengePoints}</p>
          </li>)}</ol> : <p className="text-sm text-stone-500">Leaderboard benötigt eine Verbindung zur Punkte-API.</p>}
          <p className="text-xs text-stone-600">Pro erfasstem Tag einmalig +5 Punkte, bei rückwirkender Erfassung +1. Bestehende Einträge ohne Erfassungsdatum zählen +1. Wasser allein und zukünftige Tage geben keine Punkte. Korrekturen ändern verbuchte Punkte nicht; erneutes Eintragen gibt keinen weiteren Bonus.</p>
          <p className="text-xs text-stone-500">Sortierung: Punkte, dann Streak. Tageswechsel: Mitternacht in Europe/Berlin.</p>
        </>}
        <div className="text-xs text-stone-600 border-t pt-3 space-y-1">
          <p>Challenges: 10 % Gesamtchance, einmal täglich beim Öffnen von Kalorien. Höchstens eine aktive Challenge.</p>
          {!active && <p>{api.data?.checkedToday ? 'Der heutige Losversuch ist verbraucht.' : 'Noch keine Challenge geladen.'}</p>}
          {history.map(challenge => <p key={challenge.id}>{CHALLENGES[challenge.kind].title}: {statuses[challenge.status]}{challenge.points ? ` (+${challenge.points} Punkte)` : ''}</p>)}
        </div>
      </div>}
      {api.game && <CatchGame {...api.game} onFinish={api.finishGame} />}
    </section>
  );
}
