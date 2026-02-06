import type { PulseEvent } from '../../shared/types';

const actionColors: Record<string, string> = {
  DECOMPOSE: 'bg-blue-50 text-blue-700 border-blue-200',
  REVIEW: 'bg-purple-50 text-purple-700 border-purple-200',
  UPDATE_CONTENT: 'bg-amber-50 text-amber-700 border-amber-200',
  SETTLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

interface PulseEventCardProps {
  event: PulseEvent;
}

export function PulseEventCard({ event }: PulseEventCardProps) {
  const actionClass = actionColors[event.action] || 'bg-slate-100 text-slate-500 border-slate-200';

  return (
    <div className="flex items-start gap-3 py-3 px-4 border-b border-slate-100 hover:bg-slate-50 transition-colors text-base last:border-0 rounded-lg">
      <span className="text-slate-400 text-xs w-8 text-right shrink-0 pt-1 font-mono">
        #{event.pulse}
      </span>
      <span className={`text-xs px-2 py-0.5 rounded border shrink-0 font-bold tracking-wide ${actionClass}`}>
        {event.action}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-slate-900 truncate font-medium">{event.target}</div>
        {event.reasoning && (
          <div className="text-sm text-slate-500 mt-0.5 truncate italic">{event.reasoning}</div>
        )}
      </div>
      {event.cost.api_calls > 0 && (
        <span className="text-xs text-slate-400 shrink-0 font-mono pt-1">
          {event.cost.input_tokens.toLocaleString()}t
        </span>
      )}
    </div>
  );
}
