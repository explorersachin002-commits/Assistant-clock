
import React, { useState, useEffect, useRef } from 'react';
import { 
  AlarmClock, 
  Sun, 
  Calendar, 
  MapPin,
  CheckCircle,
  X,
  Sparkles,
  Loader2,
  Repeat,
  Heart,
  VolumeX,
  Clock,
  Music,
  Upload,
  PlayCircle
} from 'lucide-react';
import { AppState, WeatherData, AlarmSettings, SoundPreset } from './types';
import { generateMorningScript, generateGeminiAudio } from './services/geminiService';
import { decodeBase64, decodeAudioData, playPresetChime, playCustomBuffer } from './utils/audio';

const QUOTES = [
  "Write it on your heart that every day is the best day in the year.",
  "The breeze at dawn has secrets to tell you. Don't go back to sleep.",
  "Each morning we are born again. What we do today is what matters most.",
  "Give every day the chance to become the most beautiful day of your life.",
  "Success is not final, failure is not fatal: it is the courage to continue that counts.",
  "Your future is created by what you do today, not tomorrow.",
  "Believe you can and you're halfway there."
];

const PRESETS: SoundPreset[] = ['Zen', 'Ethereal', 'Bright'];

const App: React.FC = () => {
  // --- STATE ---
  const [view, setView] = useState<AppState>(AppState.STANDBY);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [alarm, setAlarm] = useState<AlarmSettings>(() => {
    const saved = localStorage.getItem('zenrise_alarm_v2');
    return saved ? JSON.parse(saved) : { time: '', isDaily: false, isSet: false, soundPreset: 'Zen' };
  });
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState("Detecting...");
  const [quote, setQuote] = useState(QUOTES[0]);
  const [alarmMessage, setAlarmMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [customAudioBuffer, setCustomAudioBuffer] = useState<AudioBuffer | null>(null);

  // --- REFS ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const chimeIntervalRef = useRef<number | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const customSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('zenrise_alarm_v2', JSON.stringify(alarm));
  }, [alarm]);

  // Initial Content Fetch & Custom Audio Restore
  useEffect(() => {
    fetchWeather();
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
    
    if (alarm.soundPreset === 'Custom' && alarm.customSoundData) {
      loadCustomBuffer(alarm.customSoundData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCustomBuffer = async (base64: string) => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const tempCtx = new AudioContextClass();
    try {
      const arrayBuffer = decodeBase64(base64.split(',')[1]).buffer;
      const buffer = await tempCtx.decodeAudioData(arrayBuffer);
      setCustomAudioBuffer(buffer);
    } catch (e) {
      console.error("Failed to load custom audio buffer", e);
    } finally {
      tempCtx.close();
    }
  };

  // Timer & Alarm Check
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      if (alarm.isSet && alarm.time && view === AppState.STANDBY) {
        const [h, m] = alarm.time.split(':');
        if (now.getHours() === parseInt(h) && now.getMinutes() === parseInt(m) && now.getSeconds() === 0) {
          handleTriggerAlarm();
        }
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarm, view]);

  // --- LOGIC ---
  const fetchWeather = () => {
    if (!navigator.geolocation) {
      setLocationName("Location Unavailable");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
          const data = await res.json();
          setWeather({
            temp: Math.round(data.current_weather.temperature),
            code: data.current_weather.weathercode,
            description: getWeatherDesc(data.current_weather.weathercode),
            wind: data.current_weather.windspeed
          });
          setLocationName("Your Location");
        } catch (e) {
          console.error("Weather fetch failed", e);
          setLocationName("Offline");
        }
      },
      () => setLocationName("Permission Denied")
    );
  };

  const getWeatherDesc = (code: number) => {
    if (code === 0) return "Clear Skies";
    if (code <= 3) return "Partly Cloudy";
    if (code >= 51 && code <= 67) return "Rainy Day";
    if (code >= 71) return "Snowy Day";
    return "Overcast";
  };

  const handleTriggerAlarm = async () => {
    setView(AppState.RINGING);
    setIsProcessing(true);
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;
    
    if (alarm.soundPreset === 'Custom' && customAudioBuffer) {
      customSourceRef.current = playCustomBuffer(ctx, customAudioBuffer);
    } else {
      const playAndSchedule = () => playPresetChime(ctx, alarm.soundPreset);
      playAndSchedule();
      chimeIntervalRef.current = window.setInterval(playAndSchedule, 7000);
    }

    // Prepare content
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const freshQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    setQuote(freshQuote);
    
    const wData = weather || { temp: 20, description: "pleasant", code: 0, wind: 5 };
    
    try {
      const script = await generateMorningScript(wData, dateStr, freshQuote);
      setAlarmMessage(script);
      
      const { data, sampleRate } = await generateGeminiAudio(script);
      const audioBytes = decodeBase64(data);
      const audioBuffer = await decodeAudioData(audioBytes, ctx, sampleRate);
      
      // Stop chimes and transition to Gemini voice
      if (chimeIntervalRef.current) clearInterval(chimeIntervalRef.current);
      if (customSourceRef.current) {
        customSourceRef.current.stop();
        customSourceRef.current = null;
      }
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start();
      voiceSourceRef.current = source;
      
    } catch (e) {
      console.error("Alarm sequence failed", e);
      setAlarmMessage("Good morning! Time to start a beautiful new day.");
    } finally {
      setIsProcessing(false);
    }
  };

  const stopAlarm = () => {
    if (chimeIntervalRef.current) clearInterval(chimeIntervalRef.current);
    if (voiceSourceRef.current) voiceSourceRef.current.stop();
    if (customSourceRef.current) customSourceRef.current.stop();
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (!alarm.isDaily) {
      setAlarm(prev => ({ ...prev, isSet: false }));
    }

    setView(AppState.COMPLETED);
    setTimeout(() => {
      setView(AppState.STANDBY);
    }, 6000);
  };

  const toggleAlarm = () => {
    if (!alarm.time) return;
    setAlarm(prev => ({ ...prev, isSet: !prev.isSet }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const result = ev.target?.result as string;
      setAlarm(prev => ({ ...prev, soundPreset: 'Custom', customSoundData: result }));
      loadCustomBuffer(result);
    };
    reader.readAsDataURL(file);
  };

  const previewSound = (preset: SoundPreset) => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    if (preset === 'Custom' && customAudioBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = customAudioBuffer;
      src.connect(ctx.destination);
      src.start();
      setTimeout(() => ctx.close(), 5000);
    } else {
      playPresetChime(ctx, preset);
      setTimeout(() => ctx.close(), 5000);
    }
  };

  // --- RENDER HELPERS ---
  const renderStandby = () => (
    <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 overflow-y-auto max-h-screen no-scrollbar">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 text-slate-400 mb-2">
          <Calendar size={18} />
          <span className="uppercase tracking-widest text-sm font-semibold">
            {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
        <h1 className="text-7xl font-black tracking-tighter tabular-nums drop-shadow-2xl">
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
        </h1>
      </div>

      <div className="bg-slate-900/60 backdrop-blur-2xl rounded-[2.5rem] p-6 border border-slate-800 shadow-2xl space-y-6">
        {/* Alarm Time Section */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${alarm.isSet ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-500'}`}>
              <AlarmClock size={28} />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-none mb-1">Alarm Time</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Daily Briefing</p>
            </div>
          </div>
          <input
            type="time"
            value={alarm.time}
            disabled={alarm.isSet}
            onChange={(e) => setAlarm(prev => ({ ...prev, time: e.target.value }))}
            className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2 text-white outline-none focus:ring-2 ring-indigo-500 transition-all disabled:opacity-50 text-xl font-mono"
          />
        </div>

        {/* Sound Selection Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 px-2">
            <Music size={14} />
            <span>Wake up sound</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map(p => (
              <button
                key={p}
                disabled={alarm.isSet}
                onClick={() => setAlarm(prev => ({ ...prev, soundPreset: p }))}
                className={`p-3 rounded-2xl border flex flex-col items-center gap-1 transition-all group ${
                  alarm.soundPreset === p 
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' 
                    : 'bg-slate-950/40 border-slate-800 text-slate-500 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-sm">{p}</span>
                  <PlayCircle 
                    size={16} 
                    className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-indigo-400" 
                    onClick={(e) => { e.stopPropagation(); previewSound(p); }}
                  />
                </div>
              </button>
            ))}
            <button
              disabled={alarm.isSet}
              onClick={() => fileInputRef.current?.click()}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-1 transition-all group ${
                alarm.soundPreset === 'Custom' 
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' 
                  : 'bg-slate-950/40 border-slate-800 text-slate-500 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                   <Upload size={14} />
                   <span className="font-bold text-sm">{alarm.customSoundData ? 'Custom Set' : 'Upload'}</span>
                </div>
                {alarm.customSoundData && (
                  <PlayCircle 
                    size={16} 
                    className="opacity-100 transition-opacity cursor-pointer text-indigo-400" 
                    onClick={(e) => { e.stopPropagation(); previewSound('Custom'); }}
                  />
                )}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept="audio/*" 
              />
            </button>
          </div>
        </div>

        {/* Repeat Toggle */}
        <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-2xl border border-slate-800/50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${alarm.isDaily ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
              <Repeat size={18} />
            </div>
            <span className="text-sm font-semibold">Repeat Daily</span>
          </div>
          <button 
            onClick={() => !alarm.isSet && setAlarm(prev => ({ ...prev, isDaily: !prev.isDaily }))}
            className={`w-10 h-5 rounded-full transition-colors relative ${alarm.isDaily ? 'bg-indigo-600' : 'bg-slate-700'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${alarm.isDaily ? 'left-5.5' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Set Alarm Button */}
        <div className="space-y-4">
          <button
            onClick={toggleAlarm}
            disabled={!alarm.time}
            className={`w-full py-4 rounded-[2rem] font-bold text-lg shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
              alarm.isSet 
              ? "bg-slate-800 text-red-400 border border-slate-700" 
              : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
            }`}
          >
            {alarm.isSet ? <><X size={20} /> Disable Alarm</> : <><CheckCircle size={20} /> Set Alarm</>}
          </button>

          {!alarm.isSet && (
            <button 
              onClick={handleTriggerAlarm}
              className="w-full py-2 text-xs text-slate-400 hover:text-indigo-400 flex items-center justify-center gap-2 transition-colors group"
            >
              <Sparkles size={14} className="group-hover:animate-pulse" />
              Test AI Briefing Now
            </button>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-8 flex items-center justify-center gap-4 text-slate-500">
        <div className="flex items-center gap-1 px-3 py-1 bg-slate-900/40 rounded-full border border-slate-800/50 text-[9px] font-bold tracking-widest uppercase">
          <MapPin size={10} className="text-indigo-500" />
          {locationName}
        </div>
        {weather && (
          <div className="flex items-center gap-1 px-3 py-1 bg-slate-900/40 rounded-full border border-slate-800/50 text-[9px] font-bold tracking-widest uppercase">
            <Sun size={10} className="text-orange-500" />
            {weather.temp}°C {weather.description}
          </div>
        )}
      </div>
    </div>
  );

  const renderRinging = () => (
    <div className="w-full max-w-md animate-in zoom-in-95 duration-700 text-slate-900 px-4">
      <div className="bg-white/90 backdrop-blur-xl rounded-[3rem] p-8 shadow-[0_32px_64px_rgba(0,0,0,0.1)] border border-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-orange-100/50 to-indigo-100/50 -z-10" />
        
        <div className="text-center">
          <div className="inline-flex p-5 rounded-full bg-orange-500 text-white mb-6 shadow-2xl shadow-orange-500/40 animate-bounce">
            <Sun size={54} fill="currentColor" strokeWidth={1.5} />
          </div>
          
          <h2 className="text-4xl font-black tracking-tight mb-1">Rise & Shine</h2>
          <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] mb-8">Good Morning</p>
          
          <div className="relative group mb-6">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl blur opacity-10 transition duration-1000"></div>
            <div className="bg-white/50 backdrop-blur-md rounded-2xl p-6 shadow-inner text-left border border-slate-100 min-h-[120px] flex items-center justify-center">
              {isProcessing ? (
                <div className="flex flex-col items-center gap-3 text-indigo-500">
                  <Loader2 className="animate-spin" size={28} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Generating Briefing</span>
                </div>
              ) : (
                <p className="text-slate-700 text-lg leading-relaxed font-medium italic">
                  "{alarmMessage}"
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-8">
            <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center border border-slate-50">
               <span className="text-[9px] font-black uppercase text-slate-400 mb-1">Temp</span>
               <span className="text-2xl font-black text-slate-800">{weather?.temp ?? '--'}°C</span>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center border border-slate-50">
               <span className="text-[9px] font-black uppercase text-slate-400 mb-1">Wind</span>
               <span className="text-2xl font-black text-slate-800">{weather?.wind ?? '--'} <span className="text-xs">km/h</span></span>
            </div>
          </div>

          <button
            onClick={stopAlarm}
            className="w-full py-5 rounded-[2rem] bg-slate-900 hover:bg-slate-800 text-white font-black text-xl shadow-2xl flex items-center justify-center gap-4 transition-all active:scale-95 group"
          >
            <VolumeX size={28} className="group-hover:rotate-12 transition-transform" />
            I'M AWAKE
          </button>
        </div>
      </div>
    </div>
  );

  const renderCompleted = () => (
    <div className="animate-in zoom-in-90 duration-500 flex flex-col items-center justify-center text-center p-8">
      <div className="mb-8 p-8 bg-white rounded-full shadow-[0_20px_40px_rgba(244,114,182,0.3)] border-4 border-pink-50 ring-4 ring-pink-50/50">
        <Heart className="text-pink-500 fill-pink-500 animate-pulse" size={64} />
      </div>
      <h2 className="text-5xl font-black text-slate-800 mb-4 tracking-tight">Heroic Day Ahead</h2>
      <p className="text-xl text-slate-600 max-w-xs mx-auto font-medium">
        Go out and make it happen.
      </p>
      
      {alarm.isDaily && (
        <div className="mt-10 flex items-center gap-3 px-6 py-3 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100/50">
          <CheckCircle size={18} />
          Resetting for Tomorrow
        </div>
      )}
    </div>
  );

  return (
    <div className={`min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden transition-all duration-1000 ${
      view === AppState.STANDBY ? 'bg-slate-950' : 'bg-indigo-50'
    }`}>
      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute top-[-10%] right-[-10%] w-[50%] aspect-square bg-indigo-600/10 rounded-full blur-[120px] transition-opacity duration-1000 ${view === AppState.STANDBY ? 'opacity-100' : 'opacity-0'}`} />
        <div className={`absolute bottom-[-10%] left-[-10%] w-[40%] aspect-square bg-purple-600/10 rounded-full blur-[100px] transition-opacity duration-1000 ${view === AppState.STANDBY ? 'opacity-100' : 'opacity-0'}`} />
        <div className={`absolute inset-0 bg-gradient-to-b from-orange-100/40 to-indigo-100/40 transition-opacity duration-1000 ${view !== AppState.STANDBY ? 'opacity-100' : 'opacity-0'}`} />
      </div>

      <div className="z-10 w-full flex flex-col items-center">
        {view === AppState.STANDBY && renderStandby()}
        {view === AppState.RINGING && renderRinging()}
        {view === AppState.COMPLETED && renderCompleted()}
      </div>

      {view === AppState.STANDBY && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center items-center gap-8 opacity-20 hover:opacity-100 transition-opacity duration-500">
           <div className="flex items-center gap-2 group cursor-help">
             <Clock size={16} />
             <span className="text-[10px] font-black uppercase tracking-widest">Precision Alarms</span>
           </div>
           <div className="w-1 h-1 rounded-full bg-slate-500" />
           <div className="flex items-center gap-2 group cursor-help">
             <Sparkles size={16} />
             <span className="text-[10px] font-black uppercase tracking-widest">Gemini Powered</span>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
