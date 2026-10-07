import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/* AES-256-GCM for refresh tokens at rest, HMAC-signed OAuth state. Keys come from Secret Manager. */

function key32(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENC_KEY must be 32 bytes (base64)');
  return key;
}

export function encryptSecret(plain: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key32(base64Key), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

export function decryptSecret(sealed: string, base64Key: string): string {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unrecognised sealed secret');
  const decipher = createDecipheriv('aes-256-gcm', key32(base64Key), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** `uid.expiry.nonce.signature` — binds an OAuth round-trip to the signed-in user for 10 minutes. */
export function signState(
  uid: string,
  secret: string,
  now = Date.now(),
  ttlMs = 10 * 60_000,
): string {
  const payload = `${Buffer.from(uid).toString('base64url')}.${now + ttlMs}.${randomBytes(8).toString('base64url')}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyState(state: string, secret: string, now = Date.now()): string | null {
  const parts = state.split('.');
  if (parts.length !== 4) return null;
  const [uidB64, expiry, nonce, sig] = parts as [string, string, string, string];
  const payload = `${uidB64}.${expiry}.${nonce}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expiry) < now) return null;
  return Buffer.from(uidB64, 'base64url').toString('utf8');
}
