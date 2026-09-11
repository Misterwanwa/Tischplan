import React, { useState } from 'react';

export default function GamePreferences({ personIndex, settings, onUpdateSettings, onMessage }) {
  const [maintenance, setMaintenance] = useState(settings.people?.[personIndex]?.maintenanceKcal || '');
  const [open, setOpen] = useState(false);
  const save = async () => {
    const value = maintenance === '' ? null : Number(maintenance);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      onMessage('Bitte einen positiven Erhaltungsbedarf eintragen oder das Feld leer lassen.'); return;
    }
    const people = [...settings.people];
    people[personIndex] = { ...people[personIndex], maintenanceKcal: value };
    await onUpdateSettings({ people });
    onMessage('Einstellungen übernommen. Den Speicherstatus der App beachten.');
  };
  return (
    <details className="border border-stone-200 rounded-xl p-3" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="text-sm font-semibold cursor-pointer">Challenge-Einstellungen (Erhaltungsbedarf)</summary>
      <div className="space-y-3 mt-3">
        <label className="block text-xs font-semibold">Geschätzter Erhaltungsbedarf (kcal/Tag, optional)
          <input type="number" min="1" step="1" value={maintenance} onChange={e => setMaintenance(e.target.value)}
            className="block mt-1 px-3 py-2 w-full border rounded-lg text-sm" placeholder="Nicht mit dem Abnehmziel verwechseln" />
        </label>
        <p className="text-xs text-stone-500">Ohne diesen Wert wird „100 loss“ nicht ausgelost. Keine Mahlzeiten für Punkte auslassen. Größere Defizite geben keinen Bonus; Sport wird nicht doppelt angerechnet. Der Bedarf ist eine Schätzung, kein medizinischer Rat.</p>
        <button type="button" onClick={save} className="px-3 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800">Einstellungen speichern</button>
      </div>
    </details>
  );
}

