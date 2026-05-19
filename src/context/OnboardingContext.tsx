import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Level, SportKey, HealthDataSource, SessionsOrganization } from '@/lib/firestore';

export interface SportConfig {
  sport_key: SportKey;
  level: Level | null;
  goal: string | null;
  sessions_per_week: number;
  equipment?: string | null;
}

export interface OnboardingState {
  level: Level | null;
  selectedSports: SportKey[];
  sportConfigs: Record<string, SportConfig>;
  sessions_organization: SessionsOrganization;
  optimize_global_progression: boolean | null;
  health_data_source: HealthDataSource;
}

export interface OnboardingContextValue extends OnboardingState {
  setLevel: (level: Level) => void;
  toggleSport: (sport: SportKey) => void;
  setSportConfig: (sport: SportKey, patch: Partial<SportConfig>) => void;
  setSessionsOrganization: (v: SessionsOrganization) => void;
  setOptimizeGlobal: (v: boolean) => void;
  setHealthDataSource: (v: HealthDataSource) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

const defaultSportConfig = (sport: SportKey): SportConfig => ({
  sport_key: sport,
  level: null,
  goal: null,
  sessions_per_week: 3,
  equipment: null,
});

export function OnboardingProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [level, setLevelState] = useState<Level | null>(null);
  const [selectedSports, setSelectedSports] = useState<SportKey[]>([]);
  const [sportConfigs, setSportConfigs] = useState<Record<string, SportConfig>>({});
  const [sessions_organization, setSessionsOrganizationState] =
    useState<SessionsOrganization>(null);
  const [optimize_global_progression, setOptimizeGlobalState] = useState<boolean | null>(null);
  const [health_data_source, setHealthDataSourceState] = useState<HealthDataSource>(null);

  const value: OnboardingContextValue = useMemo(
    () => ({
      level,
      selectedSports,
      sportConfigs,
      sessions_organization,
      optimize_global_progression,
      health_data_source,
      setLevel: (l) => setLevelState(l),
      toggleSport: (sport) => {
        setSelectedSports((prev) => {
          const has = prev.includes(sport);
          const next = has ? prev.filter((s) => s !== sport) : [...prev, sport];
          setSportConfigs((cfg) => {
            if (has) {
              const copy = { ...cfg };
              delete copy[sport];
              return copy;
            }
            if (cfg[sport]) return cfg;
            return { ...cfg, [sport]: defaultSportConfig(sport) };
          });
          return next;
        });
      },
      setSportConfig: (sport, patch) => {
        setSportConfigs((cfg) => ({
          ...cfg,
          [sport]: { ...(cfg[sport] ?? defaultSportConfig(sport)), ...patch },
        }));
      },
      setSessionsOrganization: (v) => setSessionsOrganizationState(v),
      setOptimizeGlobal: (v) => setOptimizeGlobalState(v),
      setHealthDataSource: (v) => setHealthDataSourceState(v),
    }),
    [
      level,
      selectedSports,
      sportConfigs,
      sessions_organization,
      optimize_global_progression,
      health_data_source,
    ],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
