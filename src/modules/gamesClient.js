export async function gamesRequest(profile, body = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api/games?profile=${profile}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify({ ...body, profile }) : undefined,
      signal: controller.signal,
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error('Punkte-API nicht erreichbar. Lokal muss der Cloudflare-Pages-Server laufen; Training ist ohne Backend möglich.'); }
    if (!response.ok) {
      const error = new Error(data.error || 'Punkte konnten nicht synchronisiert werden.');
      error.code = data.code;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Zeitüberschreitung. Bitte erneut versuchen; eine begonnene Tagesrunde bleibt reserviert.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
