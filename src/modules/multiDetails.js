// Hilfsfunktionen für Mehrfachdetails bei Einkaufsprodukten

/**
 * Normalizes item details to a clean array of strings.
 * Ensures backwards compatibility with single string 'detail' and object arrays.
 */
export function getItemDetails(item) {
  if (!item) return [];
  if (Array.isArray(item.details)) {
    return item.details.map(d => {
      if (typeof d === 'string') return d.trim();
      if (d && typeof d.text === 'string') return d.text.trim();
      return String(d || '').trim();
    }).filter(Boolean);
  }
  if (typeof item.detail === 'string' && item.detail.trim() !== '') {
    if (item.detail.includes(' · ')) {
      return item.detail.split(' · ').map(s => s.trim()).filter(Boolean);
    }
    return [item.detail.trim()];
  }
  return [];
}

/**
 * Adds a new detail to the item without duplicating or adding empty strings.
 * Tolerates either an array or an object with a .details array.
 */
export function addDetailToItem(currentDetails = [], newDetail) {
  const list = Array.isArray(currentDetails) ? currentDetails : (currentDetails?.details || []);
  const rawText = typeof newDetail === 'string' ? newDetail : (newDetail?.text || '');
  const trimmed = rawText.trim();
  if (!trimmed) return list;
  const exists = list.some(d => {
    const text = typeof d === 'string' ? d : d?.text;
    return (text || '').toLowerCase() === trimmed.toLowerCase();
  });
  if (exists) return list;
  return [...list, trimmed];
}

/**
 * Updates an existing detail at index.
 */
export function updateDetailInItem(currentDetails = [], index, updatedDetail) {
  const list = Array.isArray(currentDetails) ? currentDetails : (currentDetails?.details || []);
  const rawText = typeof updatedDetail === 'string' ? updatedDetail : (updatedDetail?.text || '');
  const trimmed = rawText.trim();
  if (!trimmed) {
    return list.filter((_, idx) => idx !== index);
  }
  return list.map((d, idx) => idx === index ? trimmed : d);
}

/**
 * Removes a detail at index or matching value.
 */
export function removeDetailFromItem(currentDetails = [], index) {
  const list = Array.isArray(currentDetails) ? currentDetails : (currentDetails?.details || []);
  return list.filter((d, idx) => {
    if (typeof index === 'number') return idx !== index;
    return d !== index && d?.id !== index && d?.text !== index;
  });
}

/**
 * Formats details for compact display / legacy fallback.
 */
export function formatDetailsSummary(details = []) {
  const list = Array.isArray(details) ? details : (details?.details || []);
  return list.map(d => typeof d === 'string' ? d : d?.text || '').filter(Boolean).join(' · ');
}
