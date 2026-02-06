const colors: Record<string, { fill: string; text: string }> = {
  need: { fill: 'bg-red-500', text: 'text-red-600' },
  confidence: { fill: 'bg-emerald-500', text: 'text-emerald-600' },
  conflict: { fill: 'bg-amber-500', text: 'text-amber-600' },
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
      <span className="w-20 text-[11px] text-slate-500 uppercase tracking-wide font-semibold">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden border border-slate-200">
        <div
          className={`h-full rounded transition-all duration-300 ${fill}`}
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className={`w-6 text-right text-sm font-bold ${text}`}>{value}</span>
    </div>
  );
}
