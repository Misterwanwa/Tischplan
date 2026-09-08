import React, { useState } from 'react';
import { CHARACTER_ASSETS } from '../modules/gamification.js';

export default function GamePreferences({ personIndex, settings, onUpdateSettings, characters, setCharacters, valid, onMessage }) {
  const [maintenance, setMaintenance] = useState(settings.people?.[personIndex]?.maintenanceKcal || '');
  const [open, setOpen] = useState(!valid);
  const save = async () => {
    const value = maintenance === '' ? null : Number(maintenance);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      onMessage('Bitte einen positiven Erhaltungsbedarf eintragen oder das Feld leer lassen.'); return;
    }
    const people = [...settings.people];
    people[personIndex] = { ...people[personIndex], gameCharacters: characters, maintenanceKcal: value };
    await onUpdateSettings({ people });
    onMessage('Einstellungen übernommen. Den Speicherstatus der App beachten.');
  };
  return (
    <details className="border border-stone-200 rounded-xl p-3" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="text-sm font-semibold cursor-pointer">Charaktere & Challenge-Einstellungen</summary>
      <div className="space-y-3 mt-3">
        <p className="text-xs text-stone-500">Je eine Vorlage auswählen. Pro Runde wird zufällig eine der beiden Figuren gespielt. Die Originalbilder bleiben unverändert, mit ihren ursprünglichen Proportionen und Farben.</p>
        {['Braune Figur', 'Weiße Figur'].map((label, index) => <fieldset key={label}>
          <legend className="text-xs font-semibold mb-1">{label}</legend>
          <div className="grid grid-cols-3 gap-2">{CHARACTER_ASSETS.map((src, imageIndex) => <label key={src} className={`relative p-1 border-2 rounded-lg cursor-pointer ${characters[index] === src ? 'border-emerald-600' : 'border-stone-200'}`}>
            <input type="radio" name={`character-${personIndex}-${index}`} checked={characters[index] === src} className="absolute left-2 top-2"
              onChange={() => setCharacters(current => current.map((old, slot) => slot === index ? src : old))} />
            <img src={src} alt={`Vorlage ${imageIndex + 1}`} className="w-full h-20 object-contain" />
            <span className="block text-center text-xs">Datei {imageIndex + 1}</span>
          </label>)}</div>
        </fieldset>)}
        <label className="block text-xs font-semibold">Geschätzter Erhaltungsbedarf (kcal/Tag, optional)
          <input type="number" min="1" step="1" value={maintenance} onChange={e => setMaintenance(e.target.value)}
            className="block mt-1 px-3 py-2 w-full border rounded-lg text-sm" placeholder="Nicht mit dem Abnehmziel verwechseln" />
        </label>
        <p className="text-xs text-stone-500">Ohne diesen Wert wird „100 loss“ nicht ausgelost. Keine Mahlzeiten für Punkte auslassen. Größere Defizite geben keinen Bonus; Sport wird nicht doppelt angerechnet. Der Bedarf ist eine Schätzung, kein medizinischer Rat.</p>
        <button type="button" disabled={!valid} onClick={save} className="px-3 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold disabled:opacity-40">Einstellungen speichern</button>
      </div>
    </details>
  );
}
