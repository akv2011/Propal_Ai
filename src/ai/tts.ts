import ElevenLabs from "elevenlabs-node";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Default to Rachel

if (!ELEVENLABS_API_KEY) {
  throw new Error("ELEVENLABS_API_KEY is not set in the environment variables.");
}

const elevenLabsClient = new ElevenLabs({
  apiKey: ELEVENLABS_API_KEY,
});

export interface TtsOptions {
  voiceId?: string;
  modelId?: string; // e.g., "eleven_multilingual_v2"
  voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
  };
  // Add other ElevenLabs options as needed
}

/**
 * Converts text to speech using ElevenLabs and returns an audio stream or buffer.
 */
export const textToSpeech = async (
  text: string,
  options?: TtsOptions
): Promise<ReadableStream<Uint8Array> | null> => {
  if (!text.trim()) {
    console.log("TTS: Received empty text, skipping audio generation.");
    return null;
  }
  try {
    const audioStream = await elevenLabsClient.textToSpeechStream({
      textInput: text,
      voiceId: options?.voiceId || ELEVENLABS_VOICE_ID,
      modelId: options?.modelId || "eleven_multilingual_v2",
      voiceSettings: options?.voiceSettings, // Pass the nested voiceSettings object
      responseType: "stream",
    });
    return audioStream;
  } catch (error) {
    console.error("Error generating speech with ElevenLabs:", error);
    throw error;
  }
};

/**
 * Converts text to speech using ElevenLabs and returns an audio buffer.
 */
export const textToSpeechBuffer = async (
    text: string,
    options?: TtsOptions
  ): Promise<Buffer> => {
    if (!text.trim()) {
      console.log("TTS: Received empty text, skipping audio generation.");
      return Buffer.from([]);
    }
    try {
      const response = await elevenLabsClient.textToSpeech({
        textInput: text,
        voiceId: options?.voiceId || ELEVENLABS_VOICE_ID,
        modelId: options?.modelId || "eleven_multilingual_v2",
        voiceSettings: options?.voiceSettings, // Pass the nested voiceSettings object
        responseType: "arraybuffer",
      });
      // The elevenlabs-node SDK returns an object with an 'audio' property containing the ArrayBuffer
      if (response && response.audio) {
        return Buffer.from(response.audio);
      }
      return Buffer.from([]);
    } catch (error) {
      console.error("Error generating speech buffer with ElevenLabs:", error);
      throw error;
    }
  };

// Example Usage (you'll integrate this into your agent pipeline):
/*
async function testTts() {
  const text = "नमस्ते, आपका स्वागत है।"; // Example in Hindi
  try {
    const audioStream = await textToSpeech(text, { voiceId: "YOUR_INDIAN_VOICE_ID_IF_DIFFERENT" });
    if (audioStream) {
      // In a real application, you would pipe this stream to the LiveKit participant's audio track
      console.log("TTS audio stream generated. You would now play this.");
      // Example: const audioBuffer = await streamToBuffer(audioStream);
      // then play audioBuffer
    } else {
      console.log("TTS did not produce an audio stream (possibly empty text).");
    }
  } catch (error) {
    console.error("Failed to generate speech:", error);
  }
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
    }
    return Buffer.concat(chunks);
}

testTts();
*/
