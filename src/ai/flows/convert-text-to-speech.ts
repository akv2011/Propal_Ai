'use server';

/**
 * @fileOverview Converts text to speech using ElevenLabs API,
 * potentially with an emotional hint.
 *
 * - convertTextToSpeech - A function that converts text to speech.
 * - ConvertTextToSpeechInput - The input type for the convertTextToSpeech function.
 * - ConvertTextToSpeechOutput - The return type for the convertTextToSpeech function.
 */

import {z} from 'genkit';

const ConvertTextToSpeechInputSchema = z.object({
  text: z.string().describe('The text to convert to speech.'),
  emotion: z.string().optional().describe("The desired emotion for the speech, if specified (e.g., 'neutral', 'excited', 'apologetic'). This is a hint for the TTS model."),
});
export type ConvertTextToSpeechInput = z.infer<typeof ConvertTextToSpeechInputSchema>;

const ConvertTextToSpeechOutputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The audio data URI of the converted text, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ConvertTextToSpeechOutput = z.infer<typeof ConvertTextToSpeechOutputSchema>;

export async function convertTextToSpeech(input: ConvertTextToSpeechInput): Promise<ConvertTextToSpeechOutput> {
  try {
    const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel voice
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      throw new Error('ElevenLabs API key not found');
    }
    
    // Modify text based on emotion if provided
    let processedText = input.text;
    if (input.emotion) {
      processedText = `[Speaking in a ${input.emotion} tone] ${input.text}`;
    }
    
    // Call ElevenLabs API using fetch
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: processedText,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }

    // Convert response to buffer
    const audioBuffer = await response.arrayBuffer();
    
    // Convert to base64 data URI
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    const audioDataUri = `data:audio/mpeg;base64,${base64Audio}`;

    return {
      audioDataUri,
    };
  } catch (error) {
    console.error('ElevenLabs TTS error:', error);
    throw new Error(`Failed to convert text to speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
