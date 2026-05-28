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
import type { PurchasesPackage } from 'react-native-purchases';
import { auth } from '@/lib/firebase';
import { updateSubscriptionStatus } from '@/lib/firestore';
import {
  PRO_FEATURES,
  getCurrentOffering,
  getProExpiryDate,
  purchasePackage,
  restorePurchases,
} from '@/lib/subscriptions';
import { usePro } from '@/hooks/usePro';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ZoneOrbe } from '@/components/ZoneOrbe';

type PlanKey = 'monthly' | 'annual';

interface PlanCard {
  key: PlanKey;
  title: string;
  price: string;
  unit: string;
  footnote: string;
  badge?: string;
  pkg: PurchasesPackage | null;
}

const FALLBACK_PLANS: Record<PlanKey, PlanCard> = {
  monthly: {
    key: 'monthly',
    title: 'MENSUEL',
    price: '9,99 €',
    unit: '/ mois',
    footnote: 'Annulable à tout moment',
    pkg: null,
  },
  annual: {
    key: 'annual',
    title: 'ANNUEL',
    price: '79,99 €',
    unit: '/ an',
    footnote: 'Soit 6,67 € / mois · Économise 33%',
    badge: 'MEILLEUR CHOIX',
    pkg: null,
  },
};

function buildPlansFromOffering(
  monthly: PurchasesPackage | null,
  annual: PurchasesPackage | null,
): Record<PlanKey, PlanCard> {
  return {
    monthly: {
      ...FALLBACK_PLANS.monthly,
      pkg: monthly,
      price: monthly?.product.priceString ?? FALLBACK_PLANS.monthly.price,
    },
    annual: {
      ...FALLBACK_PLANS.annual,
      pkg: annual,
      price: annual?.product.priceString ?? FALLBACK_PLANS.annual.price,
      footnote: buildAnnualFootnote(monthly, annual),
    },
  };
}

function buildAnnualFootnote(
  monthly: PurchasesPackage | null,
  annual: PurchasesPackage | null,
): string {
  if (!annual) return FALLBACK_PLANS.annual.footnote;
  const annualPrice = annual.product.price;
  if (!Number.isFinite(annualPrice) || annualPrice <= 0) {
    return FALLBACK_PLANS.annual.footnote;
  }
  const perMonth = annualPrice / 12;
  const currency = annual.product.currencyCode ?? '€';
  const monthlyPrice = monthly?.product.price ?? 0;
  if (monthlyPrice > 0) {
    const savingsPct = Math.max(
      0,
      Math.round(((monthlyPrice * 12 - annualPrice) / (monthlyPrice * 12)) * 100),
    );
    return `Soit ${perMonth.toFixed(2)} ${currency} / mois · Économise ${savingsPct}%`;
  }
  return `Soit ${perMonth.toFixed(2)} ${currency} / mois`;
}

export default function PaywallScreen(): React.ReactElement {
  const router = useRouter();
  const { refresh } = usePro();
  const [selected, setSelected] = useState<PlanKey>('annual');
  const [loadingOffering, setLoadingOffering] = useState<boolean>(true);
  const [plans, setPlans] = useState<Record<PlanKey, PlanCard>>(FALLBACK_PLANS);
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'error' | 'info'>(
    'info',
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const offering = await getCurrentOffering();
      if (cancelled) return;
      if (!offering) {
        setPlans(FALLBACK_PLANS);
        setLoadingOffering(false);
        return;
      }
      setPlans(
        buildPlansFromOffering(offering.monthly ?? null, offering.annual ?? null),
      );
      setLoadingOffering(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onPurchase = async (): Promise<void> => {
    const plan = plans[selected];
    if (!plan.pkg) {
      setStatusTone('error');
      setStatusMessage("L'offre n'est pas encore disponible. Réessaie plus tard.");
      return;
    }
    setBusy('purchase');
    setStatusMessage(null);
    const result = await purchasePackage(plan.pkg);
    setBusy(null);
    if (result.success && result.isPro) {
      await syncProState();
      await refresh();
      setStatusTone('success');
      setStatusMessage('Essai gratuit activé. Bienvenue dans Zone Pro.');
      setTimeout(() => router.replace('/(app)/'), 600);
      return;
    }
    if (!result.success && !result.error) {
      // user cancelled
      return;
    }
    setStatusTone('error');
    setStatusMessage(result.error ?? "Échec du paiement. Réessaie.");
  };

  const onRestore = async (): Promise<void> => {
    setBusy('restore');
    setStatusMessage(null);
    const result = await restorePurchases();
    setBusy(null);
    if (result.success && result.isPro) {
      await syncProState();
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
          <ZoneText
            variant="label"
            size={16}
            color={colors.text.primary}
            style={styles.tagline}
          >
            Le programme que les champions utilisent.
          </ZoneText>
          <View style={styles.divider} />
          <View style={styles.orbWrap}>
            <ZoneOrbe score={73} size={80} animated />
          </View>
          <ZoneText
            variant="heading"
            size={36}
            color={colors.accent.gold}
            style={styles.exampleScore}
          >
            73 · FORME OPTIMALE
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted}>
            Analyse en temps réel de ta condition
          </ZoneText>
        </View>

        <View style={styles.featuresList}>
          {PRO_FEATURES.map((feature, idx) => (
            <View
              key={feature.label}
              style={[
                styles.featureRow,
                idx > 0 ? styles.featureSeparator : null,
              ]}
            >
              <View style={styles.featureIcon}>
                <Check size={16} color={colors.accent.gold} />
              </View>
              <View style={styles.featureBody}>
                <ZoneText
                  variant="label"
                  size={14}
                  color={colors.text.primary}
                  style={styles.featureLabel}
                >
                  {feature.label}
                </ZoneText>
                <ZoneText
                  variant="caption"
                  size={12}
                  color={colors.accent.goldDark}
                  style={styles.featureDetail}
                >
                  {feature.detail}
                </ZoneText>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.pricing}>
          <PlanCardView
            plan={plans.monthly}
            selected={selected === 'monthly'}
            loading={loadingOffering}
            onPress={() => setSelected('monthly')}
          />
          <PlanCardView
            plan={plans.annual}
            selected={selected === 'annual'}
            loading={loadingOffering}
            onPress={() => setSelected('annual')}
          />
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
          <ZoneText
            variant="caption"
            color={statusColor}
            style={styles.statusMessage}
          >
            {statusMessage}
          </ZoneText>
        ) : null}

        <View style={styles.cta}>
          <Button
            title={
              busy === 'purchase'
                ? '...'
                : 'COMMENCER MON ESSAI GRATUIT'
            }
            variant="primary"
            loading={busy === 'purchase'}
            disabled={busy !== null}
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

async function syncProState(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const expiresAt = await getProExpiryDate();
    await updateSubscriptionStatus(user.uid, {
      isPro: true,
      expiresAt,
      platform: 'android',
    });
  } catch {
    // best-effort
  }
}

interface PlanCardViewProps {
  plan: PlanCard;
  selected: boolean;
  loading: boolean;
  onPress: () => void;
}

function PlanCardView({
  plan,
  selected,
  loading,
  onPress,
}: PlanCardViewProps): React.ReactElement {
  const borderColor = selected
    ? colors.accent.gold
    : plan.badge
      ? colors.accent.goldDark
      : colors.border;
  return (
    <TouchableOpacity
      style={[styles.planCard, { borderColor }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.planHeader}>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.planTitle}>
          {plan.title}
        </ZoneText>
        {plan.badge ? (
          <View style={styles.badge}>
            <ZoneText variant="caption" size={9} color={colors.bg.primary}>
              {plan.badge}
            </ZoneText>
          </View>
        ) : null}
      </View>
      {loading ? (
        <Skeleton width="80%" height={32} borderRadius={6} style={styles.priceSkeleton} />
      ) : (
        <ZoneText variant="heading" size={32} color={colors.text.primary}>
          {plan.price}
        </ZoneText>
      )}
      <ZoneText variant="caption" color={colors.text.muted}>
        {plan.unit}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.planFootnote}>
        {plan.footnote}
      </ZoneText>
    </TouchableOpacity>
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
    marginBottom: 24,
  },
  title: {
    letterSpacing: 3,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 8,
    textAlign: 'center',
  },
  divider: {
    width: 80,
    height: 1,
    backgroundColor: colors.accent.gold,
    marginVertical: 16,
    opacity: 0.6,
  },
  orbWrap: {
    marginVertical: 8,
  },
  exampleScore: {
    marginTop: 12,
    letterSpacing: 1.5,
  },
  featuresList: {
    backgroundColor: colors.bg.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  featureSeparator: {
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  featureIcon: {
    marginTop: 2,
  },
  featureBody: {
    flex: 1,
  },
  featureLabel: {
    marginBottom: 2,
  },
  featureDetail: {
    lineHeight: 16,
  },
  pricing: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  planCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.bg.card,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  planTitle: {
    letterSpacing: 1.2,
  },
  badge: {
    backgroundColor: colors.accent.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priceSkeleton: {
    marginBottom: 4,
  },
  planFootnote: {
    marginTop: 6,
  },
  trialNote: {
    textAlign: 'center',
    marginTop: 8,
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
    marginTop: 16,
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
