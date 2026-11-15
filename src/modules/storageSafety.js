/**
 * Safe storage read helper that tracks whether a loaded value came from
 * authoritative remote storage or from a local cache / fallback, preventing
 * startup migrations from overwriting remote KV data after transient load errors.
 */

export async function storageGetDetailed(key, shared, fallback, deps = {}) {
  const fetchImpl = deps.fetch ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  const ls = deps.localStorage ?? (typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null);
  const winStorage = deps.windowStorage ?? (typeof globalThis.window !== 'undefined' ? globalThis.window.storage : null);

  try {
    if (winStorage && typeof winStorage.get === 'function') {
      const r = await winStorage.get(key, shared);
      if (r && r.value != null) {
        return { value: JSON.parse(r.value), source: 'window-storage', canPersist: true, error: null };
      }
      return { value: fallback, source: 'window-storage', canPersist: true, error: null };
    }

    if (shared) {
      let remoteError = null;
      let remoteReached = false;

      if (fetchImpl) {
        try {
          const res = await fetchImpl(`/api/storage?key=${encodeURIComponent(key)}`);
          if (res.ok) {
            remoteReached = true;
            const data = await res.json();
            if (data && 'value' in data && data.value !== null) {
              try {
                ls?.setItem(`shared_${key}`, JSON.stringify(data.value));
              } catch (lsErr) {
                console.warn(`localStorage cache write failed for shared_${key}:`, lsErr);
              }
              return { value: data.value, source: 'remote', canPersist: true, error: null };
            }
          } else {
            remoteError = `HTTP ${res.status}`;
          }
        } catch (apiError) {
          remoteError = apiError?.message || 'Netzwerkfehler';
          console.warn('KV storage get failed, falling back to local cache:', apiError);
        }
      } else {
        remoteError = 'fetch unavailable';
      }

      const cachedVal = ls?.getItem(`shared_${key}`) ?? null;
      if (cachedVal !== null) {
        return {
          value: JSON.parse(cachedVal),
          source: 'local-cache',
          canPersist: false,
          error: remoteError,
        };
      }

      if (remoteReached) {
        return { value: fallback, source: 'remote-empty', canPersist: true, error: null };
      }

      return {
        value: fallback,
        source: 'fallback',
        canPersist: false,
        error: remoteError || 'Remote storage unavailable',
      };
    }

    const localVal = ls?.getItem(key) ?? null;
    if (localVal) {
      return { value: JSON.parse(localVal), source: 'local', canPersist: true, error: null };
    }
    return { value: fallback, source: 'fallback', canPersist: true, error: null };
  } catch (e) {
    return {
      value: fallback,
      source: 'fallback',
      canPersist: !shared,
      error: e?.message || 'Storage read error',
    };
  }
}
