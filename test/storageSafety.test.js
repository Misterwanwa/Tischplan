import test from 'node:test';
import assert from 'node:assert/strict';
import { storageGetDetailed } from '../src/modules/storageSafety.js';

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
  };
}

test('storageGetDetailed: HTTP 500 with empty localStorage returns fallback with canPersist=false', async () => {
  const ls = createMemoryStorage();
  const res = await storageGetDetailed('settings', true, { people: ['Person 1'] }, {
    localStorage: ls,
    fetch: async () => ({ ok: false, status: 500 }),
  });
  assert.equal(res.source, 'fallback');
  assert.equal(res.canPersist, false);
  assert.equal(res.error, 'HTTP 500');
  assert.deepEqual(res.value, { people: ['Person 1'] });
});

test('storageGetDetailed: network error with localStorage cache returns local-cache with canPersist=false', async () => {
  const ls = createMemoryStorage({ shared_settings: JSON.stringify({ people: ['Bubu', 'Dudu'] }) });
  const res = await storageGetDetailed('settings', true, { people: ['Person 1'] }, {
    localStorage: ls,
    fetch: async () => { throw new Error('offline'); },
  });
  assert.equal(res.source, 'local-cache');
  assert.equal(res.canPersist, false);
  assert.equal(res.error, 'offline');
  assert.deepEqual(res.value, { people: ['Bubu', 'Dudu'] });
});

test('storageGetDetailed: remote 200 with value updates cache and sets canPersist=true', async () => {
  const ls = createMemoryStorage();
  const remoteSettings = { people: ['Bubu Einhorn', 'Dudu Zucker'], cookbooks: ['Vegan'] };
  const res = await storageGetDetailed('settings', true, {}, {
    localStorage: ls,
    fetch: async () => ({ ok: true, json: async () => ({ value: remoteSettings }) }),
  });
  assert.equal(res.source, 'remote');
  assert.equal(res.canPersist, true);
  assert.deepEqual(res.value, remoteSettings);
  assert.deepEqual(JSON.parse(ls.getItem('shared_settings')), remoteSettings);
});

test('storageGetDetailed: remote 200 with null and no cache sets remote-empty with canPersist=true', async () => {
  const ls = createMemoryStorage();
  const res = await storageGetDetailed('settings', true, { default: true }, {
    localStorage: ls,
    fetch: async () => ({ ok: true, json: async () => ({ value: null }) }),
  });
  assert.equal(res.source, 'remote-empty');
  assert.equal(res.canPersist, true);
  assert.deepEqual(res.value, { default: true });
});

test('storageGetDetailed: remote 200 with null but existing cache preserves cache and sets canPersist=false', async () => {
  const ls = createMemoryStorage({ shared_settings: JSON.stringify({ people: ['Bubu', 'Dudu'] }) });
  const res = await storageGetDetailed('settings', true, { default: true }, {
    localStorage: ls,
    fetch: async () => ({ ok: true, json: async () => ({ value: null }) }),
  });
  assert.equal(res.source, 'local-cache');
  assert.equal(res.canPersist, false);
  assert.deepEqual(res.value, { people: ['Bubu', 'Dudu'] });
});
