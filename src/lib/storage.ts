import type { TOTPAccount } from '../types';

const STORAGE_KEY = 'totp_web_v2';
const SYNC_META_KEY = 'totp_web_sync_meta';

/* ───────── helpers ───────── */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/* ───────── v2 crypto (random salt) ───────── */

interface VaultPayloadV2 {
  v: 2;
  salt: string;
  iv: string;
  ct: string;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.slice(), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptV2(data: string, passphrase: string): Promise<string> {
  const saltBuf = new ArrayBuffer(16);
  const salt = new Uint8Array(saltBuf);
  crypto.getRandomValues(salt);
  const key = await deriveKey(passphrase, salt);
  const ivBuf = new ArrayBuffer(12);
  const iv = new Uint8Array(ivBuf);
  crypto.getRandomValues(iv);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.slice() },
    key,
    new TextEncoder().encode(data)
  );
  const payload: VaultPayloadV2 = {
    v: 2,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(encrypted)),
  };
  return btoa(JSON.stringify(payload));
}

async function decryptV2(ciphertext: string, passphrase: string): Promise<string> {
  const raw = atob(ciphertext);
  const payload = JSON.parse(raw) as VaultPayloadV2;
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ct = base64ToBytes(payload.ct);
  const key = await deriveKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.slice() },
    key,
    ct.slice()
  );
  return new TextDecoder().decode(decrypted);
}

/* ───────── v1 crypto (static salt) backward compat ───────── */

async function deriveKeyV1(passphrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('totp-web-static-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function decryptV1(ciphertext: string, passphrase: string): Promise<string> {
  const key = await deriveKeyV1(passphrase);
  const raw = atob(ciphertext);
  const iv = new Uint8Array(Array.from(raw.slice(0, 12)).map(c => c.charCodeAt(0)));
  const data = new Uint8Array(Array.from(raw.slice(12)).map(c => c.charCodeAt(0)));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return new TextDecoder().decode(decrypted);
}

/* ───────── auto-detect format ───────── */

async function decryptAuto(ciphertext: string, passphrase: string): Promise<string> {
  if (!passphrase) return ciphertext; // plain text

  // Try v2 first (base64-wrapped JSON)
  try {
    const raw = atob(ciphertext);
    const parsed = JSON.parse(raw);
    if (parsed.v === 2) {
      return await decryptV2(ciphertext, passphrase);
    }
  } catch {
    // not v2
  }

  // Try v1 (raw binary base64)
  try {
    return await decryptV1(ciphertext, passphrase);
  } catch {
    throw new Error('Decryption failed');
  }
}

/* ───────── public API ───────── */

export async function saveAccounts(accounts: TOTPAccount[], passphrase: string): Promise<string> {
  const json = JSON.stringify(accounts);
  const encrypted = passphrase ? await encryptV2(json, passphrase) : json;
  localStorage.setItem(STORAGE_KEY, encrypted);
  return encrypted; // return blob for sync upload
}

export async function loadAccounts(passphrase: string): Promise<TOTPAccount[]> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    const json = passphrase ? await decryptAuto(stored, passphrase) : stored;
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getStoredBlob(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function hasAccounts(): boolean {
  return !!localStorage.getItem(STORAGE_KEY);
}

export function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SYNC_META_KEY);
}

export function exportToJSON(accounts: TOTPAccount[]): string {
  return JSON.stringify(accounts, null, 2);
}

export function importFromJSON(json: string): TOTPAccount[] | null {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(a => a.id && a.secret && a.label);
  } catch {
    return null;
  }
}

/* ───────── sync metadata ───────── */

export interface SyncMeta {
  email: string;
  enabled: boolean;
  autoSync: boolean;
  lastSyncedAt?: string;
  lastSyncStatus?: 'ok' | 'error';
}

export function getSyncMeta(): SyncMeta | null {
  const raw = localStorage.getItem(SYNC_META_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSyncMeta(meta: SyncMeta): void {
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
}

export function clearSyncMeta(): void {
  localStorage.removeItem(SYNC_META_KEY);
}
