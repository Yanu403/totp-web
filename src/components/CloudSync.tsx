import { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle, X, LogOut } from 'lucide-react';
import {
  signUp, signIn, signOut, pushVault, pullVault, isAuthenticated,
  getAutoSync, setAutoSync, setSyncEnabled,
} from '../lib/sync';
import { getSyncMeta, getStoredBlob, loadAccounts, saveAccounts } from '../lib/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  passphrase: string;
  hasLocalData: boolean;
  onVaultRestored: (accounts: import('../types').TOTPAccount[], passphrase: string) => void;
  onSyncChange: (enabled: boolean) => void;
}

export default function CloudSync({ isOpen, onClose, onVaultRestored, onSyncChange }: Props) {
  const [mode, setMode] = useState<'login' | 'register' | 'manage'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [synced, setSynced] = useState(false);
  const [autoSync, setAutoSyncState] = useState(true);

  useEffect(() => {
    const meta = getSyncMeta();
    if (meta?.enabled) {
      setMode('manage');
      setEmail(meta.email || '');
      setAutoSyncState(getAutoSync());
      isAuthenticated().then(setSynced);
    } else {
      setMode('login');
      setEmail('');
      setPassword('');
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

  const handleSignUp = async () => {
    if (!email || !password) { setError('Email and passphrase required'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      await signUp(email, password);
      // Push current vault
      const blob = await saveAccounts(JSON.parse(localStorage.getItem('totp_web_v2') || '[]'), password);
      await pushVault(blob);
      setSyncEnabled(true, email);
      setSynced(true);
      setMode('manage');
      setSuccess('Cloud vault created and synced!');
      onSyncChange(true);
    } catch (e: any) {
      setError(e.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  const handleSignIn = async () => {
    if (!email || !password) { setError('Email and passphrase required'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      await signIn(email, password);
      const cloud = await pullVault();
      if (cloud) {
        // Overwrite local with cloud data
        localStorage.setItem('totp_web_v2', cloud.encryptedBlob);
        const accounts = await loadAccounts(password);
        onVaultRestored(accounts, password);
      }
      setSyncEnabled(true, email);
      setSynced(true);
      setMode('manage');
      setSuccess(cloud ? 'Vault restored from cloud!' : 'Signed in. No cloud vault found.');
      onSyncChange(true);
    } catch (e: any) {
      setError(e.message || 'Sign in failed');
    } finally { setLoading(false); }
  };

  const handlePush = async () => {
    setLoading(true); setError(''); setSuccess('');
    try {
      const blob = getStoredBlob();
      if (!blob) throw new Error('No local vault data');
      await pushVault(blob);
      setSuccess('Pushed to cloud');
    } catch (e: any) {
      setError(e.message || 'Push failed');
    } finally { setLoading(false); }
  };

  const handlePull = async () => {
    setLoading(true); setError(''); setSuccess('');
    try {
      const cloud = await pullVault();
      if (!cloud) throw new Error('No cloud vault found');
      localStorage.setItem('totp_web_v2', cloud.encryptedBlob);
      const accounts = await loadAccounts(password);
      onVaultRestored(accounts, password);
      setSuccess('Restored from cloud');
    } catch (e: any) {
      setError(e.message || 'Pull failed');
    } finally { setLoading(false); }
  };

  const handleToggleAutoSync = (val: boolean) => {
    setAutoSyncState(val);
    setAutoSync(val);
  };

  const handleDisconnect = async () => {
    await signOut();
    setSyncEnabled(false);
    setSynced(false);
    setMode('login');
    onSyncChange(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[#242424] text-[#888] hover:text-white">
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-1">
          {synced ? <Cloud size={22} className="text-[#4ade80]" /> : <CloudOff size={22} className="text-[#888]" />}
          <h2 className="text-lg font-semibold text-white">Cloud Sync</h2>
        </div>
        <p className="text-xs text-[#888] mb-5">
          Sync your encrypted vault across devices. Your passphrase never leaves this browser.
        </p>

        {error && (
          <div className="flex items-start gap-2 bg-[#2a1a1a] border border-[#441111] rounded-lg px-3 py-2.5 mb-4">
            <AlertCircle size={16} className="text-[#ef4444] mt-0.5 shrink-0" />
            <p className="text-sm text-[#ef4444]">{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 bg-[#1a2a1a] border border-[#114411] rounded-lg px-3 py-2.5 mb-4">
            <Check size={16} className="text-[#4ade80] mt-0.5 shrink-0" />
            <p className="text-sm text-[#4ade80]">{success}</p>
          </div>
        )}

        {mode !== 'manage' && (
          <div className="flex bg-[#242424] rounded-lg p-0.5 mb-4">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'login' ? 'bg-[#333] text-white' : 'text-[#888] hover:text-white'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'register' ? 'bg-[#333] text-white' : 'text-[#888] hover:text-white'}`}
            >
              Create Vault
            </button>
          </div>
        )}

        {mode !== 'manage' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#888] mb-1.5 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#242424] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#4ade80] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#888] mb-1.5 uppercase tracking-wider">
                {mode === 'register' ? 'Set Passphrase' : 'Passphrase'}
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') mode === 'login' ? handleSignIn() : handleSignUp(); }}
                placeholder={mode === 'register' ? 'Set a strong passphrase' : 'Enter your passphrase'}
                className="w-full bg-[#242424] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#4ade80] transition-colors"
              />
              <p className="text-[11px] text-[#666] mt-1">
                {mode === 'register'
                  ? 'This passphrase encrypts your vault. We cannot recover it.'
                  : 'Same passphrase used to encrypt your vault.'}
              </p>
            </div>
            <button
              onClick={mode === 'login' ? handleSignIn : handleSignUp}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#4ade80] hover:bg-[#22c55e] disabled:opacity-50 text-black font-semibold text-sm transition-colors"
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Cloud size={16} />}
              {mode === 'login' ? 'Sign In & Sync' : 'Create Cloud Vault'}
            </button>
          </div>
        )}

        {mode === 'manage' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-[#242424] border border-[#333] rounded-xl px-4 py-3">
              <div>
                <div className="text-sm text-white font-medium">{email}</div>
                <div className="text-[11px] text-[#888]">
                  {synced ? 'Authenticated · Cloud sync active' : 'Session expired · Sign in again'}
                </div>
              </div>
              <div className={`w-2.5 h-2.5 rounded-full ${synced ? 'bg-[#4ade80]' : 'bg-[#f59e0b]'}`} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-[#ccc]">Auto-sync on change</span>
              <button
                onClick={() => handleToggleAutoSync(!autoSync)}
                className={`w-11 h-6 rounded-full transition-colors relative ${autoSync ? 'bg-[#4ade80]' : 'bg-[#333]'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoSync ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handlePush}
                disabled={loading}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#242424] border border-[#333] hover:border-[#4ade80]/30 text-[#ccc] hover:text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Push Now
              </button>
              <button
                onClick={handlePull}
                disabled={loading}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#242424] border border-[#333] hover:border-[#4ade80]/30 text-[#ccc] hover:text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Cloud size={14} />
                Pull Now
              </button>
            </div>

            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#441111] text-[#ef4444] hover:bg-[#2a1a1a] text-sm font-medium transition-colors"
            >
              <LogOut size={14} />
              Disable Cloud Sync
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
