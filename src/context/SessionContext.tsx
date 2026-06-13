import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { colors } from '@/theme/colors';
import { playBeep, playRestComplete } from '@/lib/sound';

export interface ActiveSessionState {
  sessionId: string;
  currentExerciseIndex: number;
  currentSetIndex: number;
  currentExerciseName: string;
  totalExercises: number;
  totalSets: number;
  setsCompleted: number;
  isResting: boolean;
  restSecondsRemaining: number;
  restTotalSeconds: number;
  /** Epoch ms when the current rest ends; drives a wall-clock timer. */
  restEndsAt: number | null;
  zoneColor: string;
  startedAt: Date;
}

export interface SessionContextType {
  activeSession: ActiveSessionState | null;
  startSession: (sessionId: string) => void;
  updateSessionProgress: (update: Partial<ActiveSessionState>) => void;
  endSession: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

function defaultState(sessionId: string): ActiveSessionState {
  return {
    sessionId,
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    currentExerciseName: '',
    totalExercises: 0,
    totalSets: 0,
    setsCompleted: 0,
    isResting: false,
    restSecondsRemaining: 0,
    restTotalSeconds: 0,
    restEndsAt: null,
    zoneColor: colors.scoreGreen,
    startedAt: new Date(),
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [activeSession, setActiveSession] = useState<ActiveSessionState | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks the last whole-second value we played a beep for, to fire
  // each countdown sound exactly once.
  const lastBeepSecondRef = useRef<number | null>(null);
  const endPlayedRef = useRef<boolean>(false);

  const clearTimer = useCallback((): void => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const isResting = activeSession?.isResting === true;
  const restEndsAt = activeSession?.restEndsAt ?? null;

  // Wall-clock timer: derive remaining seconds from restEndsAt so the
  // countdown stays accurate across background/foreground transitions.
  const tick = useCallback((): void => {
    setActiveSession((s) => {
      if (!s || !s.isResting || s.restEndsAt === null) return s;
      const remainingMs = s.restEndsAt - Date.now();
      const remaining = Math.max(0, Math.ceil(remainingMs / 1000));

      if (remaining <= 3 && remaining > 0 && lastBeepSecondRef.current !== remaining) {
        lastBeepSecondRef.current = remaining;
        void playBeep();
      }
      if (remaining <= 0) {
        if (!endPlayedRef.current) {
          endPlayedRef.current = true;
          void playRestComplete();
        }
        return { ...s, isResting: false, restSecondsRemaining: 0, restEndsAt: null };
      }
      if (remaining === s.restSecondsRemaining) return s;
      return { ...s, restSecondsRemaining: remaining };
    });
  }, []);

  useEffect(() => {
    if (!isResting || restEndsAt === null) {
      clearTimer();
      return;
    }
    lastBeepSecondRef.current = null;
    endPlayedRef.current = false;
    tick();
    intervalRef.current = setInterval(tick, 250);
    return clearTimer;
  }, [isResting, restEndsAt, tick, clearTimer]);

  // Resync immediately when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') tick();
    });
    return () => sub.remove();
  }, [tick]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const startSession = useCallback((sessionId: string): void => {
    setActiveSession((current) => {
      if (current && current.sessionId === sessionId) return current;
      return defaultState(sessionId);
    });
  }, []);

  const updateSessionProgress = useCallback(
    (update: Partial<ActiveSessionState>): void => {
      setActiveSession((s) => {
        if (!s) return s;
        const merged = { ...s, ...update };
        // Recompute the wall-clock deadline whenever a rest starts,
        // restarts, or its duration is adjusted.
        const restTouched =
          'isResting' in update ||
          'restSecondsRemaining' in update ||
          'restTotalSeconds' in update;
        if (restTouched) {
          if (merged.isResting && merged.restSecondsRemaining > 0) {
            merged.restEndsAt = Date.now() + merged.restSecondsRemaining * 1000;
          } else if (!merged.isResting) {
            merged.restEndsAt = null;
          }
        }
        return merged;
      });
    },
    [],
  );

  const endSession = useCallback((): void => {
    clearTimer();
    setActiveSession(null);
  }, [clearTimer]);

  const value = useMemo<SessionContextType>(
    () => ({ activeSession, startSession, updateSessionProgress, endSession }),
    [activeSession, startSession, updateSessionProgress, endSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextType {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

export function formatRestMS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
