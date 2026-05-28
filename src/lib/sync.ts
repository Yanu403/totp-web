import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSyncMeta, setSyncMeta } from './storage';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export function isSyncAvailable(): boolean {
  return !!supabase;
}

/* ───────── derive deterministic password from passphrase ───────── */

export async function deriveAuthPassword(email: string, passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode('totp-sync-auth:' + email.toLowerCase().trim()), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ───────── auth helpers ───────── */

export async function signUp(email: string, passphrase: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const password = await deriveAuthPassword(email, passphrase);
  const { data, error } = await supabase.auth.signUp({
    email: email.toLowerCase().trim(),
    password,
    options: { data: { app: 'totp-vault' } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, passphrase: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const password = await deriveAuthPassword(email, passphrase);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  clearSyncState();
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return !!session;
}

/* ───────── vault CRUD ───────── */

export async function pushVault(encryptedBlob: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('vaults')
    .upsert(
      {
        user_id: user.id,
        encrypted_data: encryptedBlob,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) throw error;

  const meta = getSyncMeta();
  if (meta) {
    meta.lastSyncedAt = new Date().toISOString();
    meta.lastSyncStatus = 'ok';
    setSyncMeta(meta);
  }
}

export async function pullVault(): Promise<{ encryptedBlob: string; updatedAt: string } | null> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('vaults')
    .select('encrypted_data, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const meta = getSyncMeta();
  if (meta) {
    meta.lastSyncedAt = new Date().toISOString();
    meta.lastSyncStatus = 'ok';
    setSyncMeta(meta);
  }

  return {
    encryptedBlob: data.encrypted_data,
    updatedAt: data.updated_at,
  };
}

/* ───────── helpers ───────── */

export function clearSyncState() {
  const meta = getSyncMeta();
  if (meta) {
    meta.enabled = false;
    meta.lastSyncStatus = undefined;
    setSyncMeta(meta);
  }
}

export function setSyncEnabled(enabled: boolean, email?: string) {
  const meta = getSyncMeta() || { email: email || '', enabled: false, autoSync: true };
  meta.enabled = enabled;
  if (email) meta.email = email;
  setSyncMeta(meta);
}

export function getAutoSync(): boolean {
  const meta = getSyncMeta();
  return meta ? meta.autoSync !== false : true;
}

export function setAutoSync(val: boolean) {
  const meta = getSyncMeta();
  if (meta) {
    meta.autoSync = val;
    setSyncMeta(meta);
  }
}
