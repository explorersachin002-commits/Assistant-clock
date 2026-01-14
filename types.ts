
export interface WeatherData {
  temp: number;
  code: number;
  description: string;
  wind: number;
}

export enum AppState {
  STANDBY = 'STANDBY',
  RINGING = 'RINGING',
  COMPLETED = 'COMPLETED'
}

export type SoundPreset = 'Zen' | 'Ethereal' | 'Bright' | 'Custom';

export interface AlarmSettings {
  time: string;
  isDaily: boolean;
  isSet: boolean;
  soundPreset: SoundPreset;
  customSoundData?: string; // Base64 or ObjectURL string
}
