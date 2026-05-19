import React from 'react';
import { useRouter } from 'expo-router';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { SelectableCard } from '@/components/SelectableCard';
import { useOnboarding } from '@/context/OnboardingContext';
import type { Level } from '@/lib/firestore';

interface LevelOption {
  key: Level;
  label: string;
  subtitle: string;
}

const OPTIONS: LevelOption[] = [
  { key: 'debutant', label: 'Débutant', subtitle: 'Je commence ma pratique.' },
  { key: 'intermediaire', label: 'Intermédiaire', subtitle: 'Je m’entraîne régulièrement.' },
  { key: 'avance', label: 'Avancé', subtitle: 'Je connais mes capacités.' },
  { key: 'confirme', label: 'Confirmé', subtitle: 'Je vise la performance.' },
];

export default function Step1Screen(): React.ReactElement {
  const router = useRouter();
  const { level, setLevel } = useOnboarding();

  return (
    <OnboardingFrame
      step={1}
      title="Quel est ton niveau général ?"
      onContinue={() => router.push('/onboarding/step-2')}
      continueDisabled={!level}
    >
      {OPTIONS.map((opt) => (
        <SelectableCard
          key={opt.key}
          title={opt.label}
          subtitle={opt.subtitle}
          selected={level === opt.key}
          onPress={() => setLevel(opt.key)}
        />
      ))}
    </OnboardingFrame>
  );
}
