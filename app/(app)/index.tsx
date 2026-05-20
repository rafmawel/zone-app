import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, ClipboardList, Dumbbell } from 'lucide-react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { todayDateString, type DailyCheckin } from '@/lib/firestore';
import { getZoneLevel } from '@/lib/zoneScore';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Skeleton } from '@/components/ui/Skeleton';

function frenchDate(): string {
  try {
    const formatted = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return '';
  }
}

function greetingName(): string {
  const user = auth.currentUser;
  if (user?.displayName && user.displayName.trim()) return user.displayName.trim();
  return 'Athlète';
}

export default function DashboardScreen(): React.ReactElement {
  const router = useRouter();
  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [loaded, setLoaded] = useState<boolean>(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoaded(true);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'checkins', todayDateString()),
      (snap) => {
        setCheckin(snap.exists() ? (snap.data() as DailyCheckin) : null);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return unsubscribe;
  }, []);

  const score = checkin?.zone_score ?? 50;
  const level = checkin ? getZoneLevel(score) : null;
  const date = frenchDate();
  const name = greetingName();

  return (
    <SafeScreen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerZone}>
          <ZoneText variant="label" color={colors.text.secondary}>
            Bonjour, {name}
          </ZoneText>
          {date ? (
            <ZoneText variant="caption" color={colors.text.muted} style={styles.headerDate}>
              {date}
            </ZoneText>
          ) : null}
        </View>

        <View style={styles.orbeZone}>
          {!loaded ? (
            <>
              <Skeleton width={140} height={140} borderRadius={70} />
              <Skeleton width={120} height={56} style={styles.scoreSkeleton} />
              <Skeleton width={140} height={14} style={styles.labelSkeleton} />
            </>
          ) : (
            <>
              <View
                style={[
                  styles.orb,
                  {
                    backgroundColor: level ? level.color : colors.accent.gold,
                    shadowColor: level ? level.color : colors.accent.gold,
                  },
                ]}
              >
                {!checkin ? (
                  <ZoneText variant="heading" style={styles.orbQuestion}>
                    ?
                  </ZoneText>
                ) : null}
              </View>
              <ZoneText
                variant="heading"
                style={[
                  styles.scoreNumber,
                  { color: level ? level.color : colors.accent.gold },
                ]}
              >
                {score}
              </ZoneText>
              {level ? (
                <ZoneText variant="label" style={styles.zoneLabel}>
                  {level.label}
                </ZoneText>
              ) : (
                <TouchableOpacity
                  onPress={() => router.push('/(app)/checkin')}
                  activeOpacity={0.7}
                >
                  <ZoneText
                    variant="label"
                    color={colors.accent.gold}
                    style={styles.evalLink}
                  >
                    Évalue ton état
                  </ZoneText>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {loaded && !checkin ? (
          <TouchableOpacity
            onPress={() => router.push('/(app)/checkin')}
            activeOpacity={0.85}
            style={styles.ctaCard}
          >
            <ZoneText variant="label" style={styles.ctaText}>
              📋 Évalue ton état du jour
            </ZoneText>
            <ChevronRight size={20} color={colors.accent.gold} />
          </TouchableOpacity>
        ) : null}
        {loaded && checkin ? (
          <View style={styles.doneCard}>
            <ZoneText variant="label" color={colors.success} style={styles.doneText}>
              ✓ Check-in effectué · {score} pts
            </ZoneText>
          </View>
        ) : null}

        <View style={styles.sessionCard}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.sessionEyebrow}>
            PROCHAINE SÉANCE
          </ZoneText>
          <View style={styles.sessionRow}>
            <Dumbbell size={20} color={colors.accent.gold} />
            <View style={styles.sessionTextCol}>
              <ZoneText variant="label" style={styles.sessionTitle}>
                À planifier
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.muted}>
                Module entraînement à venir
              </ZoneText>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard label="Cette semaine" value="0" suffix="séances" />
          <StatCard label="Streak" value="0" suffix="jours" />
          <StatCard label="Score moyen" value="--" suffix="pts" />
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

function StatCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix: string;
}): React.ReactElement {
  return (
    <View style={styles.statCard}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.statLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="heading" style={styles.statValue}>
        {value}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted}>
        {suffix}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 },
  headerZone: { marginBottom: 16 },
  headerDate: { marginTop: 4 },
  orbeZone: { alignItems: 'center', paddingVertical: 24 },
  orb: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 6,
  },
  orbQuestion: { fontSize: 48, color: colors.bg.primary },
  scoreNumber: { fontSize: 72, marginTop: 24, lineHeight: 80 },
  scoreSkeleton: { marginTop: 24 },
  labelSkeleton: { marginTop: 12 },
  zoneLabel: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    letterSpacing: 3,
    marginTop: 4,
    color: colors.text.primary,
  },
  evalLink: { marginTop: 8, fontFamily: 'Inter-Medium' },
  ctaCard: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.accent.gold,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctaText: { color: colors.accent.gold, fontSize: 16 },
  doneCard: {
    marginTop: 24,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  doneText: { fontSize: 14 },
  sessionCard: {
    marginTop: 16,
    backgroundColor: colors.bg.card,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.gold,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sessionEyebrow: { fontFamily: 'BebasNeue', letterSpacing: 1, fontSize: 14 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  sessionTextCol: { marginLeft: 12, flex: 1 },
  sessionTitle: { color: colors.text.primary, fontSize: 16 },
  statsRow: { flexDirection: 'row', marginTop: 16, justifyContent: 'space-between' },
  statCard: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statLabel: { fontSize: 11, textAlign: 'center' },
  statValue: { fontSize: 32, color: colors.text.primary, marginTop: 4, lineHeight: 36 },
});
