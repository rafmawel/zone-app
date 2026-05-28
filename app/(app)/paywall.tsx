import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Check, Lock, X } from 'lucide-react-native';
import type { PurchasesOffering } from 'react-native-purchases';
import { auth } from '@/lib/firebase';
import { getSubscription, saveSubscription } from '@/lib/firestore';
import {
  RC_PRODUCTS,
  findPackage,
  getCurrentOffering,
  purchasePackage,
  restorePurchases,
} from '@/lib/subscriptions';
import { useProSports } from '@/hooks/useProSports';
import {
  ALL_PRO_SPORTS,
  BUNDLE_PRICE,
  BUNDLE_PRICE_EUR,
  EMPTY_SUBSCRIPTION,
  SPORT_LABELS,
  SPORT_PRICE_EUR,
  type ProSport,
  type ZoneSubscription,
} from '@/types/subscription';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

const BASE_FEATURES: string[] = [
  'Risque de blessure en temps réel',
  'Charge aiguë vs chronique (ACWR)',
  'Dette de sommeil et impact performance',
  'Fenêtre de forme optimale',
  'Bilan hebdomadaire personnalisé',
  'Score de préparation composite',
];

const SPORT_ICONS: Record<ProSport, string> = {
  running: '🏃',
  hyrox: '🔥',
  musculation: '💪',
  weightlifting: '🏋️',
};

const SPORT_FEATURES: Record<ProSport, string[]> = {
  running: [
    'VDOT et progression sur 8 semaines',
    'Compliance 80/20 et analyse de pace',
    'Prédictions de course personnalisées',
  ],
  hyrox: [
    'Analyse de chaque station',
    'Suivi lactate en course',
    'Projection de temps de course',
  ],
  musculation: [
    'MEV/MAV/MRV en temps réel',
    "Score d'hypertrophie par séance",
    'Planification de décharge intelligente',
  ],
  weightlifting: [
    'Compliance tableau de Prilepin',
    'Progression 1RM et vélocité',
    'Analyse technique par mouvement',
  ],
};

const GRID_ORDER: ProSport[] = [
  'running',
  'hyrox',
  'musculation',
  'weightlifting',
];

function formatEur(value: number): string {
  return `${value.toFixed(2).replace('.', ',')}€`;
}

export default function PaywallScreen(): React.ReactElement {
  const router = useRouter();
  const { proSports: ownedSports, refresh } = useProSports();
  const [selected, setSelected] = useState<Set<ProSport>>(new Set());
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'error' | 'info'>(
    'info',
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await getCurrentOffering();
      if (!cancelled) setOffering(current);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSport = (sport: ProSport): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport);
      else next.add(sport);
      return next;
    });
  };

  const selectAll = (): void => {
    setSelected((prev) => {
      const all = ALL_PRO_SPORTS.every((s) => prev.has(s));
      return all ? new Set() : new Set(ALL_PRO_SPORTS);
    });
  };

  const selectedCount = selected.size;
  const isBundle = selectedCount === ALL_PRO_SPORTS.length;
  const total = isBundle ? BUNDLE_PRICE_EUR : selectedCount * SPORT_PRICE_EUR;

  const ctaTitle = useMemo(() => {
    if (selectedCount === 0) return 'SÉLECTIONNEZ AU MOINS UN SPORT';
    if (isBundle) return 'COMMENCER MON ESSAI — TOUT INCLURE';
    return 'COMMENCER MON ESSAI GRATUIT';
  }, [selectedCount, isBundle]);

  const onPurchase = async (): Promise<void> => {
    if (selectedCount === 0) return;
    const user = auth.currentUser;
    if (!user) {
      setStatusTone('error');
      setStatusMessage('Session expirée. Reconnecte-toi.');
      return;
    }
    setBusy('purchase');
    setStatusMessage(null);

    const productIds = isBundle
      ? [RC_PRODUCTS.bundle]
      : Array.from(selected).map((s) => RC_PRODUCTS[s]);

    let resolved: ZoneSubscription = EMPTY_SUBSCRIPTION;
    let purchasedAny = false;
    let lastError: string | null = null;

    for (const productId of productIds) {
      const pkg = findPackage(offering, productId);
      if (!pkg) {
        lastError =
          "L'offre n'est pas encore disponible. Réessaie plus tard.";
        continue;
      }
      const result = await purchasePackage(pkg);
      if (result.success) {
        purchasedAny = true;
        resolved = result.subscription;
      } else if (result.error) {
        lastError = result.error;
      } else {
        // User cancelled — stop the flow silently.
        setBusy(null);
        return;
      }
    }

    if (purchasedAny && resolved.proSports.length > 0) {
      try {
        await saveSubscription(user.uid, resolved);
      } catch {
        // best-effort
      }
      await refresh();
      setBusy(null);
      setStatusTone('success');
      setStatusMessage('Essai gratuit activé. Bienvenue dans Zone Pro.');
      setTimeout(() => router.replace('/(app)/'), 600);
      return;
    }

    setBusy(null);
    setStatusTone('error');
    setStatusMessage(lastError ?? 'Échec du paiement. Réessaie.');
  };

  const onRestore = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    setBusy('restore');
    setStatusMessage(null);
    const result = await restorePurchases();
    setBusy(null);
    if (result.success && result.subscription.proSports.length > 0) {
      try {
        await saveSubscription(user.uid, result.subscription);
      } catch {
        // best-effort
      }
      await refresh();
      setStatusTone('success');
      setStatusMessage('Abonnement restauré.');
      setTimeout(() => router.replace('/(app)/'), 600);
      return;
    }
    if (result.error) {
      setStatusTone('error');
      setStatusMessage(result.error);
      return;
    }
    setStatusTone('info');
    setStatusMessage('Aucun achat trouvé sur ce compte.');
  };

  const statusColor = useMemo(() => {
    if (statusTone === 'success') return colors.success;
    if (statusTone === 'error') return colors.danger;
    return colors.text.muted;
  }, [statusTone]);

  return (
    <SafeScreen>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={16}>
          <X size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <ZoneText
            variant="heading"
            size={52}
            color={colors.accent.gold}
            style={styles.title}
          >
            ZONE PRO
          </ZoneText>
          <ZoneText variant="label" size={15} color={colors.text.primary} style={styles.tagline}>
            L'analyse que les champions utilisent.
          </ZoneText>
          <ZoneText variant="label" size={15} color={colors.text.secondary} style={styles.taglineSub}>
            Choisissez votre programme.
          </ZoneText>
        </View>

        {/* Zone Pro Base */}
        <View style={styles.baseCard}>
          <View style={styles.baseHeader}>
            <View>
              <ZoneText variant="heading" size={22} color={colors.accent.gold} style={styles.baseTitle}>
                ZONE PRO BASE
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.muted}>
                Inclus avec tout abonnement
              </ZoneText>
            </View>
            <View style={styles.offertBadge}>
              <Check size={12} color={colors.bg.primary} />
              <ZoneText variant="caption" size={11} color={colors.bg.primary} style={styles.offertText}>
                OFFERT
              </ZoneText>
            </View>
          </View>
          <View style={styles.baseFeatures}>
            {BASE_FEATURES.map((feature) => (
              <View key={feature} style={styles.baseFeatureRow}>
                <ZoneText variant="body" size={13} color={colors.accent.gold}>
                  ✦
                </ZoneText>
                <ZoneText variant="body" size={13} color={colors.text.primary} style={styles.baseFeatureText}>
                  {feature}
                </ZoneText>
              </View>
            ))}
          </View>
        </View>

        {/* Sport selector */}
        <ZoneText variant="label" size={15} color={colors.text.primary} style={styles.selectorHeading}>
          Choisissez votre ou vos sports :
        </ZoneText>
        <View style={styles.grid}>
          {GRID_ORDER.map((sport) => {
            const isSelected = selected.has(sport);
            const owned = ownedSports.includes(sport);
            return (
              <TouchableOpacity
                key={sport}
                activeOpacity={0.85}
                onPress={() => toggleSport(sport)}
                style={[styles.sportCard, isSelected ? styles.sportCardSelected : null]}
              >
                <View style={styles.sportCardHeader}>
                  <ZoneText style={styles.sportIcon}>{SPORT_ICONS[sport]}</ZoneText>
                  {isSelected ? (
                    <View style={styles.checkBadge}>
                      <Check size={12} color={colors.bg.primary} />
                    </View>
                  ) : null}
                </View>
                <ZoneText variant="label" size={14} color={colors.text.primary} style={styles.sportName}>
                  {SPORT_LABELS[sport]}
                </ZoneText>
                <ZoneText variant="caption" color={colors.accent.gold} style={styles.sportPrice}>
                  {owned ? 'Déjà inclus' : '4,99€ / mois'}
                </ZoneText>
                <View style={styles.sportFeatureList}>
                  {SPORT_FEATURES[sport].map((f) => (
                    <ZoneText
                      key={f}
                      variant="caption"
                      size={11}
                      color={colors.text.secondary}
                      style={styles.sportFeature}
                    >
                      • {f}
                    </ZoneText>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Bundle banner */}
        {!isBundle ? (
          <TouchableOpacity activeOpacity={0.85} onPress={selectAll} style={styles.bundleBanner}>
            <ZoneText variant="heading" size={18} color={colors.bg.primary} style={styles.bundleTitle}>
              TOUT INCLURE · {BUNDLE_PRICE}/mois
            </ZoneText>
            <ZoneText variant="caption" size={12} color={colors.bg.primary} style={styles.bundleSub}>
              Économisez {formatEur(ALL_PRO_SPORTS.length * SPORT_PRICE_EUR - BUNDLE_PRICE_EUR)} vs les sports séparés
            </ZoneText>
          </TouchableOpacity>
        ) : null}

        {/* Price summary */}
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <ZoneText variant="caption" size={13} color={colors.text.primary}>
              Zone Pro Base
            </ZoneText>
            <ZoneText variant="caption" size={13} color={colors.accent.gold}>
              OFFERT
            </ZoneText>
          </View>
          {isBundle ? (
            <View style={styles.summaryRow}>
              <ZoneText variant="caption" size={13} color={colors.text.primary}>
                Tout inclure
              </ZoneText>
              <ZoneText variant="caption" size={13} color={colors.text.primary}>
                {BUNDLE_PRICE}/mois
              </ZoneText>
            </View>
          ) : (
            Array.from(selected).map((sport) => (
              <View key={sport} style={styles.summaryRow}>
                <ZoneText variant="caption" size={13} color={colors.text.primary}>
                  {SPORT_LABELS[sport]}
                </ZoneText>
                <ZoneText variant="caption" size={13} color={colors.text.primary}>
                  4,99€/mois
                </ZoneText>
              </View>
            ))
          )}
          <View style={styles.summaryDivider} />
          {isBundle ? (
            <View style={styles.summaryRow}>
              <ZoneText variant="label" size={15} color={colors.text.primary}>
                TOTAL
              </ZoneText>
              <ZoneText variant="label" size={15} color={colors.accent.gold}>
                {BUNDLE_PRICE}/mois (au lieu de {formatEur(ALL_PRO_SPORTS.length * SPORT_PRICE_EUR)})
              </ZoneText>
            </View>
          ) : (
            <View style={styles.summaryRow}>
              <ZoneText variant="label" size={15} color={colors.text.primary}>
                TOTAL
              </ZoneText>
              <ZoneText variant="label" size={15} color={colors.accent.gold}>
                {formatEur(total)}/mois
              </ZoneText>
            </View>
          )}
        </View>

        <ZoneText variant="label" color={colors.text.primary} style={styles.trialNote}>
          Essai gratuit 7 jours · Aucun débit immédiat
        </ZoneText>
        <View style={styles.secureRow}>
          <Lock size={12} color={colors.text.muted} />
          <ZoneText variant="caption" color={colors.text.muted}>
            Sécurisé · Géré par Google Play
          </ZoneText>
        </View>

        {statusMessage ? (
          <ZoneText variant="caption" color={statusColor} style={styles.statusMessage}>
            {statusMessage}
          </ZoneText>
        ) : null}

        <View style={styles.cta}>
          <Button
            title={busy === 'purchase' ? '...' : ctaTitle}
            variant="primary"
            loading={busy === 'purchase'}
            disabled={busy !== null || selectedCount === 0}
            onPress={onPurchase}
          />
          <TouchableOpacity
            onPress={onRestore}
            disabled={busy !== null}
            style={styles.restoreRow}
            hitSlop={12}
          >
            {busy === 'restore' ? (
              <ActivityIndicator size="small" color={colors.accent.gold} />
            ) : (
              <>
                <ZoneText variant="caption" color={colors.text.muted}>
                  Déjà abonné ?{' '}
                </ZoneText>
                <ZoneText variant="caption" color={colors.accent.gold}>
                  Restaurer mes achats
                </ZoneText>
              </>
            )}
          </TouchableOpacity>
        </View>

        <ZoneText variant="caption" size={10} color={colors.text.muted} style={styles.legal}>
          L'abonnement se renouvelle automatiquement sauf annulation 24h avant
          la fin de la période. Gérez vos abonnements dans les paramètres
          Google Play.
        </ZoneText>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    letterSpacing: 3,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 8,
    textAlign: 'center',
  },
  taglineSub: {
    marginTop: 2,
    textAlign: 'center',
  },
  baseCard: {
    backgroundColor: colors.bg.card,
    borderColor: colors.accent.gold,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  baseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  baseTitle: {
    letterSpacing: 1,
  },
  offertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent.gold,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  offertText: { fontFamily: 'Inter-Bold', letterSpacing: 0.5 },
  baseFeatures: { marginTop: 14, gap: 8 },
  baseFeatureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  baseFeatureText: { flex: 1, lineHeight: 18 },
  selectorHeading: { marginBottom: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sportCard: {
    width: '48.5%',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  sportCardSelected: {
    borderColor: colors.accent.gold,
  },
  sportCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sportIcon: { fontSize: 24 },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportName: { marginTop: 8 },
  sportPrice: { marginTop: 2, fontFamily: 'Inter-Medium' },
  sportFeatureList: { marginTop: 8, gap: 4 },
  sportFeature: { lineHeight: 15 },
  bundleBanner: {
    backgroundColor: colors.accent.gold,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  bundleTitle: { letterSpacing: 1, textAlign: 'center' },
  bundleSub: { marginTop: 2, textAlign: 'center', fontFamily: 'Inter-Medium' },
  summary: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  trialNote: {
    textAlign: 'center',
    marginTop: 4,
  },
  secureRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 8,
  },
  statusMessage: {
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  cta: {
    marginTop: 12,
  },
  restoreRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 14,
  },
  legal: {
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 14,
  },
});
