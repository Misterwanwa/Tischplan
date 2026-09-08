import { getOffsetDayKey, isDayActive } from './streak.js';

// One shared calendar for daily limits, independent of a device's time zone.
export const GAME_TIME_ZONE = 'Europe/Berlin';
export function gameDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: GAME_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export const CHALLENGES = {
  no_snacks: {
    title: '7 Tage keine Snacks', days: 7, points: 25, required: 7,
    description: 'Sieben Tage normale Mahlzeiten erfassen, keine Snack-Einträge und jeden Tag als vollständig bestätigen. Leere Tage zählen nicht.',
  },
  vegetables: {
    title: 'Gemüse-Challenge', days: 5, points: 10, required: 5,
    description: 'Fünf Tage in Folge jeweils eine Gemüseportion mit mehr als 0 kcal erfassen und den Tag als vollständig bestätigen.',
  },
  deficit: {
    title: '100 loss', days: 15, points: 15, required: 3,
    description: 'Innerhalb von 15 Tagen an drei aufeinanderfolgenden, vollständig erfassten Tagen mindestens 100 kcal unter deinem geschätzten Erhaltungsbedarf bleiben. Ein größeres Defizit bringt keine zusätzlichen Punkte.',
  },
};

export const CHARACTER_ASSETS = ['/characters/1.png', '/characters/2.jpg', '/characters/3.png'];

export function mealItems(day) {
  return Object.values(day?.meals || {}).flatMap(items => Array.isArray(items) ? items : []);
}

export function hasNormalMeal(day) {
  return ['breakfast', 'lunch', 'dinner'].some(key =>
    (day?.meals?.[key] || []).some(item => Number(item.kcal) > 0));
}

export function qualifiesForChallenge(kind, day) {
  if (!day?.trackingComplete || !hasNormalMeal(day)) return false;
  const items = mealItems(day);
  if (kind === 'no_snacks') return (day.meals?.snack || []).length === 0;
  if (kind === 'vegetables') {
    return items.some(item => item.isVegetable === true && Number(item.kcal) > 0);
  }
  if (kind === 'deficit') {
    const maintenance = Number(day.maintenanceKcal);
    const eaten = items.reduce((sum, item) => sum + Math.max(0, Number(item.kcal) || 0), 0);
    // Exercise is not counted again: maintenance already includes normal activity.
    return Number.isFinite(maintenance) && maintenance > 0 && eaten > 0 && maintenance - eaten >= 100;
  }
  return false;
}

// Only closed calendar days can complete a challenge. Logging a snack later on
// the same day must not leave an already awarded no-snack bonus behind.
export function evaluateChallenge(challenge, logs, today = gameDay()) {
  if (challenge.status !== 'active') return challenge;
  const rule = CHALLENGES[challenge.kind];
  if (!rule) return { ...challenge, status: 'failed', progress: 0 };
  const lastClosedDay = getOffsetDayKey(today, -1);
  const lastDay = lastClosedDay < challenge.end_day ? lastClosedDay : challenge.end_day;
  let run = 0;
  let best = 0;
  for (let day = challenge.start_day; day <= lastDay; day = getOffsetDayKey(day, 1)) {
    if (qualifiesForChallenge(challenge.kind, logs[day])) {
      run++;
      best = Math.max(best, run);
      if (run >= rule.required) {
        return { ...challenge, status: 'completed', progress: run, points: rule.points };
      }
    } else {
      run = 0;
      if (challenge.kind !== 'deficit') {
        return { ...challenge, status: 'failed', progress: best, points: 0 };
      }
    }
  }
  return {
    ...challenge,
    status: today > challenge.end_day ? 'expired' : 'active',
    progress: challenge.kind === 'deficit' ? run : best,
    points: 0,
  };
}

export function streakAwardEntries(logs, today = gameDay()) {
  return Object.entries(logs).filter(([day, log]) => day <= today && isDayActive(log))
    .map(([day, log]) => ({ day, points: log.firstTrackedOn === day ? 5 : 1 }));
}
