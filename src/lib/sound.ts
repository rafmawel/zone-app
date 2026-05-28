/**
 * Lightweight rest-timer sounds via expo-av.
 *
 * Sounds are loaded lazily and reused. All calls are guarded so audio
 * problems never affect the timer logic.
 */

import { Audio } from 'expo-av';

let beep: Audio.Sound | null = null;
let endSound: Audio.Sound | null = null;
let audioModeSet = false;

async function ensureAudioMode(): Promise<void> {
  if (audioModeSet) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });
    audioModeSet = true;
  } catch {
    // non-fatal
  }
}

async function play(
  current: Audio.Sound | null,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  moduleId: number,
  assign: (s: Audio.Sound) => void,
): Promise<void> {
  try {
    await ensureAudioMode();
    let sound = current;
    if (!sound) {
      const created = await Audio.Sound.createAsync(moduleId, { shouldPlay: false });
      sound = created.sound;
      assign(sound);
    }
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // ignore playback failures
  }
}

/**
 * Short beep played during the final countdown seconds.
 */
export async function playBeep(): Promise<void> {
  await play(
    beep,
    require('../../assets/beep.wav'),
    (s) => {
      beep = s;
    },
  );
}

/**
 * Longer tone played when the rest timer reaches zero.
 */
export async function playRestComplete(): Promise<void> {
  await play(
    endSound,
    require('../../assets/beep-long.wav'),
    (s) => {
      endSound = s;
    },
  );
}

/**
 * Release loaded sounds. Call when tearing down the session.
 */
export async function unloadSounds(): Promise<void> {
  try {
    if (beep) {
      await beep.unloadAsync();
      beep = null;
    }
    if (endSound) {
      await endSound.unloadAsync();
      endSound = null;
    }
  } catch {
    // ignore
  }
}
