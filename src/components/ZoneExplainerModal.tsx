import React from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ZoneOrbe } from '@/components/ZoneOrbe';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';

const SCORE_EXAMPLES: { score: number; label: string }[] = [
  { score: 25, label: 'Épuisé' },
  { score: 48, label: 'Fatigué' },
  { score: 68, label: 'Prêt' },
  { score: 88, label: 'En forme' },
];

const PARAGRAPHS: string[] = [
  'Dans le sport de haut niveau, il existe un état que tout athlète recherche.',
  'Un moment où chaque geste devient instinctif. Où la fatigue s’efface. Où ton corps et ton esprit ne font plus qu’un.',
  'Les basketteurs l’appellent la Zone. Les haltérophiles le cherchent sur chaque arraché. Les coureurs le ressentent sur certaines sorties.',
  'Zone mesure ta capacité à l’atteindre aujourd’hui.',
];

export function ZoneExplainerModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}): React.ReactElement {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.orbWrap}>
              <ZoneOrbe size={80} score={75} animated />
            </View>
            <ZoneText variant="heading" style={styles.title}>
              LA ZONE
            </ZoneText>

            {PARAGRAPHS.map((p, i) => (
              <ZoneText
                key={i}
                variant="body"
                color={colors.text.secondary}
                style={styles.paragraph}
              >
                {p}
              </ZoneText>
            ))}

            <View style={styles.separator} />

            <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
              TON SCORE AUJOURD’HUI
            </ZoneText>
            <View style={styles.examplesRow}>
              {SCORE_EXAMPLES.map((ex) => (
                <View key={ex.label} style={styles.exampleCell}>
                  <ZoneOrbe size={40} score={ex.score} />
                  <ZoneText variant="caption" color={colors.text.muted} style={styles.exampleLabel}>
                    {ex.label}
                  </ZoneText>
                </View>
              ))}
            </View>

            <View style={styles.separator} />

            <ZoneText variant="caption" color={colors.text.muted} style={styles.note}>
              Le check-in quotidien calibre ton score. Plus tu es régulier, plus Zone te connaît.
            </ZoneText>

            <View style={styles.closeBtn}>
              <Button title="Fermer" variant="secondary" onPress={onClose} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  backdropFill: { flex: 1 },
  sheet: {
    backgroundColor: colors.bg.elevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginTop: 10,
    marginBottom: 6,
  },
  scroll: { paddingHorizontal: 24, paddingTop: 12 },
  orbWrap: { alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 40, color: colors.scoreGreen, textAlign: 'center', letterSpacing: 2 },
  paragraph: { textAlign: 'center', marginTop: 12, lineHeight: 21 },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 22 },
  eyebrow: { letterSpacing: 2, textAlign: 'center', marginBottom: 14 },
  examplesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  exampleCell: { alignItems: 'center', flex: 1 },
  exampleLabel: { marginTop: 8, fontSize: 11 },
  note: { textAlign: 'center', fontStyle: 'italic', lineHeight: 18 },
  closeBtn: { marginTop: 24 },
});
