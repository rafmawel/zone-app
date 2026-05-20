import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from './ui/ZoneText';

export interface SliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (next: number) => void;
  label?: string;
}

export function Slider({ min, max, value, onChange, label }: SliderProps): React.ReactElement {
  const items: number[] = [];
  for (let i = min; i <= max; i += 1) items.push(i);

  return (
    <View>
      {label ? (
        <ZoneText variant="label" style={styles.label}>
          {label}
        </ZoneText>
      ) : null}
      <View style={styles.row}>
        {items.map((n) => {
          const active = n === value;
          return (
            <TouchableOpacity
              key={n}
              onPress={() => onChange(n)}
              activeOpacity={0.8}
              style={[
                styles.pill,
                {
                  borderColor: active ? colors.accent.gold : colors.border,
                  backgroundColor: active ? colors.bg.elevated : colors.bg.card,
                },
              ]}
            >
              <ZoneText
                variant="label"
                style={{
                  color: active ? colors.accent.gold : colors.text.primary,
                  fontFamily: 'Inter-Bold',
                }}
              >
                {n}
              </ZoneText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 10, color: colors.text.secondary },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: {
    minWidth: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
});
