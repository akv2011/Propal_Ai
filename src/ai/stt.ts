import { createClient, DeepgramClient, LiveTranscriptionEvents } from "@deepgram/sdk";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

if (!DEEPGRAM_API_KEY) {
  throw new Error("DEEPGRAM_API_KEY is not set in the environment variables.");
}

let deepgramClient: DeepgramClient;

export const getDeepgramClient = () => {
  if (!deepgramClient) {
    deepgramClient = createClient(DEEPGRAM_API_KEY);
  }
  return deepgramClient;
};

export interface DeepgramSttOptions {
  model?: string;
  language?: string;
  puncutate?: boolean;
  smart_format?: boolean;
  // Add other Deepgram options as needed
}

/**
 * Transcribes audio using Deepgram's streaming API.
 * This is a basic example and will need to be adapted for your specific use case,
 * especially around how audio is streamed to this function.
 */
export const transcribeAudioStream = async (audioStream: any, options?: DeepgramSttOptions) => {
  const client = getDeepgramClient();
  const connection = client.listen.live({
    model: options?.model || "nova-2",
    language: options?.language || "en-US", // Adjust for Indian languages e.g. "hi" for Hindi
    punctuate: options?.puncutate !== undefined ? options.puncutate : true,
    smart_format: options?.smart_format !== undefined ? options.smart_format : true,
    interim_results: false, // Set to true if you want interim results
    // Add other options as needed, e.g., for Indian languages
  });

  return new Promise((resolve, reject) => {
    connection.on(LiveTranscriptionEvents.Open, () => {
      console.log("Deepgram connection opened.");
      // Here you would start sending audio data from audioStream to connection.send(data)
      // This part is highly dependent on how you receive and buffer audio from LiveKit
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel.alternatives[0].transcript;
      if (transcript && data.is_final) {
        console.log("Final transcript:", transcript);
        resolve(transcript); // Resolve with the final transcript
        connection.finish(); // Close the connection once final transcript is received
      }
    });

    connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error("Deepgram error:", error);
      reject(error);
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      console.log("Deepgram connection closed.");
    });

    // Placeholder for how you might handle the audio stream
    // You'll need to replace this with actual audio stream handling from LiveKit
    if (audioStream && typeof audioStream.on === 'function') {
        audioStream.on('data', (chunk: Buffer) => {
            connection.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
        });
        audioStream.on('end', () => {
            console.log("Audio stream ended, finishing Deepgram connection.");
            connection.finish();
        });
    } else {
        // If no audioStream is provided or it's not a stream, 
        // this function will wait for manual send() and finish() calls.
        console.warn("No audioStream provided or not a valid stream. Waiting for manual data sending.")
    }

  });
};

/**
 * Transcribes a pre-recorded audio buffer using Deepgram.
 */
export const transcribeAudioBuffer = async (audioBuffer: Buffer, options?: DeepgramSttOptions): Promise<string> => {
  const client = getDeepgramClient();
  try {
    const { result, error } = await client.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: options?.model || "nova-2",
        language: options?.language || "en-US", // Adjust for Indian languages
        punctuate: options?.puncutate !== undefined ? options.puncutate : true,
        smart_format: options?.smart_format !== undefined ? options.smart_format : true,
        // Add other options as needed
      }
    );

    if (error) {
      throw error;
    }

    if (result) {
      return result.results.channels[0].alternatives[0].transcript;
    }
    return "";

  } catch (err) {
    console.error("Error transcribing audio buffer with Deepgram:", err);
    throw err;
  }
};

// Example usage (you'll integrate this into your LiveKit agent pipeline):
/*
async function testDeepgram() {
  // This is a placeholder for actual audio data
  // In a real scenario, this would come from your LiveKit participant
  const dummyAudioBuffer = Buffer.from("your_audio_data_here"); 

  try {
    const transcript = await transcribeAudioBuffer(dummyAudioBuffer, { language: "en-US" });
    console.log("Transcript:", transcript);
  } catch (error) {
    console.error("Failed to transcribe:", error);
  }
}

testDeepgram();
*/
