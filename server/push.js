/* Link Up — Phase 7: Web Push sender (zero deps, Node 20+).
 * VAPID (ES256 JWT) + RFC 8291 aes128gcm payload encryption using only
 * node:crypto. Keys persist in server/.vapid.json (git-ignored material).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VAPID_FILE = path.join(HERE, '.vapid.json');
const SUB = 'mailto:admin@linkup.nsu';

export const b64u = {
  enc: (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
};
const u8 = (n, len) => {
  const b = Buffer.alloc(len);
  for (let i = len - 1; i >= 0; i--) { b[i] = n & 0xff; n >>>= 8; }
  return b;
};

export function ensureVapid() {
  try {
    const saved = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
    if (saved.publicJwk && saved.privateJwk) return saved;
  } catch {}
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { format: 'jwk' },
    privateKeyEncoding: { format: 'jwk' },
  });
  const v = { publicJwk: publicKey, privateJwk: privateKey };
  try { fs.writeFileSync(VAPID_FILE, JSON.stringify(v)); } catch {}
  return v;
}
export function appPublicKey() {
  const { x, y } = ensureVapid().publicJwk;
  return b64u.enc(Buffer.concat([Buffer.from([0x04]), b64u.dec(x), b64u.dec(y)]));
}
function rawSign(jwtUnsigned, privateJwk) {
  const key = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
  const der = crypto.sign('sha256', Buffer.from(jwtUnsigned), key);
  // DER -> raw R||S
  let o = 2;
  if (der[o++] !== 0x02) throw new Error('der');
  let rl = der[o++];
  if (rl & 0x80) { rl = der.readUIntBE(o, rl & 0x7f); o += rl & 0; }
  const r = der.subarray(o, o + rl); o += rl;
  o++; // 0x02
  let sl = der[o++];
  const s = der.subarray(o, o + sl);
  const pad = (b) => (b.length > 32 ? b.subarray(b.length - 32) : Buffer.concat([Buffer.alloc(32 - b.length), b]));
  return b64u.enc(Buffer.concat([pad(r), pad(s)]));
}
export function vapidAuth(audience) {
  const v = ensureVapid();
  const head = b64u.enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u.enc(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 43200, sub: SUB }));
  const sig = rawSign(`${head}.${body}`, v.privateJwk);
  return `vapid t=${head}.${body}.${sig}, k=${appPublicKey()}`;
}

function ecdhRaw(privJwk, pubRaw) {
  const e = crypto.createECDH('prime256v1');
  e.setPrivateKey(b64u.dec(privJwk.d));
  return e.computeSecret(pubRaw);
}
export function encryptPayload(sub, text) {
  const clientPub = b64u.dec(sub.keys.p256dh);
  const auth = b64u.dec(sub.keys.auth);
  const eph = crypto.createECDH('prime256v1');
  eph.generateKeys();
  const serverPub = eph.getPublicKey();
  const shared = eph.computeSecret(clientPub);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), clientPub, serverPub]);
  const prk = crypto.hkdfSync('sha256', shared, auth, keyInfo, 32);
  const cek = crypto.hkdfSync('sha256', prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm', 'utf8'), Buffer.from([0])]), Buffer.alloc(0), 16);
  const nonce = crypto.hkdfSync('sha256', prk, Buffer.concat([Buffer.from('Content-Encoding: nonce', 'utf8'), Buffer.from([0])]), Buffer.alloc(0), 12);
  const pt = Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from([0x02])]);
  if (pt.length > 3990) throw new Error('payload too large');
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
  const salt = crypto.randomBytes(16);
  return {
    body: Buffer.concat([salt, u8(4096, 4), Buffer.from([serverPub.length]), serverPub, ct]),
    salt, serverPub,
  };
}

export async function sendPush(sub, payload) {
  const ep = new URL(sub.endpoint);
  const { body, salt, serverPub } = encryptPayload(sub, JSON.stringify(payload));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      TTL: '3600',
      'Content-Length': String(body.length),
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      Authorization: vapidAuth(ep.origin),
      'Crypto-Key': `dh=${b64u.enc(serverPub)};p256ecdsa=${appPublicKey()}`,
      Encryption: `salt=${b64u.enc(salt)}`,
    },
    body,
  });
  return { code: res.status };
}
