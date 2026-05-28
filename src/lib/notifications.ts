import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const ANDROID_CHANNEL_ID = 'checkin';
const REMINDER_TITLE = "Quelle est ta Zone aujourd'hui ?";
const REMINDER_BODY = 'Fais ton check-in pour calibrer ta séance.';
const REMINDER_DATA = { screen: 'checkin' } as const;

/** Foreground behaviour: show the reminder as a banner, no sound/badge. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Rappel check-in',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#C9A84C',
  });
}

/**
 * Ask for notification permission, requesting it only if not already
 * decided. Returns whether notifications are granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain === false) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/**
 * Schedule a daily repeating check-in reminder at the given local time.
 * Replaces any previously scheduled reminder.
 */
export async function scheduleDailyCheckinReminder(hour: number, minute: number): Promise<void> {
  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: REMINDER_TITLE, body: REMINDER_BODY, data: REMINDER_DATA },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
}

/** Cancel the daily check-in reminder (user opted out). */
export async function cancelCheckinReminder(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * If the user already did their check-in today, skip today's reminder:
 * cancel the repeating reminder and schedule a one-shot for tomorrow at
 * the same time. The daily repeat is restored on the next launch when the
 * user has not yet checked in.
 */
export async function skipTodayReminderIfCheckedIn(
  hour: number,
  minute: number,
  hasCheckedInToday: boolean,
): Promise<void> {
  if (!hasCheckedInToday) return;
  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(hour, minute, 0, 0);
  await Notifications.scheduleNotificationAsync({
    content: { title: REMINDER_TITLE, body: REMINDER_BODY, data: REMINDER_DATA },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: next,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
}

/** Parse "HH:MM" into {hour, minute}; falls back to 08:00. */
export function parseTime(value: string | undefined | null): { hour: number; minute: number } {
  if (value) {
    const [h, m] = value.split(':').map((p) => parseInt(p, 10));
    if (Number.isFinite(h) && Number.isFinite(m)) {
      return { hour: Math.max(0, Math.min(23, h)), minute: Math.max(0, Math.min(59, m)) };
    }
  }
  return { hour: 8, minute: 0 };
}

/** Format an hour/minute pair as "HH:MM". */
export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
