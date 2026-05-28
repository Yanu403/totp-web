import { useState, useEffect, useCallback } from 'react';
import { Copy, Trash2, Check } from 'lucide-react';
import type { TOTPAccount } from '../types';
import { generateTOTP } from '../lib/totp';

interface Props {
  account: TOTPAccount;
  onDelete: (id: string) => void;
}

export default function TOTPCode({ account, onDelete }: Props) {
  const [code, setCode] = useState('------');
  const [remaining, setRemaining] = useState(30);
  const [copied, setCopied] = useState(false);

  const tick = useCallback(() => {
    const result = generateTOTP(account);
    setCode(result.token);
    setRemaining(result.remaining);
  }, [account]);

  useEffect(() => {
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tick]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const progressPct = (remaining / (account.period || 30)) * 100;
  const isLow = remaining <= 5;

  return (
    <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-4 flex items-center gap-4 hover:border-[#444] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{account.label}</div>
        <div className="text-xs text-[#888] truncate">{account.issuer}</div>
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-mono font-bold tracking-widest tabular-nums ${isLow ? 'text-[#f59e0b]' : 'text-[#4ade80]'}`}>
            {code}
          </span>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg bg-[#242424] hover:bg-[#333] text-[#888] hover:text-white transition-colors"
            title="Copy"
          >
            {copied ? <Check size={16} className="text-[#4ade80]" /> : <Copy size={16} />}
          </button>
        </div>
        <div className="flex items-center gap-2 w-40">
          <div className="flex-1 h-1 bg-[#333] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${isLow ? 'bg-[#f59e0b]' : 'bg-[#4ade80]'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] text-[#888] font-mono w-5 text-right">{remaining}s</span>
        </div>
      </div>

      <button
        onClick={() => onDelete(account.id)}
        className="p-2 rounded-lg text-[#888] hover:text-[#ef4444] hover:bg-[#2a1a1a] transition-colors"
        title="Delete"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
