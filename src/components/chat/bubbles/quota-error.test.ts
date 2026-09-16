import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectQuotaError, resetCountdown } from './quota-error.ts';

const MUSE_429 =
  '[muse error] API error 429 [request_id=5e4998f9-c4f0-436e-bd62-8b44d6868b94]: ' +
  'Subscription quota exhausted. Your usage window resets at 2026-09-12T17:35:09Z. (rate_limit_error)';

describe('detectQuotaError', () => {
  it('detects the Muse 429 with provider + reset instant', () => {
    const q = detectQuotaError(MUSE_429);
    assert.ok(q);
    assert.equal(q.provider, 'Muse');
    assert.equal(q.resetsAt?.toISOString(), '2026-09-12T17:35:09.000Z');
  });

  it('detects generic provider shapes', () => {
    assert.ok(detectQuotaError('API error 429: rate limit exceeded, retry later'));
    assert.ok(detectQuotaError('Out of credit — please top up and retry'));
    assert.ok(detectQuotaError('credits exhausted for this key'));
  });

  it('ignores ordinary text and bare numbers', () => {
    assert.equal(detectQuotaError('The answer is 42, done.'), null);
    assert.equal(detectQuotaError('See error 429 in the docs'), null);
    assert.equal(detectQuotaError(''), null);
  });

  // 2026-09-16 — the cockpit hid two complete, correct answers behind a
  // quota card. The daemon had NOT rate-limited anything: /health showed
  // zero paused pools and the local CLI was authenticated. The agent had
  // been asked which free Bitcoin API to use, so it said "rate limit"
  // and "429" the way any answer on that subject must.
  it('does not swallow an answer that TALKS about rate limits', () => {
    const answer =
      '**Maestro: cero dependencias.** No aparece en ningun fichero del repo.\n\n' +
      'Hoy todo va por `explorer-wallet-service` (nuestro indexador) con failover a `mempool.space`.\n\n' +
      '- **Primario**: `explorerWalletService` (RPC directo del nodo, sin rate limit).\n' +
      '- `mempool-service.js` ya autolimita a 600ms entre peticiones con backoff 2s/5s en 429.\n';
    assert.equal(detectQuotaError(answer), null);
  });

  it('does not fire on prose that names an exhausted quota late', () => {
    const answer =
      'He revisado los tres proveedores y te dejo el resumen abajo, con el coste de cada uno.\n\n' +
      'El plan gratuito de QuickNode se queda corto: en cuanto pasas de 300 req/s la key ' +
      'queda out of credits y el endpoint responde too many requests.';
    assert.equal(detectQuotaError(answer), null);
  });

  it('still fires when the envelope opens the message', () => {
    assert.ok(detectQuotaError('Claude AI usage limit reached|1789560000'));
    assert.ok(detectQuotaError('[codex error] HTTP 429: too many requests'));
    assert.ok(
      detectQuotaError(
        'API error 429 [request_id=abc]: quota exhausted. Your usage window resets at 2026-09-16T17:00:00Z.',
      ),
    );
  });
});

describe('resetCountdown', () => {
  it('formats minutes and hours', () => {
    const now = Date.parse('2026-09-12T17:00:00Z');
    assert.equal(resetCountdown(new Date('2026-09-12T17:35:09Z'), now), 'en 35 min');
    assert.equal(resetCountdown(new Date('2026-09-12T19:05:00Z'), now), 'en 2 h 05 min');
  });

  it('returns null for past or unknown resets', () => {
    assert.equal(resetCountdown(null), null);
    assert.equal(resetCountdown(new Date('2026-09-12T16:00:00Z'), Date.parse('2026-09-12T17:00:00Z')), null);
  });
});
