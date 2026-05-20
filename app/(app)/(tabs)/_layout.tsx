import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BookOpen, Calendar, Dumbbell, Home, Sparkles, User } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { SessionMiniBar, SESSION_MINI_BAR_HEIGHT } from '@/components/SessionMiniBar';
import { useSession } from '@/context/SessionContext';

const TAB_BAR_HEIGHT = 64;

export default function AppLayout(): React.ReactElement {
  const { activeSession } = useSession();
  const showMini = activeSession !== null;

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: colors.accent.gold,
          tabBarInactiveTintColor: colors.text.muted,
          tabBarStyle: {
            backgroundColor: colors.bg.card,
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
            height: TAB_BAR_HEIGHT,
            paddingTop: 8,
            paddingBottom: 8,
          },
          sceneStyle: {
            paddingBottom: showMini ? SESSION_MINI_BAR_HEIGHT : 0,
            backgroundColor: colors.bg.primary,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Accueil',
            tabBarIcon: ({ color }) => <Home size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="program"
          options={{
            title: 'Programme',
            tabBarIcon: ({ color }) => <Dumbbell size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Bibliothèque',
            tabBarIcon: ({ color }) => <BookOpen size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'Historique',
            tabBarIcon: ({ color }) => <Calendar size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="analytics"
          options={{
            title: 'Analytics',
            tabBarIcon: ({ color }) => <Sparkles size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarIcon: ({ color }) => <User size={24} color={color} />,
          }}
        />
      </Tabs>
      {showMini ? (
        <View style={[styles.miniWrap, { bottom: TAB_BAR_HEIGHT }]} pointerEvents="box-none">
          <SessionMiniBar />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.primary },
  miniWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
