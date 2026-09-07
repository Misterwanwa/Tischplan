import { test } from 'node:test';
import assert from 'node:assert';
import { validateSafeProxyUrl } from '../src/modules/security.js';

test('Security: Non-HTTPS URLs are rejected', () => {
  assert.strictEqual(validateSafeProxyUrl('http://example.com').safe, false);
  assert.strictEqual(validateSafeProxyUrl('ftp://example.com').safe, false);
  assert.strictEqual(validateSafeProxyUrl('javascript:alert(1)').safe, false);
});

test('Security: Localhost and internal IP ranges are rejected', () => {
  assert.strictEqual(validateSafeProxyUrl('https://localhost:3000').safe, false);
  assert.strictEqual(validateSafeProxyUrl('https://127.0.0.1/admin').safe, false);
  assert.strictEqual(validateSafeProxyUrl('https://10.0.0.1/secret').safe, false);
  assert.strictEqual(validateSafeProxyUrl('https://192.168.1.1/').safe, false);
  assert.strictEqual(validateSafeProxyUrl('https://172.16.0.5/').safe, false);
  assert.strictEqual(validateSafeProxyUrl('https://169.254.169.254/latest/meta-data/').safe, false);
  assert.strictEqual(validateSafeProxyUrl('https://[::1]/').safe, false);
});

test('Security: Legitimate HTTPS recipe sites are accepted', () => {
  assert.strictEqual(validateSafeProxyUrl('https://www.chefkoch.de/rezepte/123/lasagne.html').safe, true);
  assert.strictEqual(validateSafeProxyUrl('https://eatsmarter.de/rezepte/pasta').safe, true);
});
