import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import { getRunSession, type RunSession } from '@/lib/firestore';
import { formatPaceShort, sessionName, sessionPurpose } from '@/lib/runningEngine';
import { formatSpeed } from '@/utils/paceUtils';
import { formatDuration } from '@/lib/hyroxScience';
import { getZoneLevel } from '@/lib/zoneScore';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { frenchLongDate } from '@/lib/frenchDate';

/** Weather tag keys → emoji + French label, mirroring the run recap screen. */
const WEATHER_LABELS: Record<string, string> = {
  sunny: '☀️ Ensoleillé',
  cloudy: '🌥️ Nuageux',
  rain: '🌧️ Pluie',
  wind: '🌬️ Vent',
  heat: '🥵 Chaleur',
  cold: '🥶 Froid',
  fog: '🌫️ Brouillard',
};

/** Legacy single-condition field → chip label (fallback when no multi-select). */
const CONDITION_LABELS: Record<string, string> = {
  heat: '🥵 Chaleur',
  wind: '🌬️ Vent',
  rain: '🌧️ Pluie',
};

function conditionChips(run: RunSession): string[] {
  const tags = (run.conditions_list ?? [])
    .map((k) => WEATHER_LABELS[k] ?? k)
    .filter((s) => s.length > 0);
  if (tags.length > 0) return tags;
  if (run.conditions && run.conditions !== 'normal') {
    const label = CONDITION_LABELS[run.conditions];
    if (label) return [label];
  }
  return [];
}

function locationLabel(run: RunSession): string {
  if (run.mode === 'manual') return 'Saisie manuelle';
  return run.location === 'treadmill' ? 'Tapis' : 'Extérieur';
}

export default function RunDetailScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const runId = params.id ?? '';
  const [run, setRun] = useState<RunSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const user = auth.currentUser;
      if (!user || !runId) {
        setError('Séance introuvable.');
        setLoading(false);
        return;
      }
      try {
        const r = await getRunSession(user.uid, runId);
        if (cancelled) return;
        setRun(r);
        setError(r ? null : 'Séance introuvable.');
      } catch {
        if (!cancelled) setError('Erreur de chargement.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const zoneScore = run?.zone_score_at_start ?? null;
  const zoneLevel = zoneScore !== null ? getZoneLevel(zoneScore) : null;
  const accentColor = zoneLevel?.color ?? colors.run;

  const distance =
    run?.actual_distance_km != null ? `${run.actual_distance_km.toFixed(2)} km` : '—';
  const duration =
    run?.actual_duration_seconds != null ? formatDuration(run.actual_duration_seconds) : '—';
  const pace = run?.avg_pace_sec_per_km ? `${formatPaceShort(run.avg_pace_sec_per_km)} /km` : '—';
  const speed = run?.avg_pace_sec_per_km ? formatSpeed(run.avg_pace_sec_per_km) : '—';
  const chips = run ? conditionChips(run) : [];

  return (
    <SafeScreen>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={styles.closeBtn}
        >
          <ArrowLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <Skeleton width="100%" height={28} borderRadius={8} />
            <Skeleton width="60%" height={14} borderRadius={6} style={styles.skelGap} />
            <Skeleton width="100%" height={90} borderRadius={12} style={styles.skelGap} />
            <Skeleton width="100%" height={90} borderRadius={12} style={styles.skelGap} />
          </View>
        ) : error || !run ? (
          <View style={styles.empty}>
            <ZoneText variant="heading" style={styles.errorTitle}>
              {error ?? 'Séance introuvable'}
            </ZoneText>
            <View style={styles.errorAction}>
              <Button title="Retour" onPress={() => router.back()} />
            </View>
          </View>
        ) : (
          <>
            <ZoneText variant="heading" style={styles.title}>
              {frenchLongDate(run.date)}
            </ZoneText>
            <View style={styles.metaRow}>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.metaText}>
                Course · {sessionName(run.session_type)}
              </ZoneText>
              <View style={[styles.badge, { backgroundColor: colors.run }]}>
                <ZoneText style={styles.badgeText}>{run.session_type}</ZoneText>
              </View>
            </View>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.purpose}>
              {sessionPurpose(run.session_type)}
            </ZoneText>

            {zoneLevel ? (
              <View style={[styles.zoneCard, { borderLeftColor: accentColor }]}>
                <ZoneText variant="label" style={[styles.zoneCardTitle, { color: accentColor }]}>
                  Score Zone au départ : {zoneScore} · {zoneLevel.label}
                </ZoneText>
                {run.zone_message ? (
                  <ZoneText
                    variant="caption"
                    color={colors.text.secondary}
                    style={styles.zoneMessage}
                  >
                    {run.zone_message}
                  </ZoneText>
                ) : null}
              </View>
            ) : null}

            <View style={styles.statGrid}>
              <StatCell label="DISTANCE" value={distance} accent />
              <StatCell label="DURÉE" value={duration} />
            </View>
            <View style={styles.statGrid}>
              <StatCell label="RYTHME MOY." value={pace} />
              <StatCell label="VITESSE" value={speed} />
            </View>

            <View style={styles.detailCard}>
              <DetailRow label="RPE ressenti" value={run.rpe != null ? `${run.rpe} / 10` : '—'} />
              <DetailRow label="Lieu" value={locationLabel(run)} />
              <View style={styles.conditionRow}>
                <ZoneText variant="caption" color={colors.text.muted} style={styles.detailLabel}>
                  Conditions
                </ZoneText>
                {chips.length > 0 ? (
                  <View style={styles.chips}>
                    {chips.map((c) => (
                      <View key={c} style={styles.chip}>
                        <ZoneText variant="caption" color={colors.text.secondary}>
                          {c}
                        </ZoneText>
                      </View>
                    ))}
                  </View>
                ) : (
                  <ZoneText variant="label" style={styles.detailValue}>
                    —
                  </ZoneText>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.statCell}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.statLabel}>
        {label}
      </ZoneText>
      <ZoneText
        variant="heading"
        style={[styles.statValue, accent ? { color: colors.run } : null]}
      >
        {value}
      </ZoneText>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.detailRow}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.detailLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="label" style={styles.detailValue}>
        {value}
      </ZoneText>
    </View>
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
  content: { paddingHorizontal: 24, paddingBottom: 32 },
  loadingWrap: { paddingVertical: 24 },
  skelGap: { marginTop: 16 },
  empty: { paddingVertical: 80, alignItems: 'center' },
  errorTitle: { fontSize: 22, color: colors.text.muted, textAlign: 'center' },
  errorAction: { marginTop: 24, alignSelf: 'stretch' },
  title: { fontSize: 30, color: colors.text.primary, marginTop: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  metaText: { fontSize: 12 },
  purpose: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: colors.bg.primary, fontFamily: 'Inter_700Bold', fontSize: 12 },
  zoneCard: {
    marginTop: 16,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderRadius: 12,
    padding: 14,
  },
  zoneCardTitle: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1 },
  zoneMessage: { marginTop: 6, lineHeight: 17 },
  statGrid: { flexDirection: 'row', marginTop: 12 },
  statCell: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  statLabel: { letterSpacing: 1, fontSize: 10 },
  statValue: { fontSize: 24, color: colors.text.primary, marginTop: 6, lineHeight: 28 },
  detailCard: {
    marginTop: 16,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  detailLabel: { fontSize: 12 },
  detailValue: { fontSize: 14, color: colors.text.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, flex: 1, marginLeft: 12 },
  chip: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
