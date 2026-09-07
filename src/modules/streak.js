// Berechnungsmodul für Kalorien-Streaks
// Berechnet Streaks deterministisch direkt aus den Tagesdaten der Mahlzeiten-Logs.

function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatDateKey(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // midday to avoid DST transitions
}

export function getOffsetDayKey(key, offsetDays) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + offsetDays);
  return formatDateKey(d);
}

/**
 * Checks whether a day has at least one valid logged meal.
 */
export function isDayActive(dayEntry) {
  if (!dayEntry || !dayEntry.meals) return false;
  const { breakfast, lunch, dinner, snack } = dayEntry.meals;
  const count = (breakfast?.length || 0) +
                (lunch?.length || 0) +
                (dinner?.length || 0) +
                (snack?.length || 0);
  return count > 0;
}

/**
 * Calculates current streak, longest streak, and active day counts.
 * 
 * @param {Object} dayLogs - Object mapping 'YYYY-MM-DD' to day data
 * @param {Object} [options]
 * @param {string|Date} [options.today] - Override reference today (defaults to local date)
 * @param {string[]} [options.rescuedDays] - Optional array of rescued date keys (prepared for future minigames)
 * @returns {Object} Streak calculation summary
 */
export function calculateStreak(dayLogs = {}, options = {}) {
  const todayKey = options.today
    ? (typeof options.today === 'string' ? options.today : formatDateKey(options.today))
    : formatDateKey(new Date());

  const rescuedSet = new Set(Array.isArray(options.rescuedDays) ? options.rescuedDays : []);

  // Collect all valid active past and present days (ignore future days for streaks)
  const activeDaysSet = new Set();
  let totalActiveDays = 0;

  for (const [key, entry] of Object.entries(dayLogs)) {
    if (key > todayKey) continue; // Future logs do not count for current streak
    if (isDayActive(entry) || rescuedSet.has(key)) {
      activeDaysSet.add(key);
      totalActiveDays++;
    }
  }

  // Also consider rescued days in past/today
  for (const key of rescuedSet) {
    if (key <= todayKey && !activeDaysSet.has(key)) {
      activeDaysSet.add(key);
      totalActiveDays++;
    }
  }

  const sortedActiveDays = Array.from(activeDaysSet).sort();

  // 1. Calculate current streak
  let currentStreak = 0;
  let status = 'broken'; // 'active_today' | 'active_waiting_today' | 'broken'

  const yesterdayKey = getOffsetDayKey(todayKey, -1);

  if (activeDaysSet.has(todayKey)) {
    // Today has meals -> streak is alive and includes today
    status = 'active_today';
    currentStreak = 1;
    let checkKey = yesterdayKey;
    while (activeDaysSet.has(checkKey)) {
      currentStreak++;
      checkKey = getOffsetDayKey(checkKey, -1);
    }
  } else if (activeDaysSet.has(yesterdayKey)) {
    // Yesterday had meals, today is not logged yet -> streak stays alive until midnight!
    status = 'active_waiting_today';
    let checkKey = yesterdayKey;
    while (activeDaysSet.has(checkKey)) {
      currentStreak++;
      checkKey = getOffsetDayKey(checkKey, -1);
    }
  } else {
    // Neither today nor yesterday had meals -> streak is 0
    currentStreak = 0;
    status = 'broken';
  }

  // 2. Calculate longest streak across all recorded history
  let longestStreak = 0;
  let currentRun = 0;
  let expectedNextDay = null;

  for (const dayKey of sortedActiveDays) {
    if (!expectedNextDay || dayKey === expectedNextDay) {
      currentRun++;
    } else {
      currentRun = 1;
    }
    if (currentRun > longestStreak) {
      longestStreak = currentRun;
    }
    expectedNextDay = getOffsetDayKey(dayKey, 1);
  }

  // In case current streak is longer than past historical runs
  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  return {
    currentStreak,
    longestStreak,
    status,
    isActiveToday: activeDaysSet.has(todayKey),
    totalActiveDays,
    todayKey,
    yesterdayKey,
    // Prepared for future minigames / streak rescues
    rescuedCount: rescuedSet.size,
    rescuedDays: Array.from(rescuedSet),
  };
}
