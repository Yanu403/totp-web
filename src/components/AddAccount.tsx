import { useState } from 'react';
import { X, Plus, ScanLine } from 'lucide-react';
import { parseOTPAuthURL } from '../lib/totp';
import type { TOTPAccount } from '../types';
import QRScanner from './QRScanner';

interface Props {
  onAdd: (account: TOTPAccount) => void;
  onClose: () => void;
}

export default function AddAccount({ onAdd, onClose }: Props) {
  const [mode, setMode] = useState<'manual' | 'scan'>('manual');
  const [label, setLabel] = useState('');
  const [issuer, setIssuer] = useState('');
  const [secret, setSecret] = useState('');
  const [algorithm, setAlgorithm] = useState<'SHA1' | 'SHA256' | 'SHA512'>('SHA1');
  const [digits, setDigits] = useState(6);
  const [period, setPeriod] = useState(30);
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!label.trim() || !secret.trim()) {
      setError('Label and secret are required');
      return;
    }
    const cleanSecret = secret.replace(/\s/g, '').toUpperCase();
    if (!/^[A-Z2-7]+=*$/.test(cleanSecret)) {
      setError('Secret must be valid Base32 (A-Z, 2-7)');
      return;
    }
    const account: TOTPAccount = {
      id: crypto.randomUUID(),
      label: label.trim(),
      issuer: issuer.trim() || 'Unknown',
      secret: cleanSecret,
      algorithm,
      digits,
      period,
      createdAt: Date.now(),
    };
    onAdd(account);
    onClose();
  };

  const handleScan = (url: string) => {
    const parsed = parseOTPAuthURL(url);
    if (!parsed) {
      setError('Invalid QR code. Not a valid otpauth:// URL.');
      setMode('manual');
      return;
    }
    setLabel(parsed.label);
    setIssuer(parsed.issuer);
    setSecret(parsed.secret);
    setAlgorithm(parsed.algorithm as any);
    setDigits(parsed.digits);
    setPeriod(parsed.period);
    setMode('manual');
  };

  if (mode === 'scan') {
    return <QRScanner onScan={handleScan} onClose={() => setMode('manual')} />;
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Add Account</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#242424] text-[#888] hover:text-white">
            <X size={20} />
          </button>
        </div>

        <button
          onClick={() => setMode('scan')}
          className="w-full mb-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#242424] border border-[#333] hover:border-[#4ade80]/30 text-[#ccc] hover:text-[#4ade80] transition-colors"
        >
          <ScanLine size={18} />
          <span className="text-sm font-medium">Scan QR Code</span>
        </button>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5 uppercase tracking-wider">Label</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. reazer@github.com"
              className="w-full bg-[#242424] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#4ade80] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5 uppercase tracking-wider">Issuer</label>
            <input
              value={issuer}
              onChange={e => setIssuer(e.target.value)}
              placeholder="e.g. GitHub"
              className="w-full bg-[#242424] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#4ade80] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5 uppercase tracking-wider">Secret (Base32)</label>
            <input
              value={secret}
              onChange={e => setSecret(e.target.value)}
              placeholder="JBSWY3DPEHPK3PXP"
              className="w-full bg-[#242424] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#4ade80] transition-colors font-mono"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#888] mb-1.5 uppercase tracking-wider">Algorithm</label>
              <select
                value={algorithm}
                onChange={e => setAlgorithm(e.target.value as any)}
                className="w-full bg-[#242424] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4ade80]"
              >
                <option value="SHA1">SHA1</option>
                <option value="SHA256">SHA256</option>
                <option value="SHA512">SHA512</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#888] mb-1.5 uppercase tracking-wider">Digits</label>
              <input
                type="number"
                value={digits}
                onChange={e => setDigits(parseInt(e.target.value) || 6)}
                min={6}
                max={8}
                className="w-full bg-[#242424] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4ade80]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#888] mb-1.5 uppercase tracking-wider">Period</label>
              <input
                type="number"
                value={period}
                onChange={e => setPeriod(parseInt(e.target.value) || 30)}
                step={10}
                min={10}
                max={60}
                className="w-full bg-[#242424] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4ade80]"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-[#ef4444] bg-[#2a1a1a] px-3 py-2 rounded-lg">{error}</p>
        )}

        <button
          onClick={handleSave}
          className="w-full mt-6 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#4ade80] hover:bg-[#22c55e] text-black font-semibold text-sm transition-colors"
        >
          <Plus size={18} />
          Add Account
        </button>
      </div>
    </div>
  );
}
