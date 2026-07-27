/**
 * Copy these helpers into BOTH the Library and Running Apps Script projects.
 * Set MY_SERVER_PROXY_SECRET in Project Settings > Script properties to the
 * same random value stored as APPS_SCRIPT_HMAC_SECRET in Cloudflare.
 *
 * Call requireCloudProxy_(e) before every read or write action in doGet/doPost.
 * Do not deploy until unsigned requests have been verified to fail closed.
 */

function requireCloudProxy_(e, expectedMethod) {
  if (!verifyCloudProxy_(e, expectedMethod)) throw new Error('Unauthorized request');
}

function verifyCloudProxy_(e, expectedMethod) {
  try {
    const parameters = parseQueryString_(e && e.queryString ? e.queryString : '');
    const timestamp = String(firstParameter_(parameters, '_proxy_ts'));
    const nonce = String(firstParameter_(parameters, '_proxy_nonce'));
    const method = String(firstParameter_(parameters, '_proxy_method'));
    const suppliedBodyHash = String(firstParameter_(parameters, '_proxy_body_sha256'));
    const suppliedSignature = String(firstParameter_(parameters, '_proxy_sig'));
    const secret = PropertiesService.getScriptProperties().getProperty('MY_SERVER_PROXY_SECRET') || '';
    if (secret.length < 32 || !/^\d{10}$/.test(timestamp) || !/^[A-Za-z0-9_-]{20,}$/.test(nonce)) return false;
    if (method !== 'GET' && method !== 'POST') return false;
    if (expectedMethod && method !== expectedMethod) return false;
    if (!/^[a-f0-9]{64}$/.test(suppliedBodyHash) || !/^[A-Za-z0-9_-]{40,}$/.test(suppliedSignature)) return false;

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 120) return false;

    const body = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
    const actualBodyHash = bytesToHex_(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      body,
      Utilities.Charset.UTF_8
    ));
    if (!constantTimeEqual_(actualBodyHash, suppliedBodyHash)) return false;

    const canonical = [
      method,
      timestamp,
      nonce,
      canonicalQuery_(parameters),
      suppliedBodyHash
    ].join('\n');
    const expectedSignature = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(canonical, secret, Utilities.Charset.UTF_8)
    ).replace(/=+$/g, '');
    if (!constantTimeEqual_(expectedSignature, suppliedSignature)) return false;

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return false;
    try {
      const cache = CacheService.getScriptCache();
      const nonceKey = 'proxy-nonce:' + nonce;
      if (cache.get(nonceKey)) return false;
      cache.put(nonceKey, '1', 180);
      return true;
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error('Proxy authentication failed', error);
    return false;
  }
}

function parseQueryString_(queryString) {
  const parameters = {};
  String(queryString || '').split('&').forEach(function(part) {
    if (!part) return;
    const separator = part.indexOf('=');
    const rawKey = separator < 0 ? part : part.slice(0, separator);
    const rawValue = separator < 0 ? '' : part.slice(separator + 1);
    const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    const value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    if (!parameters[key]) parameters[key] = [];
    parameters[key].push(value);
  });
  return parameters;
}

function firstParameter_(parameters, key) {
  const values = parameters[key] || [];
  return values.length ? values[0] : '';
}

function canonicalQuery_(parameters) {
  const pairs = [];
  Object.keys(parameters).forEach(function(key) {
    if (key === '_proxy_sig') return;
    (parameters[key] || []).forEach(function(value) {
      pairs.push([encodeURIComponent(key), encodeURIComponent(String(value))]);
    });
  });
  pairs.sort(function(left, right) {
    const leftPair = left[0] + '=' + left[1];
    const rightPair = right[0] + '=' + right[1];
    return leftPair < rightPair ? -1 : leftPair > rightPair ? 1 : 0;
  });
  return pairs.map(function(pair) { return pair[0] + '=' + pair[1]; }).join('&');
}

function bytesToHex_(bytes) {
  return bytes.map(function(value) {
    const unsigned = value < 0 ? value + 256 : value;
    return unsigned.toString(16).padStart(2, '0');
  }).join('');
}

function constantTimeEqual_(left, right) {
  left = String(left || '');
  right = String(right || '');
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
