
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Hardened Decoy Generation: 
 * We NO LONGER send the real message to Gemini. 
 * Instead, we ask for generic cover stories to maintain Zero-Knowledge.
 */
export const getDecoySuggestions = async (): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate 4 harmless, boring, and generic chat messages that could serve as a 'cover story' in a messaging app. 
      The messages should be common small talk about weather, food, work, or daily chores. 
      Return as a JSON array of strings. Do not include any sensitive context.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Error:", error);
    return [
      "Did you see the weather forecast for tomorrow?",
      "I'm thinking of ordering pizza tonight.",
      "Just finished that book we talked about.",
      "Are we still on for the meeting later?"
    ];
  }
};

/**
 * Sensitive content detection now happens locally (regex/keywords) 
 * to avoid sending secrets to the cloud. This function is kept for 
 * non-secret contextual warnings if needed, but for CipherX hardening, 
 * we minimize its use on secret plaintext.
 */
export const checkMessageRisk = async (message: string): Promise<{ isSensitive: boolean; reason: string }> => {
  // Simple local check first to preserve privacy
  const piiRegex = /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b|\b\d{3}-\d{2}-\d{4}\b/;
  if (piiRegex.test(message)) {
    return { isSensitive: true, reason: "Message contains patterns resembling PII (Credit Card/SSN)." };
  }
  
  // Only call AI for high-level sentiment/risk if absolutely necessary
  return { isSensitive: false, reason: "" };
};
