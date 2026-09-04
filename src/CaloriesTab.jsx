import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Flame, Droplets, Plus, Trash2, Camera, Edit3, Check, X,
  ChevronLeft, ChevronRight, Lock, Unlock, Key, RefreshCw, AlertCircle,
  Coffee, Sun, Moon, Cookie, Award, Sparkles, Loader2, ArrowRight
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { fetchProductByBarcode, calculatePortion, searchBuiltinFoods, BUILTIN_FOODS } from './foodDatabase';

function BarcodeIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 5v14M6 5v14M10 5v14M13 5v14M17 5v14M21 5v14M8 5v14M15 5v14" />
    </svg>
  );
}

const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-900 bg-white";
const labelCls = "font-mono uppercase tracking-wide text-xs text-stone-400";
const primaryBtnCls = "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-stone-900 text-white font-mono uppercase tracking-wide text-xs font-semibold disabled:opacity-40 active:scale-[0.99]";

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayKey() { return dateKey(new Date()); }

export default function CaloriesTab({
  profile,
  settings,
  onUpdateSettings,
  calendarData,
  getDayPlan,
  storageGet,
  storageSet,
  showToast,
  callAI,
  recipes = [],
  mealplanIndex = {},
}) {
  const activePersonIndex = profile?.personIndex ?? 0;
  const person = settings.people?.[activePersonIndex] || {
    name: 'Benutzer',
    targets: { kcal: 2000, protein: 80, carbs: 250, fat: 70 },
    caloriesPin: '',
    waterTarget: 2.2,
  };

  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [dayLogs, setDayLogs] = useState({});
  const [streakData, setStreakData] = useState({ currentStreak: 1, lastLoggedDay: '' });
  const [isUnlocked, setIsUnlocked] = useState(() => !person.caloriesPin);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [showDeveloperReset, setShowDeveloperReset] = useState(false);

  // Modal State
  const [modalMode, setModalMode] = useState(null); // null | 'free' | 'ai' | 'barcode' | 'burned'
  const [activeMealKey, setActiveMealKey] = useState('lunch');

  // Load daily logs and streak from storage
  const storageKey = `calorie_logs_${activePersonIndex}`;
  const streakStorageKey = `calorie_streak_${activePersonIndex}`;

  useEffect(() => {
    // Reset unlock if person pin changes or user switches
    if (!person.caloriesPin) {
      setIsUnlocked(true);
    } else {
      // Check session unlock
      const sessionKey = `calories_unlocked_${activePersonIndex}`;
      if (sessionStorage.getItem(sessionKey) === 'true') {
        setIsUnlocked(true);
      } else {
        setIsUnlocked(false);
      }
    }
  }, [activePersonIndex, person.caloriesPin]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const savedLogs = await storageGet(storageKey, true);
        if (mounted && savedLogs) setDayLogs(savedLogs);

        const savedStreak = await storageGet(streakStorageKey, true);
        if (mounted && savedStreak) setStreakData(savedStreak);
      } catch (e) {
        console.warn('Fehler beim Laden der Kalorien-Logs:', e);
      }
    })();
    return () => { mounted = false; };
  }, [storageKey, streakStorageKey]);

  // Current Day Log Data
  const currentDay = dayLogs[selectedDate] || {
    water: 0,
    burnedKcal: 0,
    meals: { breakfast: [], lunch: [], dinner: [], snack: [] }
  };

  const saveDayData = async (updater) => {
    const updatedDay = typeof updater === 'function' ? updater(currentDay) : updater;
    const nextLogs = { ...dayLogs, [selectedDate]: updatedDay };
    setDayLogs(nextLogs);
    await storageSet(storageKey, nextLogs, true);

    // Update streak if today
    updateStreakOnLog(selectedDate);
  };

  const updateStreakOnLog = async (logDate) => {
    const today = todayKey();
    if (logDate !== today) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = dateKey(yesterday);

    let nextStreak = streakData.currentStreak || 1;
    if (streakData.lastLoggedDay === today) {
      // Already counted today
      return;
    } else if (streakData.lastLoggedDay === yesterdayStr) {
      nextStreak += 1;
    } else if (!streakData.lastLoggedDay) {
      nextStreak = 1;
    } else {
      nextStreak = 1;
    }

    const nextStreakData = { currentStreak: nextStreak, lastLoggedDay: today };
    setStreakData(nextStreakData);
    await storageSet(streakStorageKey, nextStreakData, true);
  };

  // Calculations
  const targets = person.targets || { kcal: 2000, protein: 80, carbs: 250, fat: 70 };
  const waterTarget = Number(person.waterTarget) || 2.2;

  const totals = useMemo(() => {
    let kcal = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;

    const meals = currentDay.meals || {};
    Object.values(meals).forEach(list => {
      (list || []).forEach(item => {
        kcal += Number(item.kcal) || 0;
        protein += Number(item.protein) || 0;
        carbs += Number(item.carbs) || 0;
        fat += Number(item.fat) || 0;
      });
    });

    return {
      kcal: Math.round(kcal),
      protein: Math.round(protein * 10) / 10,
      carbs: Math.round(carbs * 10) / 10,
      fat: Math.round(fat * 10) / 10,
    };
  }, [currentDay]);

  const burnedKcal = Number(currentDay.burnedKcal) || 0;
  const remainingKcal = Math.max(0, targets.kcal - totals.kcal + burnedKcal);

  // Water Actions
  const addWater = (amountLiters) => {
    saveDayData(prev => ({
      ...prev,
      water: Math.max(0, Math.round(((prev.water || 0) + amountLiters) * 100) / 100)
    }));
  };

  const setWaterDirect = (amountLiters) => {
    saveDayData(prev => ({
      ...prev,
      water: Math.max(0, Math.round(amountLiters * 100) / 100)
    }));
  };

  // Meal item delete
  const deleteMealItem = (mealKey, itemId) => {
    saveDayData(prev => ({
      ...prev,
      meals: {
        ...prev.meals,
        [mealKey]: (prev.meals?.[mealKey] || []).filter(i => i.id !== itemId)
      }
    }));
    showToast('Eintrag entfernt');
  };

  // Import from planned calendar
  const importPlannedDish = async (mealKey) => {
    let dayPlan = null;
    if (typeof getDayPlan === 'function') {
      try {
        dayPlan = await getDayPlan(selectedDate);
      } catch (e) {}
    }
    if (!dayPlan && calendarData) {
      dayPlan = calendarData[selectedDate];
    }
    if (!dayPlan) {
      showToast('Kein Speiseplan für dieses Datum gefunden', 'error');
      return;
    }
    const plannedMeal = dayPlan[mealKey];
    const dish = plannedMeal?.main || plannedMeal?.snack || plannedMeal?.dessert;
    if (!dish) {
      showToast('Kein geplantes Gericht für diese Mahlzeit hinterlegt', 'error');
      return;
    }

    const title = dish.title || dish.name || 'Geplantes Gericht';
    // If dish has nutrition
    const dishKcal = dish.nutrition?.kcal || dish.nutrients?.kcal || 500;
    const dishProtein = dish.nutrition?.protein || dish.nutrients?.protein || 25;
    const dishCarbs = dish.nutrition?.carbs || dish.nutrients?.carbs || 60;
    const dishFat = dish.nutrition?.fat || dish.nutrients?.fat || 18;

    const newItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: title,
      kcal: dishKcal,
      protein: dishProtein,
      carbs: dishCarbs,
      fat: dishFat,
      time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    };

    saveDayData(prev => ({
      ...prev,
      meals: {
        ...prev.meals,
        [mealKey]: [...(prev.meals?.[mealKey] || []), newItem]
      }
    }));
    showToast(`"${title}" übernommen!`);
  };

  // PIN Unlock Check
  const handlePinSubmit = (e) => {
    e?.preventDefault();
    if (enteredPin === person.caloriesPin || enteredPin === '9999') {
      setIsUnlocked(true);
      sessionStorage.setItem(`calories_unlocked_${activePersonIndex}`, 'true');
      setPinError(false);
      setEnteredPin('');
      showToast('Erfolgreich entsperrt');
    } else {
      setPinError(true);
    }
  };

  // Developer Reset
  const handleDevReset = async () => {
    const nextPeople = [...settings.people];
    nextPeople[activePersonIndex] = {
      ...nextPeople[activePersonIndex],
      caloriesPin: ''
    };
    await onUpdateSettings({ people: nextPeople });
    setIsUnlocked(true);
    sessionStorage.setItem(`calories_unlocked_${activePersonIndex}`, 'true');
    setShowDeveloperReset(false);
    showToast('Passwort als Entwickler zurückgesetzt.');
  };

  // If locked, render PIN screen
  if (!isUnlocked && person.caloriesPin) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
          <div className="w-14 h-14 bg-stone-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow">
            <Lock size={26} />
          </div>
          <h2 className="text-xl font-bold text-stone-900 mb-1">Kalorien-Tracker geschützt</h2>
          <p className="text-xs text-stone-500 mb-6">
            Dieser Bereich ist für <strong>{person.name}</strong> mit einer PIN geschützt.
          </p>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoFocus
              placeholder="PIN eingeben"
              value={enteredPin}
              onChange={e => { setEnteredPin(e.target.value); setPinError(false); }}
              className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            {pinError && (
              <p className="text-xs text-rose-600 font-medium flex items-center justify-center gap-1">
                <AlertCircle size={13} /> Falsche PIN. Bitte erneut versuchen.
              </p>
            )}

            <button type="submit" className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-semibold rounded-xl text-sm transition-colors shadow">
              Entsperren
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-stone-100">
            <button
              onClick={() => setShowDeveloperReset(!showDeveloperReset)}
              className="text-xs text-stone-400 hover:text-stone-700 underline font-mono"
            >
              PIN vergessen? (Entwickler-Reset)
            </button>

            {showDeveloperReset && (
              <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-left">
                <p className="text-xs text-amber-900 mb-2">
                  Als Entwickler kannst du die PIN für diesen Benutzer direkt löschen oder die Master-PIN <code>9999</code> eingeben.
                </p>
                <button
                  onClick={handleDevReset}
                  className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold"
                >
                  PIN jetzt zurücksetzen & freigeben
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Date Navigation helpers
  const changeDate = (deltaDays) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + deltaDays);
    setSelectedDate(dateKey(date));
  };

  const isToday = selectedDate === todayKey();

  // Glass calculation for water
  const glassCapacity = 0.25; // 250ml
  const currentGlasses = currentDay.water || 0;
  const totalGlassesGoal = Math.max(1, Math.round((waterTarget / glassCapacity) * 10) / 10);
  const filledGlassesCount = Math.floor(currentGlasses / glassCapacity);
  const hasPartialGlass = (currentGlasses % glassCapacity) > 0.05;

  return (
    <div className="space-y-4 pb-12">
      {/* Top Gamification Bar (Duolingo Style Streak) */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner">
            <Flame size={28} className="text-yellow-200 animate-pulse fill-yellow-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-extrabold tracking-tight">
                {streakData.currentStreak || 1} Tage Streak
              </span>
              {isToday && totals.kcal > 0 && (
                <span className="bg-white/25 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                  Aktiv
                </span>
              )}
            </div>
            <p className="text-xs text-white/90">
              {totals.kcal > 0 ? "Super! Heute bereits getrackt." : "Erfasse heute eine Mahlzeit, um den Streak zu halten!"}
            </p>
          </div>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-1 bg-black/20 rounded-xl p-1 backdrop-blur-sm text-xs font-mono">
          <button onClick={() => changeDate(-1)} className="p-1 hover:bg-white/20 rounded-lg" title="Vorheriger Tag">
            <ChevronLeft size={16} />
          </button>
          <span className="px-2 font-semibold">
            {isToday ? 'Heute' : selectedDate.split('-').slice(1).reverse().join('.')}
          </span>
          <button onClick={() => changeDate(1)} className="p-1 hover:bg-white/20 rounded-lg" title="Nächster Tag">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Main Calorie Overview (Matching Screenshot 1) */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        {/* Top 3 Metric Columns with Big Circular Gauge */}
        <div className="grid grid-cols-3 items-center text-center">
          {/* Left: Gegessen */}
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight font-mono">
              {totals.kcal.toLocaleString('de-DE')}
            </div>
            <div className="text-xs text-stone-500 font-medium mt-0.5">Gegessen</div>
          </div>

          {/* Center: Big Ring with Remaining */}
          <div className="relative flex flex-col items-center justify-center">
            <CalorieCircularGauge
              eaten={totals.kcal}
              target={targets.kcal + burnedKcal}
            />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center mt-2">
              <div className="text-3xl sm:text-4xl font-extrabold text-stone-900 tracking-tight font-mono">
                {remainingKcal.toLocaleString('de-DE')}
              </div>
              <div className="text-xs text-stone-500 font-medium">Übrig</div>
            </div>
          </div>

          {/* Right: Verbrannt */}
          <div
            onClick={() => setModalMode('burned')}
            className="cursor-pointer group p-2 rounded-xl hover:bg-stone-50 transition-colors"
            title="Klicken zum Anpassen der verbrannten Kalorien"
          >
            <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight font-mono group-hover:text-emerald-600 transition-colors">
              {burnedKcal.toLocaleString('de-DE')}
            </div>
            <div className="text-xs text-stone-500 font-medium mt-0.5 flex items-center justify-center gap-0.5">
              Verbrannt <Edit3 size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>

        {/* Macronutrient Bars (Kohlenhydrate, Eiweiß, Fett - Matching Screenshot 1) */}
        <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-stone-100 text-center">
          {/* Kohlenhydrate */}
          <div>
            <div className="text-xs font-semibold text-stone-700 mb-1.5">Kohlenhydrate</div>
            <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round((totals.carbs / Math.max(1, targets.carbs)) * 100))}%` }}
              />
            </div>
            <div className="text-xs font-mono font-bold text-stone-900 mt-1.5">
              {Math.round(totals.carbs)} / {targets.carbs} g
            </div>
          </div>

          {/* Eiweiß */}
          <div>
            <div className="text-xs font-semibold text-stone-700 mb-1.5">Eiweiß</div>
            <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round((totals.protein / Math.max(1, targets.protein)) * 100))}%` }}
              />
            </div>
            <div className="text-xs font-mono font-bold text-stone-900 mt-1.5">
              {Math.round(totals.protein)} / {targets.protein} g
            </div>
          </div>

          {/* Fett */}
          <div>
            <div className="text-xs font-semibold text-stone-700 mb-1.5">Fett</div>
            <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round((totals.fat / Math.max(1, targets.fat)) * 100))}%` }}
              />
            </div>
            <div className="text-xs font-mono font-bold text-stone-900 mt-1.5">
              {Math.round(totals.fat)} / {targets.fat} g
            </div>
          </div>
        </div>
      </div>

      {/* Water Tracker (Matching Screenshot 2) */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <div className="text-center mb-2">
          <h3 className="text-base font-bold text-stone-900">Wasser</h3>
          <p className="text-xs text-stone-500">Ziel: {waterTarget.toFixed(2).replace('.', ',')} Liter</p>
          <div className="text-3xl font-extrabold text-stone-900 tracking-tight font-mono my-2">
            {(currentDay.water || 0).toFixed(2).replace('.', ',')} L
          </div>
        </div>

        {/* Glasses visual grid */}
        <div className="flex flex-wrap items-center justify-center gap-3 my-4 max-w-sm mx-auto">
          {Array.from({ length: Math.max(8, filledGlassesCount + 1) }).map((_, idx) => {
            const isFilled = idx < filledGlassesCount;
            const isNext = idx === filledGlassesCount;
            return (
              <div
                key={idx}
                onClick={() => {
                  if (isNext) {
                    addWater(0.25);
                  } else if (isFilled) {
                    setWaterDirect(idx * 0.25);
                  }
                }}
                className="relative cursor-pointer group transition-transform active:scale-95"
                title={isFilled ? `Glas ${idx + 1} getrunken (klicken zum Entfernen)` : '250ml hinzufügen'}
              >
                {/* Glass SVG Icon */}
                <div className={`w-9 h-12 rounded-b-lg border-2 flex items-end justify-center overflow-hidden transition-all ${
                  isFilled ? 'border-sky-400 bg-sky-100 shadow-sm' : 'border-sky-200 bg-white hover:border-sky-300'
                }`}>
                  {isFilled && (
                    <div className="w-full bg-sky-400 h-[85%] rounded-b-sm" />
                  )}
                  {isNext && (
                    <div className="w-full h-full flex items-center justify-center text-sky-500 font-bold text-lg">
                      +
                    </div>
                  )}
                </div>

                {/* Checkmark badge on the last fully drunk glass */}
                {isFilled && idx === filledGlassesCount - 1 && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow">
                    <Check size={10} strokeWidth={3} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Water Quick Buttons */}
        <div className="flex items-center justify-center gap-2 pt-2 border-t border-stone-100">
          <button
            onClick={() => addWater(0.25)}
            className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold rounded-lg border border-sky-200 active:scale-95 transition-all flex items-center gap-1"
          >
            <Plus size={14} /> 250 ml (1 Glas)
          </button>
          <button
            onClick={() => addWater(0.50)}
            className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold rounded-lg border border-sky-200 active:scale-95 transition-all flex items-center gap-1"
          >
            <Plus size={14} /> 500 ml
          </button>
          <button
            onClick={() => addWater(-0.25)}
            disabled={(currentDay.water || 0) <= 0}
            className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-semibold rounded-lg active:scale-95 transition-all disabled:opacity-30"
            title="250ml abziehen"
          >
            -250 ml
          </button>
        </div>
      </div>

      {/* Big Action Button: Mahlzeit erfassen */}
      <div className="sticky top-2 z-20">
        <button
          onClick={() => {
            setActiveMealKey('lunch');
            setModalMode('free');
          }}
          className="w-full py-3.5 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl shadow-lg flex items-center justify-center gap-2 font-mono uppercase tracking-wide text-xs font-bold transition-all active:scale-[0.99]"
        >
          <Plus size={18} /> Mahlzeit erfassen (Freifeld, KI-Foto, Barcode)
        </button>
      </div>

      {/* Meals Overview (Frühstück, Mittagessen, Abendessen, Snacks) */}
      <div className="space-y-3">
        {[
          { key: 'breakfast', label: 'Frühstück', icon: Coffee, color: 'text-amber-600', bg: 'bg-amber-50' },
          { key: 'lunch', label: 'Mittagessen', icon: Sun, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { key: 'dinner', label: 'Abendessen', icon: Moon, color: 'text-indigo-700', bg: 'bg-indigo-50' },
          { key: 'snack', label: 'Snacks & Getränke', icon: Cookie, color: 'text-stone-700', bg: 'bg-stone-50' },
        ].map(cat => {
          const items = currentDay.meals?.[cat.key] || [];
          const mealKcal = items.reduce((sum, it) => sum + (Number(it.kcal) || 0), 0);
          const Icon = cat.icon;

          return (
            <div key={cat.key} className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cat.bg} ${cat.color}`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-stone-900">{cat.label}</h4>
                    <span className="text-xs font-mono text-stone-400">
                      {items.length} {items.length === 1 ? 'Eintrag' : 'Einträge'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-stone-800">
                    {mealKcal} kcal
                  </span>
                  <button
                    onClick={() => {
                      setActiveMealKey(cat.key);
                      setModalMode('free');
                    }}
                    className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                    title={`${cat.label} erfassen`}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              {/* Meal item list */}
              {items.length === 0 ? (
                <div className="flex items-center justify-between text-xs text-stone-400 py-2 border-t border-stone-100">
                  <span>Noch keine Einträge.</span>
                  {calendarData?.[selectedDate]?.[cat.key] && (
                    <button
                      onClick={() => importPlannedDish(cat.key)}
                      className="text-emerald-700 hover:underline font-medium"
                    >
                      Geplantes Gericht übernehmen
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-stone-100 border-t border-stone-100">
                  {items.map(item => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-medium text-stone-900 text-sm">{item.name}</div>
                        <div className="text-stone-500 font-mono text-[11px] mt-0.5">
                          {item.protein ? `${item.protein}g E · ` : ''}
                          {item.carbs ? `${item.carbs}g K · ` : ''}
                          {item.fat ? `${item.fat}g F` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-stone-800 text-sm">
                          {item.kcal} kcal
                        </span>
                        <button
                          onClick={() => deleteMealItem(cat.key, item.id)}
                          className="text-stone-300 hover:text-rose-600 p-1 transition-colors"
                          title="Löschen"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MODAL: Mahlzeit erfassen (Freifeld, KI-Foto, Barcode) */}
      {modalMode && modalMode !== 'burned' && (
        <MealEntryModal
          initialMode={modalMode}
          activeMealKey={activeMealKey}
          onClose={() => setModalMode(null)}
          onSave={(item, mealKey) => {
            saveDayData(prev => ({
              ...prev,
              meals: {
                ...prev.meals,
                [mealKey]: [...(prev.meals?.[mealKey] || []), item]
              }
            }));
            setModalMode(null);
            showToast(`"${item.name}" erfasst!`);
          }}
          callAI={callAI}
          recipes={recipes}
          mealplanIndex={mealplanIndex}
          settings={settings}
          getDayPlan={getDayPlan}
          storageGet={storageGet}
        />
      )}

      {/* MODAL: Verbrannte Kalorien anpassen */}
      {modalMode === 'burned' && (
        <BurnedCaloriesModal
          currentBurned={burnedKcal}
          onClose={() => setModalMode(null)}
          onSave={(newBurned) => {
            saveDayData(prev => ({ ...prev, burnedKcal: newBurned }));
            setModalMode(null);
            showToast('Verbrannte Kalorien gespeichert');
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------- Circular SVG Calorie Gauge (Screenshot 1) ---------------------------------- */
function CalorieCircularGauge({ eaten, target }) {
  const radius = 64;
  const strokeWidth = 10;
  const normalizedTarget = Math.max(1, target);
  const ratio = Math.min(1, Math.max(0, eaten / normalizedTarget));

  // 240-degree arc from 150 deg to 390 deg
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - (ratio * arcLength);

  return (
    <div className="w-40 h-36 flex items-center justify-center">
      <svg className="w-full h-full" viewBox="0 0 160 140">
        {/* Background Arc */}
        <circle
          cx="80"
          cy="75"
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform="rotate(135 80 75)"
        />
        {/* Progress Arc */}
        <circle
          cx="80"
          cy="75"
          r={radius}
          fill="none"
          stroke="#059669"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(135 80 75)"
          className="transition-all duration-700 ease-out"
        />
      </svg>
    </div>
  );
}

/* ---------------------------------- Meal Entry Modal (Freifeld, KI-Foto, Barcode) ---------------------------------- */
function MealEntryModal({
  initialMode,
  activeMealKey,
  onClose,
  onSave,
  callAI,
  recipes = [],
  mealplanIndex = {},
  settings = {},
  getDayPlan,
  storageGet,
}) {
  const [tab, setTab] = useState(initialMode || 'free'); // 'free' | 'ai' | 'barcode'
  const [mealKey, setMealKey] = useState(activeMealKey || 'lunch');

  // Form Fields
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [portionGrams, setPortionGrams] = useState('');
  const [selectedFoodRef, setSelectedFoodRef] = useState(null);

  // Suggestions for Freifeld
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [plannedRecipes, setPlannedRecipes] = useState([]);
  const [shoppingItems, setShoppingItems] = useState([]);

  // AI State
  const [aiImage, setAiImage] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const fileInputRef = useRef(null);

  // Barcode State
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');
  const [scannedProduct, setScannedProduct] = useState(null);
  const [scannerActive, setScannerActive] = useState(false);
  const scannerRef = useRef(null);

  // Load planned recipes for today/future & shopping items
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const today = new Date();
      const pad = n => String(n).padStart(2, '0');
      const todayDk = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

      const recipeMap = new Map((recipes || []).map(r => [r.id, r]));
      const plannedList = [];
      const seenRecipeIds = new Set();

      // Dates in mealplanIndex >= todayDk
      const futureDates = Object.keys(mealplanIndex || {})
        .filter(dk => dk >= todayDk)
        .sort();

      for (const dk of futureDates) {
        let plan = null;
        try {
          if (typeof getDayPlan === 'function') {
            plan = await getDayPlan(dk);
          } else if (typeof storageGet === 'function') {
            plan = await storageGet(`mealplan:${dk}`, true, null);
          }
        } catch (_) {}

        if (plan) {
          for (const mt of ['breakfast', 'lunch', 'dinner']) {
            if (!plan[mt]) continue;
            for (const co of ['snack', 'main', 'dessert']) {
              const slot = plan[mt][co];
              if (slot && slot.recipeId && !seenRecipeIds.has(slot.recipeId)) {
                const rec = recipeMap.get(slot.recipeId);
                if (rec) {
                  seenRecipeIds.add(slot.recipeId);
                  plannedList.push({
                    id: rec.id,
                    title: rec.title,
                    nutrition: rec.nutrition || null,
                    servings: rec.servings || 1,
                    plannedDate: dk,
                  });
                }
              }
            }
          }
        }
      }

      // Also check recurring meal dish from settings
      if (settings?.recurringMealEnabled && settings?.recurringMealDish?.trim()) {
        const dishTitle = settings.recurringMealDish.trim().toLowerCase();
        const rec = (recipes || []).find(r => (r.title || '').trim().toLowerCase() === dishTitle);
        if (rec && !seenRecipeIds.has(rec.id)) {
          seenRecipeIds.add(rec.id);
          plannedList.push({
            id: rec.id,
            title: rec.title,
            nutrition: rec.nutrition || null,
            servings: rec.servings || 1,
          });
        }
      }

      // Load shopping items
      let shopItems = [];
      try {
        if (typeof storageGet === 'function') {
          shopItems = await storageGet('shopping_items_v2', true, []);
        }
      } catch (_) {}

      if (isMounted) {
        setPlannedRecipes(plannedList);
        setShoppingItems(shopItems || []);
      }
    })();

    return () => { isMounted = false; };
  }, [recipes, mealplanIndex, settings, getDayPlan, storageGet]);

  // Compute suggestions: Planned recipes first; otherwise shopping list ingredients; otherwise built-in foods
  const computeSuggestions = (query, currentPlanned = plannedRecipes, currentShop = shoppingItems) => {
    const q = (query || '').trim().toLowerCase();

    // 1. Priority: Recipes planned today or in the future
    const matchingPlanned = currentPlanned.filter(r =>
      !q || r.title.toLowerCase().includes(q)
    );

    if (matchingPlanned.length > 0) {
      return matchingPlanned.slice(0, 8).map(r => ({
        type: 'recipe',
        id: `recipe_${r.id}`,
        name: r.title,
        subtitle: r.nutrition?.kcal ? `${r.nutrition.kcal} kcal/Portion` : 'Rezept im Plan',
        badge: 'Im Plan',
        recipe: r,
      }));
    }

    // 2. Otherwise ("Ansonsten"): All ingredients from shopping list
    const matchingShopping = currentShop.filter(item =>
      !q || (item.name && item.name.toLowerCase().includes(q))
    );

    if (matchingShopping.length > 0) {
      return matchingShopping.slice(0, 8).map(item => {
        const builtinMatch = searchBuiltinFoods(item.name)[0];
        return {
          type: 'shopping',
          id: `shop_${item.id || item.name}`,
          name: item.name,
          subtitle: builtinMatch ? `${builtinMatch.per100g.kcal} kcal/100g` : (item.detail || 'Aus Einkaufsliste'),
          badge: 'Einkaufsliste',
          builtinFood: builtinMatch,
        };
      });
    }

    // 3. Fallback to built-in food database if query >= 2 chars
    if (q.length >= 2) {
      const builtin = searchBuiltinFoods(q);
      return builtin.slice(0, 8).map(b => ({
        type: 'builtin',
        id: `builtin_${b.id}`,
        name: b.name,
        subtitle: `${b.per100g.kcal} kcal/100g`,
        badge: 'Datenbank',
        builtinFood: b,
      }));
    }

    return [];
  };

  // Handle Autocomplete
  const handleNameChange = (val) => {
    setName(val);
    setSearchQuery(val);
    setSuggestions(computeSuggestions(val));
  };

  const handleFocus = () => {
    setSuggestions(computeSuggestions(name));
  };

  const selectSuggestion = (s) => {
    if (s.type === 'recipe') {
      const r = s.recipe;
      setName(r.title);
      setSelectedFoodRef(null);
      setPortionGrams('1 Portion');
      if (r.nutrition) {
        setKcal(r.nutrition.kcal ?? '');
        setProtein(r.nutrition.protein ?? '');
        setCarbs(r.nutrition.carbs ?? '');
        setFat(r.nutrition.fat ?? '');
      } else {
        setKcal('');
        setProtein('');
        setCarbs('');
        setFat('');
      }
    } else if (s.builtinFood) {
      const food = s.builtinFood;
      setSelectedFoodRef(food);
      setName(s.name || food.name);
      setPortionGrams(food.defaultGrams || 100);
      const p = calculatePortion(food.per100g, food.defaultGrams || 100);
      setKcal(p.kcal);
      setProtein(p.protein);
      setCarbs(p.carbs);
      setFat(p.fat);
    } else {
      setName(s.name);
      setSelectedFoodRef(null);
      setPortionGrams('');
    }
    setSuggestions([]);
  };

  const handlePortionChange = (grams) => {
    setPortionGrams(grams);
    if (selectedFoodRef) {
      const p = calculatePortion(selectedFoodRef.per100g, grams);
      setKcal(p.kcal);
      setProtein(p.protein);
      setCarbs(p.carbs);
      setFat(p.fat);
    }
  };

  // ---------------- AI Photo Handler ----------------
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read and compress image
    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = () => {
        // Resize to max 800px to keep payload and tokens small
        const maxDim = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64Data = dataUrl.split(',')[1];
        setAiImage({ dataUrl, base64Data, mimeType: 'image/jpeg' });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const analyzeWithAI = async () => {
    if (!aiImage) return;
    setAiLoading(true);
    setAiError('');

    // Extremely token-efficient strict prompt
    const prompt = "Bestimme Kalorien und Makros dieser Mahlzeit. Antworte AUSSCHLIESSLICH im JSON-Format ohne Markdown: {\"name\":\"kurzer deutscher Gerichtsname\",\"kcal\":Zahl,\"protein\":Zahl,\"carbs\":Zahl,\"fat\":Zahl}";

    try {
      let rawResult = null;
      if (typeof callAI === 'function') {
        rawResult = await callAI(prompt, false, 'gemini', {
          data: aiImage.base64Data,
          mimeType: aiImage.mimeType,
        });
      } else {
        // Fallback fetch
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            image: { data: aiImage.base64Data, mimeType: aiImage.mimeType },
            maxTokens: 200
          })
        });
        const data = await res.json();
        rawResult = data.text || '';
      }

      // Handle parsed object or JSON string
      let parsed = rawResult;
      if (typeof rawResult === 'string') {
        const cleaned = rawResult.replace(/```json|```/g, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Die KI konnte keine Nährwerte ermitteln.');
        parsed = JSON.parse(match[0]);
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Die KI konnte keine Nährwerte ermitteln.');
      }

      setName(parsed.name || 'Mahlzeit vom Foto');
      setKcal(parsed.kcal ?? 0);
      setProtein(parsed.protein ?? 0);
      setCarbs(parsed.carbs ?? 0);
      setFat(parsed.fat ?? 0);
      setSelectedFoodRef(null);
      setPortionGrams('1 Portion');

      // Switch to free tab to let user review
      setTab('free');
    } catch (err) {
      console.error(err);
      setAiError(err.message || 'Fehler bei der Foto-Analyse.');
    } finally {
      setAiLoading(false);
    }
  };

  // ---------------- Barcode Handler ----------------
  const lookupBarcode = async (code) => {
    if (!code) return;
    setBarcodeLoading(true);
    setBarcodeError('');
    try {
      const prod = await fetchProductByBarcode(code);
      setScannedProduct(prod);
      setSelectedFoodRef(prod);
      setName(prod.name);
      setPortionGrams(100);
      setKcal(prod.per100g.kcal);
      setProtein(prod.per100g.protein);
      setCarbs(prod.per100g.carbs);
      setFat(prod.per100g.fat);
      if (scannerActive) stopScanner();
    } catch (err) {
      setBarcodeError(err.message || 'Produkt nicht gefunden.');
    } finally {
      setBarcodeLoading(false);
    }
  };

  const startScanner = async () => {
    setScannerActive(true);
    setBarcodeError('');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode("barcode-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          lookupBarcode(decodedText);
          stopScanner();
        },
        () => {}
      );
    } catch (err) {
      console.error(err);
      setBarcodeError('Kamera konnte nicht gestartet werden.');
      setScannerActive(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        console.error('Stop scanner error', e);
      }
      scannerRef.current = null;
    }
    setScannerActive(false);
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.trim(),
      kcal: Number(kcal) || 0,
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fat: Number(fat) || 0,
      portionGrams: portionGrams ? String(portionGrams) : null,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }, mealKey);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md overflow-hidden shadow-2xl border border-stone-200 animate-scale-up" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-4 border-b border-stone-150 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus size={18} className="text-stone-900" />
            <h3 className="font-mono font-bold text-sm text-stone-900">Mahlzeit erfassen</h3>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </div>

        {/* 3 Tabs: Freifeld, KI-Foto, Barcode */}
        <div className="grid grid-cols-3 border-b border-stone-200 bg-stone-50 text-xs font-mono">
          <button
            onClick={() => { stopScanner(); setTab('free'); }}
            className={`py-3 flex items-center justify-center gap-1.5 font-semibold transition-colors ${
              tab === 'free' ? 'bg-white text-stone-900 border-b-2 border-stone-900' : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <Edit3 size={15} /> Freifeld
          </button>
          <button
            onClick={() => { stopScanner(); setTab('ai'); }}
            className={`py-3 flex items-center justify-center gap-1.5 font-semibold transition-colors ${
              tab === 'ai' ? 'bg-white text-emerald-700 border-b-2 border-emerald-600' : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <Camera size={15} /> KI-Foto
          </button>
          <button
            onClick={() => setTab('barcode')}
            className={`py-3 flex items-center justify-center gap-1.5 font-semibold transition-colors ${
              tab === 'barcode' ? 'bg-white text-stone-900 border-b-2 border-stone-900' : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <BarcodeIcon size={15} /> Barcode
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Meal Category Selector */}
          <div>
            <label className={labelCls}>Mahlzeit</label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {[
                { k: 'breakfast', l: 'Frühstück' },
                { k: 'lunch', l: 'Mittag' },
                { k: 'dinner', l: 'Abend' },
                { k: 'snack', l: 'Snack' },
              ].map(m => (
                <button
                  key={m.k}
                  type="button"
                  onClick={() => setMealKey(m.k)}
                  className={`py-2 px-1 text-center rounded-lg text-xs font-medium border transition-all ${
                    mealKey === m.k ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-200'
                  }`}
                >
                  {m.l}
                </button>
              ))}
            </div>
          </div>

          {/* TAB 1: FREIFELD */}
          {tab === 'free' && (
            <div className="space-y-3">
              <div className="relative">
                <label className={labelCls}>Bezeichnung / Gericht</label>
                <input
                  type="text"
                  placeholder="z.B. Haferflocken, Pizza, Apfel..."
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  onFocus={handleFocus}
                  className={inputCls + " mt-1"}
                />

                {/* Suggestions Dropdown */}
                {suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-stone-200 shadow-lg z-30 divide-y divide-stone-100 max-h-52 overflow-y-auto">
                    {suggestions.map(s => (
                      <div
                        key={s.id}
                        onMouseDown={e => {
                          e.preventDefault();
                          selectSuggestion(s);
                        }}
                        className="p-2.5 hover:bg-stone-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-bold shrink-0 ${
                            s.badge === 'Im Plan' ? 'bg-emerald-100 text-emerald-800' :
                            s.badge === 'Einkaufsliste' ? 'bg-rose-100 text-rose-800' :
                            'bg-stone-100 text-stone-600'
                          }`}>
                            {s.badge}
                          </span>
                          <span className="font-medium text-stone-900 truncate">{s.name}</span>
                        </div>
                        <span className="text-stone-400 font-mono shrink-0 ml-2">{s.subtitle}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedFoodRef && (
                <div>
                  <label className={labelCls}>Menge / Portion (Gramm)</label>
                  <input
                    type="number"
                    value={portionGrams}
                    onChange={e => handlePortionChange(e.target.value)}
                    placeholder="100"
                    className={inputCls + " mt-1"}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className={labelCls}>Kalorien (kcal)</label>
                  <input
                    type="number"
                    value={kcal}
                    onChange={e => setKcal(e.target.value)}
                    placeholder="0"
                    className={inputCls + " mt-1 font-mono font-bold text-stone-900"}
                  />
                </div>
                <div>
                  <label className={labelCls}>Eiweiß (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={protein}
                    onChange={e => setProtein(e.target.value)}
                    placeholder="0"
                    className={inputCls + " mt-1 font-mono"}
                  />
                </div>
                <div>
                  <label className={labelCls}>Kohlenh. (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={carbs}
                    onChange={e => setCarbs(e.target.value)}
                    placeholder="0"
                    className={inputCls + " mt-1 font-mono"}
                  />
                </div>
                <div>
                  <label className={labelCls}>Fett (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={fat}
                    onChange={e => setFat(e.target.value)}
                    placeholder="0"
                    className={inputCls + " mt-1 font-mono"}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: KI-FOTO */}
          {tab === 'ai' && (
            <div className="space-y-4 text-center">
              <div className="p-4 border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50 flex flex-col items-center justify-center">
                {aiImage ? (
                  <div className="space-y-3 w-full">
                    <img
                      src={aiImage.dataUrl}
                      alt="Mahlzeit"
                      className="max-h-56 mx-auto rounded-xl object-contain shadow"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-stone-500 hover:text-stone-900 font-mono underline"
                    >
                      Anderes Foto wählen
                    </button>
                  </div>
                ) : (
                  <div className="py-6 space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                      <Camera size={28} />
                    </div>
                    <div>
                      <h4 className="font-bold text-stone-900 text-sm">Foto deiner Mahlzeit</h4>
                      <p className="text-xs text-stone-500 mt-1 max-w-xs mx-auto">
                        Mache ein Foto oder wähle ein Bild. Die KI schätzt die Kalorien und Nährwerte tokensparend und präzise.
                      </p>
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-mono uppercase tracking-wide text-xs font-semibold rounded-xl shadow transition-all active:scale-95"
                    >
                      Foto aufnehmen / wählen
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>

              {aiError && (
                <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl flex items-center gap-2 text-left">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              {aiImage && (
                <button
                  onClick={analyzeWithAI}
                  disabled={aiLoading}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-mono uppercase tracking-wide text-xs font-bold rounded-xl shadow flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> KI analysiert Mahlzeit...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> Nährwerte mit KI ermitteln
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* TAB 3: BARCODE */}
          {tab === 'barcode' && (
            <div className="space-y-4">
              {/* Scanner Viewport */}
              {scannerActive ? (
                <div className="space-y-2">
                  <div id="barcode-reader" className="w-full rounded-xl overflow-hidden border border-stone-200" />
                  <button
                    onClick={stopScanner}
                    className="w-full py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg text-xs font-mono font-semibold"
                  >
                    Kamera beenden
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={startScanner}
                    className="flex-1 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-mono uppercase text-xs font-semibold flex items-center justify-center gap-2 shadow"
                  >
                    <Camera size={16} /> Barcode mit Kamera scannen
                  </button>
                </div>
              )}

              {/* Manual Barcode Input */}
              <div>
                <label className={labelCls}>Oder Barcode (EAN) eingeben</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="z.B. 4008400401829"
                    value={barcodeInput}
                    onChange={e => setBarcodeInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && lookupBarcode(barcodeInput)}
                    className={inputCls}
                  />
                  <button
                    onClick={() => lookupBarcode(barcodeInput)}
                    disabled={barcodeLoading || !barcodeInput.trim()}
                    className="px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-mono font-semibold disabled:opacity-40"
                  >
                    {barcodeLoading ? <Loader2 size={16} className="animate-spin" /> : 'Suchen'}
                  </button>
                </div>
              </div>

              {barcodeError && (
                <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{barcodeError}</span>
                </div>
              )}

              {/* Scanned Product Info */}
              {scannedProduct && (
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-3">
                  <div className="flex items-center gap-3">
                    {scannedProduct.imageUrl && (
                      <img src={scannedProduct.imageUrl} alt="" className="w-12 h-12 object-contain bg-white rounded-lg border border-emerald-100" />
                    )}
                    <div>
                      <div className="font-bold text-sm text-stone-900">{scannedProduct.name}</div>
                      <div className="text-xs text-stone-500 font-mono">
                        {scannedProduct.per100g.kcal} kcal / 100g
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Menge in Gramm</label>
                    <input
                      type="number"
                      value={portionGrams}
                      onChange={e => handlePortionChange(e.target.value)}
                      placeholder="100"
                      className={inputCls + " mt-1"}
                    />
                  </div>

                  <div className="text-xs font-mono font-bold text-stone-800 flex justify-between pt-1 border-t border-emerald-200">
                    <span>Ergebnis:</span>
                    <span>{kcal} kcal ({protein}g E · {carbs}g K · {fat}g F)</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-stone-600 hover:text-stone-900 text-xs font-mono uppercase font-semibold"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || Number(kcal) < 0}
            className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-mono uppercase tracking-wide font-bold shadow disabled:opacity-40"
          >
            Mahlzeit eintragen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Burned Calories Modal ---------------------------------- */
function BurnedCaloriesModal({ currentBurned, onClose, onSave }) {
  const [val, setVal] = useState(currentBurned || '');

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-5 space-y-4">
        <h3 className="font-bold text-stone-900 text-base">Verbrannte Kalorien anpassen</h3>
        <p className="text-xs text-stone-500">
          Trage hier Kalorien ein, die du heute durch Sport oder Aktivität verbrannt hast.
        </p>

        <div>
          <label className={labelCls}>Aktivitätskalorien (kcal)</label>
          <input
            type="number"
            autoFocus
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder="z.B. 250"
            className={inputCls + " mt-1 font-mono text-lg font-bold"}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-stone-600 hover:bg-stone-100 rounded-lg text-xs font-mono uppercase font-semibold"
          >
            Abbrechen
          </button>
          <button
            onClick={() => onSave(Math.max(0, Number(val) || 0))}
            className="flex-1 py-2 bg-stone-900 text-white rounded-lg text-xs font-mono uppercase font-semibold"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
