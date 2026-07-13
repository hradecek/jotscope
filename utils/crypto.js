// JWT signature verification utilities

import { parseJWT } from './jwt.js';

export const ALGORITHM_MAP = {
  'RS256': { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
  'RS384': { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' },
  'RS512': { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
  'PS256': { name: 'RSA-PSS', hash: 'SHA-256', saltLength: 32 },
  'PS384': { name: 'RSA-PSS', hash: 'SHA-384', saltLength: 48 },
  'PS512': { name: 'RSA-PSS', hash: 'SHA-512', saltLength: 64 },
  'ES256': { name: 'ECDSA', hash: 'SHA-256', namedCurve: 'P-256' },
  'ES384': { name: 'ECDSA', hash: 'SHA-384', namedCurve: 'P-384' },
  'ES512': { name: 'ECDSA', hash: 'SHA-512', namedCurve: 'P-521' },
  'HS256': { name: 'HMAC', hash: 'SHA-256' },
  'HS384': { name: 'HMAC', hash: 'SHA-384' },
  'HS512': { name: 'HMAC', hash: 'SHA-512' }
};

export function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace(/-----BEGIN.*-----/, '')
    .replace(/-----END.*-----/, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function base64UrlToArrayBuffer(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) base64 += '='.repeat(4 - padding);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function ecdsaSignatureToDer(signature, curveSize) {
  const r = new Uint8Array(signature.slice(0, curveSize));
  const s = new Uint8Array(signature.slice(curveSize));

  function trimZeros(arr) {
    let start = 0;
    while (start < arr.length - 1 && arr[start] === 0) start++;
    return arr.slice(start);
  }

  let rTrimmed = trimZeros(r);
  let sTrimmed = trimZeros(s);

  if (rTrimmed[0] & 0x80) {
    const tmp = new Uint8Array(rTrimmed.length + 1);
    tmp[0] = 0;
    tmp.set(rTrimmed, 1);
    rTrimmed = tmp;
  }
  if (sTrimmed[0] & 0x80) {
    const tmp = new Uint8Array(sTrimmed.length + 1);
    tmp[0] = 0;
    tmp.set(sTrimmed, 1);
    sTrimmed = tmp;
  }

  const rLen = rTrimmed.length;
  const sLen = sTrimmed.length;
  const totalLen = 2 + rLen + 2 + sLen;

  const der = new Uint8Array(2 + totalLen);
  let offset = 0;
  der[offset++] = 0x30; // SEQUENCE
  der[offset++] = totalLen;
  der[offset++] = 0x02; // INTEGER
  der[offset++] = rLen;
  der.set(rTrimmed, offset);
  offset += rLen;
  der[offset++] = 0x02; // INTEGER
  der[offset++] = sLen;
  der.set(sTrimmed, offset);

  return der.buffer;
}

export async function jwkToCryptoKey(jwk, algorithm) {
  const alg = ALGORITHM_MAP[algorithm];
  if (!alg) throw new Error(`Unsupported algorithm: ${algorithm}`);

  const keyUsages = ['verify'];

  if (alg.name === 'HMAC') {
    return await crypto.subtle.importKey(
      'jwk', jwk, { name: alg.name, hash: alg.hash }, false, keyUsages
    );
  }
  if (alg.name === 'ECDSA') {
    return await crypto.subtle.importKey(
      'jwk', jwk, { name: alg.name, namedCurve: alg.namedCurve }, false, keyUsages
    );
  }
  return await crypto.subtle.importKey(
    'jwk', jwk, { name: alg.name, hash: alg.hash }, false, keyUsages
  );
}

export async function verifySignature(token, keyMaterial, keyType) {
  const { header, signatureB64, signedContent } = parseJWT(token);
  const algorithm = header.alg;

  if (!ALGORITHM_MAP[algorithm]) {
    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }

  const alg = ALGORITHM_MAP[algorithm];
  let signature = base64UrlToArrayBuffer(signatureB64);
  const data = new TextEncoder().encode(signedContent);

  let cryptoKey;

  if (keyType === 'pem') {
    const keyBuffer = pemToArrayBuffer(keyMaterial);
    if (alg.name === 'ECDSA') {
      cryptoKey = await crypto.subtle.importKey(
        'spki', keyBuffer, { name: alg.name, namedCurve: alg.namedCurve }, false, ['verify']
      );
    } else {
      cryptoKey = await crypto.subtle.importKey(
        'spki', keyBuffer, { name: alg.name, hash: alg.hash }, false, ['verify']
      );
    }
  } else if (keyType === 'jwk') {
    cryptoKey = await jwkToCryptoKey(keyMaterial, algorithm);
  } else if (keyType === 'secret') {
    const secretBuffer = new TextEncoder().encode(keyMaterial);
    cryptoKey = await crypto.subtle.importKey(
      'raw', secretBuffer, { name: alg.name, hash: alg.hash }, false, ['verify']
    );
  }

  let verifyAlg;
  if (alg.name === 'RSA-PSS') {
    verifyAlg = { name: alg.name, saltLength: alg.saltLength };
  } else if (alg.name === 'ECDSA') {
    verifyAlg = { name: alg.name, hash: alg.hash };
    const curveSize = alg.namedCurve === 'P-256' ? 32 : alg.namedCurve === 'P-384' ? 48 : 66;
    signature = ecdsaSignatureToDer(signature, curveSize);
  } else {
    verifyAlg = alg.name;
  }

  return await crypto.subtle.verify(verifyAlg, cryptoKey, signature, data);
}

export async function fetchJWKS(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }
  return await response.json();
}

export function selectKeyFromJWKS(jwks, kid, alg) {
  const keys = jwks.keys || [];

  if (kid) {
    const key = keys.find(k => k.kid === kid);
    if (key) return key;
    throw new Error(`No key found with kid: ${kid}`);
  }

  const algPrefix = alg.startsWith('RS') ? 'RSA' :
                    alg.startsWith('ES') ? 'EC' :
                    alg.startsWith('PS') ? 'RSA' : null;

  const key = keys.find(k =>
    k.kty === algPrefix &&
    (!k.use || k.use === 'sig') &&
    (!k.alg || k.alg === alg)
  );

  if (key) return key;
  throw new Error('No suitable key found in JWKS');
}
