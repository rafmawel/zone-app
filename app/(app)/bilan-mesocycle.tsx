import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import { getMesocycleBilan, getUserProfile, type MesocycleBilan } from '@/lib/firestore';
import { getExerciseById } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

const LEVEL_LABELS: Record<string, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
  confirme: 'Confirmé',
};

const WEAK_POINT_LABELS: Record<string, string> = {
  legs: 'Force des jambes',
  snatch_technique: 'Technique arraché',
  pull_strength: 'Force de tirage',
  overhead_strength: 'Force overhead',
};

function exName(id: string): string {
  return getExerciseById(id)?.name ?? id;
}

function pctDelta(before: number, after: number): number | null {
  if (before <= 0) return null;
  return Math.round(((after - before) / before) * 100);
}

export default function BilanMesocycleScreen(): React.ReactElement {
  const router = useRouter();
  const [bilan, setBilan] = useState<MesocycleBilan | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  // Default true so the nudge never flashes before the profile has loaded.
  const [bodyweightSet, setBodyweightSet] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const [b, profile] = await Promise.all([
          getMesocycleBilan(user.uid),
          getUserProfile(user.uid).catch(() => null),
        ]);
        if (!cancelled) {
          setBodyweightSet(Boolean(profile?.bodyweight_kg && profile.bodyweight_kg > 0));
        }
        // Normalize array fields so a partial/legacy doc can never crash render.
        if (!cancelled) {
          setBilan(
            b
              ? {
                  ...b,
                  progression: b.progression ?? [],
                  weak_points: b.weak_points ?? [],
                  estimated_maxes: b.estimated_maxes ?? [],
                  unevaluated_weak_points: b.unevaluated_weak_points ?? [],
                  new_exercises: b.new_exercises ?? [],
                }
              : null,
          );
        }
      } catch {
        // leave bilan null → graceful empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const goHome = (): void => router.replace('/(app)/');

  return (
    <SafeScreen>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={goHome}
          activeOpacity={0.7}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={styles.closeBtn}
        >
          <X size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <Skeleton width="70%" height={28} borderRadius={8} />
            <Skeleton width="100%" height={120} borderRadius={12} style={styles.skelGap} />
            <Skeleton width="100%" height={90} borderRadius={12} style={styles.skelGap} />
          </View>
        ) : !bilan ? (
          <View style={styles.empty}>
            <ZoneText variant="heading" style={styles.emptyTitle}>
              Aucun bilan disponible
            </ZoneText>
            <View style={styles.emptyAction}>
              <Button title="Retour" onPress={goHome} />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <ZoneText style={styles.heroEmoji}>🎉</ZoneText>
              <ZoneText variant="heading" style={styles.heroTitle}>
                MÉSOCYCLE {bilan.mesocycle_number} TERMINÉ !
              </ZoneText>
              <ZoneText variant="caption" color={colors.textSecondary} style={styles.heroSub}>
                Beau travail — voici ton bilan et la suite.
              </ZoneText>
            </View>

            {bilan.progression.length > 0 ? (
              <View style={styles.card}>
                <ZoneText style={styles.cardTitle}>PROGRESSION</ZoneText>
                {bilan.progression.map((p) => {
                  const delta = pctDelta(p.before, p.after);
                  return (
                    <View key={p.exercise_id} style={styles.progRow}>
                      <ZoneText variant="label" style={styles.progName}>
                        {exName(p.exercise_id)}
                      </ZoneText>
                      <View style={styles.progRight}>
                        {p.before > 0 ? (
                          <ZoneText variant="label" style={styles.progValue}>
                            {p.before} → {p.after} kg
                          </ZoneText>
                        ) : (
                          <ZoneText variant="label" style={styles.progValue}>
                            {p.after} kg
                          </ZoneText>
                        )}
                        {delta !== null && delta !== 0 ? (
                          <ZoneText
                            variant="caption"
                            color={delta > 0 ? colors.scoreGreen : colors.danger}
                            style={styles.progDelta}
                          >
                            {delta > 0 ? '+' : ''}
                            {delta}%
                          </ZoneText>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.card}>
              <ZoneText style={styles.cardTitle}>TON NIVEAU</ZoneText>
              <ZoneText variant="heading" style={styles.levelValue}>
                {LEVEL_LABELS[bilan.level] ?? bilan.level}
              </ZoneText>
              {bodyweightSet && bilan.snatch_ratio > 0 ? (
                <ZoneText variant="caption" color={colors.textSecondary} style={styles.levelSub}>
                  Ratio Snatch / poids de corps : {bilan.snatch_ratio.toFixed(2)}
                </ZoneText>
              ) : null}
              {!bodyweightSet ? (
                <ZoneText variant="caption" color={colors.warning} style={styles.levelSub}>
                  Renseigne ton poids de corps pour une détection de niveau précise.
                </ZoneText>
              ) : null}
            </View>

            <View style={styles.card}>
              <ZoneText style={styles.cardTitle}>POINTS À TRAVAILLER</ZoneText>
              {bilan.weak_points.map((wp) => (
                <View key={wp} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: colors.warning }]} />
                  <ZoneText variant="label" style={styles.bulletText}>
                    {WEAK_POINT_LABELS[wp] ?? wp}
                  </ZoneText>
                </View>
              ))}
              {(bilan.estimated_maxes ?? []).map((e) => (
                <View key={`est-${e.exercise_id}`} style={styles.bulletRow}>
                  <View style={[styles.bullet, styles.bulletEstimated]} />
                  <ZoneText variant="caption" color={colors.textSecondary} style={styles.bulletText}>
                    {exName(e.exercise_id)} : {e.estimated} kg (estimé depuis ta progression)
                  </ZoneText>
                </View>
              ))}
              {(bilan.unevaluated_weak_points ?? []).map((u) => (
                <View key={u.weak_point} style={styles.bulletRow}>
                  <View style={[styles.bullet, styles.bulletMuted]} />
                  <ZoneText variant="caption" color={colors.textMuted} style={styles.bulletText}>
                    Non évalué — max {exName(u.exercise_id)} obsolète (dernière mise à jour il y a{' '}
                    {u.weeks_ago} semaine{u.weeks_ago > 1 ? 's' : ''})
                  </ZoneText>
                </View>
              ))}
              {bilan.weak_points.length === 0 &&
              (bilan.unevaluated_weak_points ?? []).length === 0 ? (
                <ZoneText variant="caption" color={colors.textSecondary}>
                  Ratios équilibrés — continue comme ça.
                </ZoneText>
              ) : null}
            </View>

            <View style={styles.card}>
              <ZoneText style={styles.cardTitle}>PROCHAIN MÉSOCYCLE</ZoneText>
              {bilan.new_exercises.length > 0 ? (
                <>
                  <ZoneText variant="caption" color={colors.textSecondary} style={styles.newSub}>
                    Nouveaux exercices ajoutés :
                  </ZoneText>
                  {bilan.new_exercises.map((id) => (
                    <View key={id} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: colors.haltero }]} />
                      <ZoneText variant="label" style={styles.bulletText}>
                        {exName(id)}
                      </ZoneText>
                    </View>
                  ))}
                </>
              ) : (
                <ZoneText variant="caption" color={colors.textSecondary}>
                  Programme stable ce cycle — on consolide les acquis.
                </ZoneText>
              )}
            </View>

            <View style={styles.footer}>
              <Button
                title={`Démarrer le mésocycle ${bilan.mesocycle_number + 1}`}
                onPress={goHome}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  loadingWrap: { paddingVertical: 24 },
  skelGap: { marginTop: 16 },
  empty: { paddingVertical: 80, alignItems: 'center' },
  emptyTitle: { fontSize: 20, color: colors.textMuted, textAlign: 'center' },
  emptyAction: { marginTop: 24, alignSelf: 'stretch' },
  hero: { alignItems: 'center', marginTop: 8, marginBottom: 8 },
  heroEmoji: { fontSize: 48 },
  heroTitle: { fontSize: 24, color: colors.textPrimary, textAlign: 'center', marginTop: 8 },
  heroSub: { textAlign: 'center', marginTop: 6 },
  card: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginBottom: 12,
  },
  progRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  progName: { fontSize: 15, color: colors.textPrimary, flex: 1 },
  progRight: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  progValue: { fontSize: 15, color: colors.textPrimary },
  progDelta: { fontFamily: 'Inter_700Bold' },
  levelValue: { fontSize: 22, color: colors.haltero },
  levelSub: { marginTop: 6 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 10 },
  bullet: { width: 8, height: 8, borderRadius: 4 },
  bulletMuted: { backgroundColor: colors.textMuted },
  bulletEstimated: { backgroundColor: colors.hyrox },
  bulletText: { fontSize: 15, color: colors.textPrimary, flex: 1 },
  newSub: { marginBottom: 8 },
  footer: { marginTop: 28 },
});
