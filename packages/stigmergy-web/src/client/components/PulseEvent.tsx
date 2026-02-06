import type { PulseEvent } from '../../shared/types';

const actionColors: Record<string, string> = {
  DECOMPOSE: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  REVIEW: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  UPDATE_CONTENT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  SETTLE: 'bg-green-500/20 text-green-400 border-green-500/30',
};

interface PulseEventCardProps {
  event: PulseEvent;
}

export function PulseEventCard({ event }: PulseEventCardProps) {
  const actionClass = actionColors[event.action] || 'bg-[#282845] text-[#a0a0b8] border-[#3a3a55]';

  return (
    <div className="flex items-start gap-3 py-2 px-3 border-b border-[#282845] text-sm">
      <span className="text-[#707088] text-xs w-8 text-right shrink-0 pt-0.5">
        #{event.pulse}
      </span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${actionClass}`}>
        {event.action}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[#e0e0ec] truncate">{event.target}</div>
        {event.reasoning && (
          <div className="text-[11px] text-[#8888a0] mt-0.5 truncate">{event.reasoning}</div>
        )}
      </div>
      {event.cost.api_calls > 0 && (
        <span className="text-[10px] text-[#707088] shrink-0">
          {event.cost.input_tokens}t
        </span>
      )}
    </div>
  );
}
