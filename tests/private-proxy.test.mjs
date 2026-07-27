import assert from 'node:assert/strict';
import { createHash, createHmac, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ProxyError, createSignedUpstreamRequest, testing } from '../cloudflare/lib/proxy.js';
import { createPrivateApiForwardRequest } from '../functions/_middleware.js';

globalThis.crypto ||= webcrypto;

test('canonical query is stable and excludes only the signature', () => {
  const query = new URLSearchParams('z=last&a=two&a=one&_proxy_sig=ignored');
  assert.equal(testing.canonicalQuery(query), 'a=one&a=two&z=last');
});

test('upstream validation only permits deployed Google Apps Script URLs', () => {
  assert.equal(
    testing.validateUpstream('https://script.google.com/macros/s/example-deployment/exec').origin,
    'https://script.google.com'
  );
  assert.throws(
    () => testing.validateUpstream('https://script.google.com.attacker.example/macros/s/example/exec'),
    ProxyError
  );
  assert.throws(() => testing.validateUpstream('http://script.google.com/macros/s/example/exec'), ProxyError);
});

test('signed upstream requests bind identity, query and body hash', async () => {
  const request = new Request('https://private.example/api/library?action=getBookList', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: 'filterType=all'
  });
  const signed = await createSignedUpstreamRequest(
    request,
    'https://script.google.com/macros/s/example-deployment/exec',
    'a-test-secret-that-is-longer-than-thirty-two-bytes',
    { email: 'owner@example.com' }
  );
  const url = new URL(signed.url);

  assert.equal(signed.method, 'POST');
  assert.equal(url.searchParams.get('action'), 'getBookList');
  assert.equal(url.searchParams.get('_proxy_method'), 'POST');
  assert.equal(url.searchParams.get('_proxy_email'), 'owner@example.com');
  assert.match(url.searchParams.get('_proxy_nonce'), /^[A-Za-z0-9_-]{20,}$/);
  assert.match(url.searchParams.get('_proxy_body_sha256'), /^[a-f0-9]{64}$/);
  assert.match(url.searchParams.get('_proxy_sig'), /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(await signed.text(), 'filterType=all');
});

test('callers cannot inject reserved proxy parameters', async () => {
  const request = new Request('https://private.example/api/running?_proxy_email=attacker@example.com');
  await assert.rejects(
    createSignedUpstreamRequest(
      request,
      'https://script.google.com/macros/s/example-deployment/exec',
      'a-test-secret-that-is-longer-than-thirty-two-bytes',
      { email: 'owner@example.com' }
    ),
    error => error instanceof ProxyError && error.status === 400
  );
});

test('preview API forwarding is restricted to the production Pages origin', async () => {
  const request = new Request('https://private.myserver-private.pages.dev/api/library?action=getBookList', {
    headers: { 'cf-access-jwt-assertion': 'verified-access-token' }
  });
  const forwarded = createPrivateApiForwardRequest(request, 'https://myserver-private.pages.dev');

  assert.equal(forwarded.url, 'https://myserver-private.pages.dev/api/library?action=getBookList');
  assert.equal(forwarded.headers.get('cf-access-jwt-assertion'), 'verified-access-token');
  assert.equal(createPrivateApiForwardRequest(
    new Request('https://private.myserver-private.pages.dev/library/'),
    'https://myserver-private.pages.dev'
  ), null);
  assert.throws(
    () => createPrivateApiForwardRequest(request, 'https://attacker.example'),
    error => error.status === 503
  );
  assert.throws(
    () => createPrivateApiForwardRequest(
      new Request('https://myserver-private.pages.dev/api/library'),
      'https://myserver-private.pages.dev'
    ),
    error => error.status === 503
  );
});

test('Apps Script verifier accepts a signed form body and rejects tampering', async () => {
  const secret = 'a-test-secret-that-is-longer-than-thirty-two-bytes';
  const cache = new Map();
  const signedBytes = buffer => [...buffer].map(value => value > 127 ? value - 256 : value);
  const Utilities = {
    Charset: { UTF_8: 'UTF-8' },
    DigestAlgorithm: { SHA_256: 'SHA-256' },
    computeDigest(_algorithm, value) {
      return signedBytes(createHash('sha256').update(value).digest());
    },
    computeHmacSha256Signature(value, key) {
      return signedBytes(createHmac('sha256', key).update(value).digest());
    },
    base64EncodeWebSafe(values) {
      return Buffer.from(values.map(value => value < 0 ? value + 256 : value)).toString('base64url');
    }
  };
  const PropertiesService = {
    getScriptProperties: () => ({ getProperty: key => key === 'MY_SERVER_PROXY_SECRET' ? secret : '' })
  };
  const LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
  };
  const CacheService = {
    getScriptCache: () => ({
      get: key => cache.get(key) || null,
      put: (key, value) => cache.set(key, value)
    })
  };
  const source = await readFile(new URL('../cloudflare/apps-script-proxy-auth.gs', import.meta.url), 'utf8');
  const loadVerifier = new Function(
    'Utilities', 'PropertiesService', 'LockService', 'CacheService',
    `${source}\nreturn { verifyCloudProxy_ };`
  );
  const { verifyCloudProxy_ } = loadVerifier(Utilities, PropertiesService, LockService, CacheService);
  const request = new Request('https://private.example/api/library?action=getBookList', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: 'filterType=all&filterValue='
  });
  const signed = await createSignedUpstreamRequest(
    request,
    'https://script.google.com/macros/s/example-deployment/exec',
    secret,
    { email: 'owner@example.com' }
  );
  const url = new URL(signed.url);
  const body = await signed.text();
  const event = { queryString: url.search.slice(1), postData: { contents: body } };

  assert.equal(verifyCloudProxy_(event, 'POST'), true);
  assert.equal(verifyCloudProxy_({ ...event, postData: { contents: `${body}tampered` } }, 'POST'), false);
});
