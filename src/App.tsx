import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Lock, Unlock, Plus, Download, Upload, Trash2, Shield, ShieldOff,
  FileJson, ChevronDown, KeyRound, Cloud, CloudOff, RefreshCw
} from 'lucide-react';
import type { TOTPAccount } from './types';
import { loadAccounts, saveAccounts, hasAccounts, clearStorage, exportToJSON, importFromJSON, getSyncMeta, getStoredBlob } from './lib/storage';
import { isSyncAvailable, getSession, pushVault } from './lib/sync';
import TOTPCode from './components/TOTPCode';
import AddAccount from './components/AddAccount';
import CloudSync from './components/CloudSync';

function App() {
  const [locked, setLocked] = useState(true);
  const [passphrase, setPassphrase] = useState('');
  const [inputPass, setInputPass] = useState('');
  const [accounts, setAccounts] = useState<TOTPAccount[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Cloud sync state
  const [showCloud, setShowCloud] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error' | 'disabled'>('disabled');
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHasData(hasAccounts());
    const meta = getSyncMeta();
    if (meta?.enabled) {
      setSyncEnabled(true);
      setSyncStatus('idle');
    }
  }, []);

  const triggerAutoSync = useCallback(async (blob?: string) => {
    const meta = getSyncMeta();
    if (!meta?.enabled || !meta.autoSync) return;
    try {
      setSyncStatus('syncing');
      const session = await getSession();
      if (!session) { setSyncStatus('error'); return; }
      const dataBlob = blob || getStoredBlob();
      if (!dataBlob) { setSyncStatus('error'); return; }
      await pushVault(dataBlob);
      setSyncStatus('synced');
      setTimeout(() => setSyncStatus(prev => prev === 'synced' ? 'idle' : prev), 2000);
    } catch (e) {
      console.error('Auto-sync failed:', e);
      setSyncStatus('error');
    }
  }, []);

  const debouncedAutoSync = useCallback((blob?: string) => {
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => triggerAutoSync(blob), 800);
  }, [triggerAutoSync]);

  const doUnlock = useCallback(async (pass: string) => {
    setError('');
    const data = await loadAccounts(pass);
    if (hasAccounts() && data.length === 0 && pass) {
      setError('Wrong passphrase or corrupted data');
      return;
    }
    setAccounts(data);
    setPassphrase(pass);
    setLocked(false);
    setInputPass('');
  }, []);

  const doLock = () => {
    setLocked(true);
    setPassphrase('');
    setAccounts([]);
    setSyncStatus('disabled');
  };

  const handleAdd = async (account: TOTPAccount) => {
    const next = [...accounts, account];
    setAccounts(next);
    const blob = await saveAccounts(next, passphrase);
    setHasData(true);
    if (syncEnabled) debouncedAutoSync(blob);
  };

  const handleDelete = async (id: string) => {
    const next = accounts.filter(a => a.id !== id);
    setAccounts(next);
    const blob = await saveAccounts(next, passphrase);
    if (next.length === 0) setHasData(false);
    if (syncEnabled) debouncedAutoSync(blob);
  };

  const handleExport = () => {
    const json = exportToJSON(accounts);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `totp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    setImportError('');
    const parsed = importFromJSON(importText);
    if (!parsed) {
      setImportError('Invalid JSON format');
      return;
    }
    const next = [...accounts, ...parsed];
    setAccounts(next);
    saveAccounts(next, passphrase).then(blob => {
      setShowImport(false);
      setImportText('');
      setHasData(true);
      if (syncEnabled) debouncedAutoSync(blob);
    });
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result);
      const parsed = importFromJSON(text);
      if (!parsed) {
        setImportError('Invalid backup file');
        return;
      }
      const next = [...accounts, ...parsed];
      setAccounts(next);
      const blob = await saveAccounts(next, passphrase);
      setHasData(true);
      setShowImport(false);
      setImportText('');
      setImportError('');
      if (syncEnabled) debouncedAutoSync(blob);
    };
    reader.readAsText(file);
  };

  const handleClearAll = async () => {
    if (!confirm('Delete ALL accounts? This cannot be undone.')) return;
    clearStorage();
    setAccounts([]);
    setHasData(false);
    if (syncEnabled) debouncedAutoSync('W10='); // empty array encrypted or base64 of "[]"
  };

  const handleCloudSyncChange = (enabled: boolean) => {
    setSyncEnabled(enabled);
    setSyncStatus(enabled ? 'idle' : 'disabled');
  };

  const handleVaultRestored = (restoredAccounts: TOTPAccount[], pass: string) => {
    setAccounts(restoredAccounts);
    setPassphrase(pass);
    setHasData(restoredAccounts.length > 0);
    setLocked(false);
    setInputPass('');
    setSyncEnabled(true);
    setSyncStatus('synced');
    setTimeout(() => setSyncStatus('idle'), 2000);
  };

  const cloudIconProps = () => {
    if (!isSyncAvailable()) return { Icon: CloudOff, color: 'text-[#555]' };
    if (!syncEnabled) return { Icon: CloudOff, color: 'text-[#555]' };
    switch (syncStatus) {
      case 'syncing': return { Icon: RefreshCw, color: 'text-[#60a5fa]' };
      case 'synced': return { Icon: Cloud, color: 'text-[#4ade80]' };
      case 'error': return { Icon: CloudOff, color: 'text-[#ef4444]' };
      default: return { Icon: Cloud, color: 'text-[#888]' };
    }
  };

  const { Icon: CloudIcon, color: cloudColor } = cloudIconProps();

  // Lock screen
  if (locked) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-[#1a1a1a] border border-[#333] flex items-center justify-center">
              <Shield size={32} className="text-[#4ade80]" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">TOTP Vault</h1>
          <p className="text-sm text-[#888] text-center mb-8">Web-based authenticator</p>

          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 space-y-4">
            {hasData && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[#888] mb-1.5 uppercase tracking-wider">
                    Passphrase
                  </label>
                  <input
                    type="password"
                    value={inputPass}
                    onChange={e => setInputPass(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doUnlock(inputPass)}
                    placeholder={hasData ? 'Enter your passphrase' : 'Set a passphrase (optional)'}
                    className="w-full bg-[#242424] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#4ade80] transition-colors"
                    autoFocus
                  />
                </div>
                {error && (
                  <p className="text-sm text-[#ef4444] bg-[#2a1a1a] px-3 py-2 rounded-lg">{error}</p>
                )}
                <button
                  onClick={() => doUnlock(inputPass)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#4ade80] hover:bg-[#22c55e] text-black font-semibold text-sm transition-colors"
                >
                  <Unlock size={18} />
                  Unlock
                </button>
              </>
            )}

            {!hasData && (
              <>
                <p className="text-sm text-[#888] text-center">
                  No accounts yet. Set an optional passphrase to encrypt your data, or leave blank.
                </p>
                <button
                  onClick={() => doUnlock(inputPass)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#4ade80] hover:bg-[#22c55e] text-black font-semibold text-sm transition-colors"
                >
                  <ShieldOff size={18} />
                  Create Vault
                </button>
              </>
            )}

            {isSyncAvailable() && (
              <button
                onClick={() => setShowCloud(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#242424] border border-[#333] hover:border-[#4ade80]/30 text-[#ccc] hover:text-white text-sm font-medium transition-colors"
              >
                <Cloud size={18} />
                Restore from Cloud
              </button>
            )}
          </div>

          <p className="text-xs text-[#555] text-center mt-6">
            Purely client-side. No data leaves your browser.
          </p>
        </div>

        {showCloud && (
          <CloudSync
            isOpen={showCloud}
            onClose={() => setShowCloud(false)}
            passphrase={inputPass}
            hasLocalData={hasData}
            onVaultRestored={handleVaultRestored}
            onSyncChange={handleCloudSyncChange}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0f0f0f]/90 backdrop-blur-md border-b border-[#222]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-center">
              <Shield size={18} className="text-[#4ade80]" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">TOTP Vault</h1>
              <p className="text-[10px] text-[#888] leading-tight">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isSyncAvailable() && (
              <button
                onClick={() => setShowCloud(true)}
                title={syncEnabled ? `Cloud sync: ${syncStatus}` : 'Enable cloud sync'}
                className={`p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors ${cloudColor}`}
              >
                <CloudIcon size={18} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
              </button>
            )}
            <div className="relative group">
              <button className="p-2 rounded-lg hover:bg-[#1a1a1a] text-[#888] hover:text-white transition-colors">
                <ChevronDown size={18} />
              </button>
              <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                <button
                  onClick={() => setShowBackup(true)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#ccc] hover:bg-[#242424] hover:text-white transition-colors"
                >
                  <Download size={16} />
                  Backup (Export)
                </button>
                <button
                  onClick={() => setShowImport(true)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#ccc] hover:bg-[#242424] hover:text-white transition-colors"
                >
                  <Upload size={16} />
                  Restore (Import)
                </button>
                <div className="h-px bg-[#333]" />
                <button
                  onClick={handleClearAll}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#ef4444] hover:bg-[#2a1a1a] transition-colors"
                >
                  <Trash2 size={16} />
                  Delete All
                </button>
                <div className="h-px bg-[#333]" />
                <button
                  onClick={doLock}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#888] hover:bg-[#242424] hover:text-white transition-colors"
                >
                  <Lock size={16} />
                  Lock Vault
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="p-2 rounded-lg bg-[#4ade80] hover:bg-[#22c55e] text-black transition-colors"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-2xl mx-auto px-4 pt-6">
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#1a1a1a] border border-[#333] flex items-center justify-center mb-4">
              <KeyRound size={28} className="text-[#333]" />
            </div>
            <h2 className="text-white font-semibold mb-1">No accounts yet</h2>
            <p className="text-sm text-[#888] mb-6 max-w-xs">
              Add your first TOTP account manually or scan a QR code.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#4ade80] hover:bg-[#22c55e] text-black font-semibold text-sm transition-colors"
            >
              <Plus size={18} />
              Add Account
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map(acc => (
              <TOTPCode key={acc.id} account={acc} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>

      {/* Add Modal */}
      {showAdd && (
        <AddAccount
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Backup Modal */}
      {showBackup && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Backup Accounts</h2>
              <button onClick={() => setShowBackup(false)} className="p-1.5 rounded-lg hover:bg-[#242424] text-[#888] hover:text-white">
                <ChevronDown size={20} className="rotate-180" />
              </button>
            </div>
            <p className="text-sm text-[#888] mb-4">
              Save this JSON file securely. It contains your TOTP secrets. Without this backup, you cannot recover accounts if browser data is cleared.
            </p>
            <div className="bg-[#242424] border border-[#333] rounded-xl p-4 max-h-64 overflow-auto">
              <pre className="text-xs font-mono text-[#ccc] whitespace-pre-wrap break-all">{exportToJSON(accounts)}</pre>
            </div>
            <button
              onClick={handleExport}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#4ade80] hover:bg-[#22c55e] text-black font-semibold text-sm transition-colors"
            >
              <Download size={18} />
              Download JSON
            </button>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Restore Accounts</h2>
              <button onClick={() => { setShowImport(false); setImportText(''); setImportError(''); }} className="p-1.5 rounded-lg hover:bg-[#242424] text-[#888] hover:text-white">
                <ChevronDown size={20} className="rotate-180" />
              </button>
            </div>
            <p className="text-sm text-[#888] mb-4">
              Paste JSON backup or upload a file. Duplicates will be appended — review after import.
            </p>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={`[\n  {\n    "id": "...",\n    "label": "...",\n    "secret": "...",\n    ...\n  }\n]`}
              className="w-full h-40 bg-[#242424] border border-[#333] rounded-lg px-3 py-2.5 text-xs font-mono text-white placeholder-[#555] focus:outline-none focus:border-[#4ade80] transition-colors resize-none mb-3"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#242424] border border-[#333] hover:border-[#4ade80]/30 text-[#ccc] hover:text-[#4ade80] text-sm font-medium transition-colors"
              >
                <FileJson size={16} />
                Upload File
              </button>
              <button
                onClick={handleImport}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4ade80] hover:bg-[#22c55e] text-black text-sm font-semibold transition-colors"
              >
                <Upload size={16} />
                Restore
              </button>
            </div>
            {importError && (
              <p className="mt-3 text-sm text-[#ef4444] bg-[#2a1a1a] px-3 py-2 rounded-lg">{importError}</p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileImport}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* Cloud Sync Modal */}
      {showCloud && (
        <CloudSync
          isOpen={showCloud}
          onClose={() => setShowCloud(false)}
          passphrase={passphrase}
          hasLocalData={hasData}
          onVaultRestored={handleVaultRestored}
          onSyncChange={handleCloudSyncChange}
        />
      )}
    </div>
  );
}

export default App;
