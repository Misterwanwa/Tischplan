// Hilfsfunktionen für Mehrfachdetails bei Einkaufsprodukten

/**
 * Normalizes item details to a clean array of strings.
 * Ensures backwards compatibility with single string 'detail'.
 */
export function getItemDetails(item) {
  if (!item) return [];
  if (Array.isArray(item.details)) {
    return item.details.filter(d => typeof d === 'string' && d.trim() !== '');
  }
  if (typeof item.detail === 'string' && item.detail.trim() !== '') {
    // If it was already joined by bullets or bullets with spaces
    if (item.detail.includes(' · ')) {
      return item.detail.split(' · ').map(s => s.trim()).filter(Boolean);
    }
    return [item.detail.trim()];
  }
  return [];
}

/**
 * Adds a new detail to the item without duplicating or adding empty strings.
 */
export function addDetailToItem(currentDetails = [], newDetail) {
  const trimmed = (newDetail || '').trim();
  if (!trimmed) return currentDetails;
  const exists = currentDetails.some(d => d.toLowerCase() === trimmed.toLowerCase());
  if (exists) return currentDetails;
  return [...currentDetails, trimmed];
}

/**
 * Updates an existing detail at index.
 */
export function updateDetailInItem(currentDetails = [], index, updatedDetail) {
  const trimmed = (updatedDetail || '').trim();
  if (!trimmed) {
    // If emptied, remove it
    return currentDetails.filter((_, idx) => idx !== index);
  }
  return currentDetails.map((d, idx) => idx === index ? trimmed : d);
}

/**
 * Removes a detail at index.
 */
export function removeDetailFromItem(currentDetails = [], index) {
  return currentDetails.filter((_, idx) => idx !== index);
}

/**
 * Formats details for compact display / legacy fallback
 */
export function formatDetailsSummary(details = []) {
  return details.join(' · ');
}
