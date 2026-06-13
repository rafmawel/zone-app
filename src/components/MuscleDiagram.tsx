import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme/colors';
import { ZoneText } from './ui/ZoneText';
import type { MuscleGroup } from '@/data/exercises';

const COLOR_INACTIVE = colors.border;
const COLOR_PRIMARY = colors.scoreGreen;
const COLOR_SECONDARY = colors.orbe.blue;
const SECONDARY_OPACITY = 0.6;
const OUTLINE = colors.bg.elevated;

export interface MuscleDiagramProps {
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
}

function useFill(
  primary: MuscleGroup[],
  secondary: MuscleGroup[],
): (m: MuscleGroup) => { fill: string; opacity: number } {
  return (m: MuscleGroup) => {
    if (primary.includes(m)) return { fill: COLOR_PRIMARY, opacity: 1 };
    if (secondary.includes(m)) return { fill: COLOR_SECONDARY, opacity: SECONDARY_OPACITY };
    return { fill: COLOR_INACTIVE, opacity: 1 };
  };
}

export function MuscleDiagram({ primary, secondary }: MuscleDiagramProps): React.ReactElement {
  const fill = useFill(primary, secondary);
  return (
    <View style={styles.wrapper}>
      <View style={styles.diagramsRow}>
        <FrontSilhouette fill={fill} />
        <BackSilhouette fill={fill} />
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: COLOR_PRIMARY }]} />
          <ZoneText variant="caption" color={colors.text.secondary}>
            Muscle primaire
          </ZoneText>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.dot,
              { backgroundColor: COLOR_SECONDARY, opacity: SECONDARY_OPACITY },
            ]}
          />
          <ZoneText variant="caption" color={colors.text.secondary}>
            Muscle secondaire
          </ZoneText>
        </View>
      </View>
    </View>
  );
}

type FillFn = (m: MuscleGroup) => { fill: string; opacity: number };

function FrontSilhouette({ fill }: { fill: FillFn }): React.ReactElement {
  const shoulders = fill('shoulders');
  const chest = fill('chest');
  const biceps = fill('biceps');
  const forearms = fill('forearms');
  const core = fill('core');
  const hipFlexors = fill('hip_flexors');
  const quads = fill('quadriceps');
  const calves = fill('calves');

  return (
    <View style={styles.diagramCol}>
      <Svg width={140} height={220} viewBox="0 0 140 220">
        <Circle cx={70} cy={20} r={13} fill={OUTLINE} stroke={colors.border} strokeWidth={1} />
        <Rect x={64} y={32} width={12} height={6} rx={2} fill={OUTLINE} />
        <Ellipse cx={42} cy={50} rx={14} ry={9} {...shoulders} />
        <Ellipse cx={98} cy={50} rx={14} ry={9} {...shoulders} />
        <Path
          d="M 50 50 L 90 50 Q 96 70 90 86 L 50 86 Q 44 70 50 50 Z"
          {...chest}
        />
        <Ellipse cx={31} cy={75} rx={8} ry={17} {...biceps} />
        <Ellipse cx={109} cy={75} rx={8} ry={17} {...biceps} />
        <Ellipse cx={25} cy={108} rx={7} ry={16} {...forearms} />
        <Ellipse cx={115} cy={108} rx={7} ry={16} {...forearms} />
        <Rect x={52} y={88} width={36} height={32} rx={6} {...core} />
        <Rect x={54} y={122} width={32} height={10} rx={4} {...hipFlexors} />
        <Ellipse cx={58} cy={156} rx={11} ry={22} {...quads} />
        <Ellipse cx={82} cy={156} rx={11} ry={22} {...quads} />
        <Ellipse cx={58} cy={196} rx={8} ry={16} {...calves} />
        <Ellipse cx={82} cy={196} rx={8} ry={16} {...calves} />
      </Svg>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.viewLabel}>
        Avant
      </ZoneText>
    </View>
  );
}

function BackSilhouette({ fill }: { fill: FillFn }): React.ReactElement {
  const traps = fill('traps');
  const shoulders = fill('shoulders');
  const upperBack = fill('upper_back');
  const lats = fill('lats');
  const triceps = fill('triceps');
  const forearms = fill('forearms');
  const lowerBack = fill('lower_back');
  const glutes = fill('glutes');
  const hamstrings = fill('hamstrings');
  const calves = fill('calves');

  return (
    <View style={styles.diagramCol}>
      <Svg width={140} height={220} viewBox="0 0 140 220">
        <Circle cx={70} cy={20} r={13} fill={OUTLINE} stroke={colors.border} strokeWidth={1} />
        <Rect x={64} y={32} width={12} height={6} rx={2} fill={OUTLINE} />
        <Path
          d="M 56 40 L 84 40 Q 86 48 70 52 Q 54 48 56 40 Z"
          {...traps}
        />
        <Ellipse cx={42} cy={52} rx={14} ry={9} {...shoulders} />
        <Ellipse cx={98} cy={52} rx={14} ry={9} {...shoulders} />
        <Rect x={50} y={54} width={40} height={26} rx={6} {...upperBack} />
        <Path
          d="M 50 80 L 90 80 L 92 110 L 70 116 L 48 110 Z"
          {...lats}
        />
        <Ellipse cx={31} cy={75} rx={8} ry={17} {...triceps} />
        <Ellipse cx={109} cy={75} rx={8} ry={17} {...triceps} />
        <Ellipse cx={25} cy={108} rx={7} ry={16} {...forearms} />
        <Ellipse cx={115} cy={108} rx={7} ry={16} {...forearms} />
        <Rect x={56} y={114} width={28} height={16} rx={6} {...lowerBack} />
        <Ellipse cx={58} cy={140} rx={12} ry={10} {...glutes} />
        <Ellipse cx={82} cy={140} rx={12} ry={10} {...glutes} />
        <Ellipse cx={58} cy={170} rx={11} ry={22} {...hamstrings} />
        <Ellipse cx={82} cy={170} rx={11} ry={22} {...hamstrings} />
        <Ellipse cx={58} cy={200} rx={8} ry={14} {...calves} />
        <Ellipse cx={82} cy={200} rx={8} ry={14} {...calves} />
      </Svg>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.viewLabel}>
        Arrière
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  diagramsRow: { flexDirection: 'row', justifyContent: 'center' },
  diagramCol: { alignItems: 'center', marginHorizontal: 8 },
  viewLabel: { marginTop: 4, letterSpacing: 1 },
  legendRow: { flexDirection: 'row', marginTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
});
