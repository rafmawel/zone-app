import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart3, CalendarDays, Home, Play, User } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { SessionMiniBar, SESSION_MINI_BAR_HEIGHT } from '@/components/SessionMiniBar';
import { useSession } from '@/context/SessionContext';

const TAB_BAR_HEIGHT = 70;

function TabLabel({ label, focused }: { label: string; focused: boolean }): React.ReactElement {
  return (
    <ZoneText
      variant="caption"
      size={10}
      color={focused ? colors.accent.gold : colors.text.muted}
      style={styles.tabLabel}
    >
      {label}
    </ZoneText>
  );
}

/** Center action tab: gold circle with a white play glyph. */
function CenterIcon(): React.ReactElement {
  return (
    <View style={styles.centerCircle}>
      <Play size={26} color={colors.bg.primary} fill={colors.bg.primary} />
    </View>
  );
}

export default function AppLayout(): React.ReactElement {
  const { activeSession } = useSession();
  const insets = useSafeAreaInsets();
  const showMini = activeSession !== null;

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent.gold,
          tabBarInactiveTintColor: colors.text.muted,
          tabBarStyle: {
            backgroundColor: colors.bg.card,
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingTop: 8,
            paddingBottom: (Platform.OS === 'android' ? 8 : 0) + insets.bottom,
          },
          tabBarItemStyle: { flex: 1, minWidth: 0, paddingHorizontal: 0 },
          sceneStyle: {
            paddingBottom: showMini ? SESSION_MINI_BAR_HEIGHT : 0,
            backgroundColor: colors.bg.primary,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarIcon: ({ color }) => <Home size={22} color={color} />,
            tabBarLabel: ({ focused }) => <TabLabel label="Accueil" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="aujourd-hui"
          options={{
            tabBarIcon: ({ color }) => <CalendarDays size={22} color={color} />,
            tabBarLabel: ({ focused }) => <TabLabel label="Aujourd'hui" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="entrainer"
          options={{
            tabBarIcon: () => <CenterIcon />,
            tabBarLabel: ({ focused }) => <TabLabel label="Entraîner" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="analyse"
          options={{
            tabBarIcon: ({ color }) => <BarChart3 size={22} color={color} />,
            tabBarLabel: ({ focused }) => <TabLabel label="Analyse" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="moi"
          options={{
            tabBarIcon: ({ color }) => <User size={22} color={color} />,
            tabBarLabel: ({ focused }) => <TabLabel label="Moi" focused={focused} />,
          }}
        />
      </Tabs>
      {showMini ? (
        <View style={[styles.miniWrap, { bottom: TAB_BAR_HEIGHT + insets.bottom }]} pointerEvents="box-none">
          <SessionMiniBar />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.primary },
  tabLabel: { fontFamily: 'Inter-Medium', marginTop: 2, textAlign: 'center' },
  centerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -14,
    shadowColor: colors.accent.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  miniWrap: { position: 'absolute', left: 0, right: 0 },
});
