/**
 * @fileOverview This file defines speech-to-text transcription using Deepgram API.
 *
 * - transcribeUserSpeech - A function that handles the speech-to-text transcription process.
 * - TranscribeUserSpeechInput - The input type for the transcribeUserSpeech function.
 * - TranscribeUserSpeechOutput - The return type for the transcribeUserSpeech function.
 */

'use server';

import { createClient } from '@deepgram/sdk';
import {z} from 'genkit';

const TranscribeUserSpeechInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "Audio data as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});

export type TranscribeUserSpeechInput = z.infer<typeof TranscribeUserSpeechInputSchema>;

const TranscribeUserSpeechOutputSchema = z.object({
  transcription: z.string().describe('The transcribed text from the user audio.'),
});

export type TranscribeUserSpeechOutput = z.infer<typeof TranscribeUserSpeechOutputSchema>;

// Initialize Deepgram client
const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');

export async function transcribeUserSpeech(input: TranscribeUserSpeechInput): Promise<TranscribeUserSpeechOutput> {
  try {
    // Parse the data URI to extract the audio data
    const [header, base64Data] = input.audioDataUri.split(',');
    
    if (!base64Data) {
      throw new Error('Invalid data URI format');
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(base64Data, 'base64');
    
    // Determine the audio format from the data URI
    const mimeType = header.match(/data:([^;]+);/)?.[1] || 'audio/wav';
    
    // Call Deepgram API
    const response = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        punctuate: true,
        diarize: false,
        mimetype: mimeType,
      }
    );

    // Extract transcription from response
    const transcript = response.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    
    if (!transcript) {
      throw new Error('No transcription found in the audio');
    }

    return {
      transcription: transcript,
    };
  } catch (error) {
    console.error('Deepgram transcription error:', error);
    throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
