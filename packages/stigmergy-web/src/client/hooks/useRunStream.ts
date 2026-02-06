import { useState, useEffect, useCallback, useRef } from 'react';
import type { PulseEvent, MaintenanceEvent } from '../../shared/types';

interface RunStreamState {
  connected: boolean;
  pulses: PulseEvent[];
  phaseChanges: Array<{ from: string; to: string }>;
  maintenanceEvents: MaintenanceEvent[];
  runEnded: boolean;
  endReason?: string;
  error?: string;
}

export function useRunStream(active: boolean) {
  const [state, setState] = useState<RunStreamState>({
    connected: false,
    pulses: [],
    phaseChanges: [],
    maintenanceEvents: [],
    runEnded: false,
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource('/api/run/stream');
    eventSourceRef.current = es;

    es.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
    };

    es.addEventListener('pulse', (e) => {
      const data = JSON.parse(e.data) as PulseEvent;
      setState((prev) => ({ ...prev, pulses: [...prev.pulses, data] }));
    });

    es.addEventListener('phase_change', (e) => {
      const data = JSON.parse(e.data) as { from: string; to: string };
      setState((prev) => ({ ...prev, phaseChanges: [...prev.phaseChanges, data] }));
    });

    es.addEventListener('maintenance', (e) => {
      const data = JSON.parse(e.data) as MaintenanceEvent;
      setState((prev) => ({
        ...prev,
        maintenanceEvents: [...prev.maintenanceEvents, data],
      }));
    });

    es.addEventListener('run_end', (e) => {
      const data = JSON.parse(e.data) as { reason: string; detail?: string };
      setState((prev) => ({ ...prev, runEnded: true, endReason: data.reason }));
    });

    es.addEventListener('error', (e) => {
      if (e instanceof MessageEvent) {
        const data = JSON.parse(e.data) as { message: string };
        setState((prev) => ({ ...prev, error: data.message }));
      }
    });

    es.onerror = () => {
      setState((prev) => ({ ...prev, connected: false }));
    };
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState((prev) => ({ ...prev, connected: false }));
  }, []);

  const reset = useCallback(() => {
    setState({
      connected: false,
      pulses: [],
      phaseChanges: [],
      maintenanceEvents: [],
      runEnded: false,
    });
  }, []);

  useEffect(() => {
    if (active) {
      connect();
    } else {
      disconnect();
    }
    return disconnect;
  }, [active, connect, disconnect]);

  return { ...state, reset, disconnect };
}
