import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface DetectedObject {
  name: string;
  confidence: number;
}

export async function preloadModel() {
  // No-op for Gemini, but kept for compatibility with Scanner component
  return Promise.resolve();
}

export async function detectObjects(base64Image: string): Promise<DetectedObject[]> {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set");
    return [];
  }

  try {
    // We use Gemini 2.0 Flash as it's highly capable and fast
    // We prompt it to act as a high-precision object detector
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
            {
              text: "You are a high-precision object detection system (YOLOv8-style). List all household objects, furniture, and storage units in this image. Return a JSON array of objects with 'name' and 'confidence' (0.0 to 1.0).",
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
            },
            required: ["name", "confidence"],
          },
        },
      },
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (error) {
    console.error("Error detecting objects:", error);
    return [];
  }
}
