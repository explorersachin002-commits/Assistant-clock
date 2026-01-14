
import { GoogleGenAI, Modality } from "@google/genai";
import { WeatherData } from "../types";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
};

export const generateMorningScript = async (weather: WeatherData, dateString: string, quote: string): Promise<string> => {
  const ai = getAIClient();
  const prompt = `
    You are a warm, energetic morning assistant. Write a short, spoken-word morning greeting (max 3 sentences).
    Current Date: ${dateString}.
    Weather: ${weather.temp}°C, ${weather.description}.
    Quote of the day: "${quote}".
    
    Structure:
    1. Greeting and date.
    2. Weather summary and advice (e.g., wear a light jacket).
    3. Mention the quote briefly.
    Keep it natural and conversation ready for TTS. Do not use emojis, markdown, or headers. Just plain text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    return response.text?.trim() || "Good morning! It's time to start your day.";
  } catch (error) {
    console.error("Script generation failed:", error);
    return "Good morning! Wishing you a wonderful and productive day ahead.";
  }
};

export const generateGeminiAudio = async (text: string): Promise<{ data: string; sampleRate: number }> => {
  const ai = getAIClient();
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const candidate = response.candidates?.[0];
    const audioPart = candidate?.content?.parts?.find(p => p.inlineData);
    
    if (!audioPart?.inlineData) {
      throw new Error("No audio data returned from Gemini");
    }

    // Attempt to extract sample rate from mimeType if available, default to 24000
    let sampleRate = 24000;
    const mime = audioPart.inlineData.mimeType;
    if (mime && mime.includes('rate=')) {
      const match = mime.match(/rate=(\d+)/);
      if (match) sampleRate = parseInt(match[1]);
    }

    return {
      data: audioPart.inlineData.data,
      sampleRate
    };
  } catch (error) {
    console.error("Audio generation failed:", error);
    throw error;
  }
};
