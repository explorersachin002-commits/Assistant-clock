
import { SoundPreset } from "../types";

export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Generates alarm sounds based on presets.
 */
export const playPresetChime = (ctx: AudioContext, preset: SoundPreset) => {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(0.3, now + 1.5);
  masterGain.gain.exponentialRampToValueAtTime(0.01, now + 6.0);

  let notes: number[] = [];
  let type: OscillatorType = 'sine';
  let staggered = 0.3;

  switch (preset) {
    case 'Zen':
      notes = [329.63, 415.30, 493.88, 622.25, 739.99]; // E major pentatonic
      type = 'sine';
      staggered = 0.3;
      break;
    case 'Ethereal':
      notes = [261.63, 329.63, 392.00, 523.25]; // C major chord
      type = 'sine';
      staggered = 0.8; // Slower, more atmospheric
      break;
    case 'Bright':
      notes = [440.00, 554.37, 659.25, 880.00]; // A major
      type = 'triangle';
      staggered = 0.15; // Faster, snappier
      break;
    default:
      return;
  }

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.detune.value = Math.random() * 8 - 4; 

    const noteGain = ctx.createGain();
    const startTime = now + (i * staggered);
    noteGain.gain.setValueAtTime(0, startTime);
    noteGain.gain.linearRampToValueAtTime(0.15, startTime + 0.2);
    noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + 4.0);

    osc.connect(noteGain);
    noteGain.connect(masterGain);
    osc.start(startTime);
    osc.stop(now + 6.5);
  });
};

/**
 * Plays a custom audio buffer.
 */
export const playCustomBuffer = (ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode => {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.loop = true;
  source.start();
  return source;
};
