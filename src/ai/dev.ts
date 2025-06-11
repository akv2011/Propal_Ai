import { config } from 'dotenv';
config();

import '@/ai/flows/convert-text-to-speech.ts';
import '@/ai/flows/transcribe-user-speech.ts';
import '@/ai/flows/respond-to-user-query.ts';