import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { colors } from '@/theme/colors';

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
    zoneColor: colors.accent.gold,
    startedAt: new Date(),
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [activeSession, setActiveSession] = useState<ActiveSessionState | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback((): void => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const isResting = activeSession?.isResting === true;

  useEffect(() => {
    if (!isResting) {
      clearTimer();
      return;
    }
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      setActiveSession((s) => {
        if (!s || !s.isResting) return s;
        const next = s.restSecondsRemaining - 1;
        if (next <= 0) {
          return { ...s, isResting: false, restSecondsRemaining: 0 };
        }
        return { ...s, restSecondsRemaining: next };
      });
    }, 1000);
    return clearTimer;
  }, [isResting, clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const startSession = useCallback((sessionId: string): void => {
    setActiveSession((current) => {
      if (current && current.sessionId === sessionId) return current;
      return defaultState(sessionId);
    });
  }, []);

  const updateSessionProgress = useCallback(
    (update: Partial<ActiveSessionState>): void => {
      setActiveSession((s) => (s ? { ...s, ...update } : s));
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
