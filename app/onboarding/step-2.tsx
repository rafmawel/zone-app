import React, { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { SelectableCard } from '@/components/SelectableCard';
import { useOnboarding } from '@/context/OnboardingContext';
import type { SportKey } from '@/lib/firestore';

interface SportOption {
  key: SportKey;
  label: string;
  emoji: string;
  active: boolean;
}

const SPORTS: SportOption[] = [
  { key: 'halterophilie', label: 'Haltérophilie', emoji: '🏋️', active: true },
  { key: 'course', label: 'Course à pied', emoji: '🏃', active: true },
  { key: 'musculation', label: 'Musculation', emoji: '💪', active: false },
  { key: 'hyrox', label: 'Hyrox', emoji: '🔥', active: false },
  { key: 'wod', label: 'WOD', emoji: '🤸', active: false },
  { key: 'calisthenics', label: 'Calisthenics', emoji: '🧘', active: false },
  { key: 'cyclisme', label: 'Cyclisme', emoji: '🚴', active: false },
  { key: 'natation', label: 'Natation', emoji: '🏊', active: false },
  { key: 'triathlon', label: 'Triathlon', emoji: '🏆', active: false },
  { key: 'padel', label: 'Padel', emoji: '🎾', active: false },
];

export default function Step2Screen(): React.ReactElement {
  const router = useRouter();
  const { selectedSports, toggleSport } = useOnboarding();

  const hasActiveSelected = useMemo(
    () =>
      selectedSports.some((key) => SPORTS.find((s) => s.key === key)?.active === true),
    [selectedSports],
  );

  return (
    <OnboardingFrame
      step={2}
      title="Quels sports veux-tu pratiquer ?"
      subtitle="Sélectionne un ou plusieurs sports."
      onContinue={() => router.push('/onboarding/step-3')}
      continueDisabled={!hasActiveSelected}
    >
      {SPORTS.map((sport) => (
        <SelectableCard
          key={sport.key}
          title={sport.label}
          emoji={sport.emoji}
          badge={sport.active ? undefined : 'Bientôt'}
          selected={sport.active && selectedSports.includes(sport.key)}
          disabled={!sport.active}
          onPress={() => toggleSport(sport.key)}
        />
      ))}
    </OnboardingFrame>
  );
}
