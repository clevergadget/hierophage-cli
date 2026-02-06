const colors: Record<string, { fill: string; text: string }> = {
  need: { fill: 'bg-red-400', text: 'text-red-400' },
  confidence: { fill: 'bg-green-400', text: 'text-green-400' },
  conflict: { fill: 'bg-amber-400', text: 'text-amber-400' },
};

interface SignalBarProps {
  label: string;
  value: number;
  type: 'need' | 'confidence' | 'conflict';
}

export function SignalBar({ label, value, type }: SignalBarProps) {
  const { fill, text } = colors[type];
  return (
    <div className="flex items-center gap-2.5 mb-2">
      <span className="w-20 text-[11px] text-[#a0a0b8] uppercase tracking-wide">{label}</span>
      <div className="flex-1 h-2 bg-[#282845] rounded overflow-hidden">
        <div
          className={`h-full rounded transition-all duration-300 ${fill}`}
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className={`w-6 text-right text-sm font-semibold ${text}`}>{value}</span>
    </div>
  );
}
