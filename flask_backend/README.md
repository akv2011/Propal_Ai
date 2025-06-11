# VoiceFlow AI Flask Backend

This Flask backend serves as the API layer for the VoiceFlow AI application, handling all the AI-related operations for the voice agent:

## Features

- **Speech-to-Text (STT)**: Converts user audio to text using Deepgram
- **Text Generation (LLM)**: Generates responses to user queries using Groq's LLama 3 model
- **Text-to-Speech (TTS)**: Converts AI responses to speech using ElevenLabs
- **Metrics Logging**: Tracks and logs latency metrics including:
  - EOU delay (End of Utterance)
  - TTFT (Time to First Token)
  - TTFB (Time to First Byte)
  - Total latency
- **Metrics Export**: Exports metrics to Excel spreadsheets

## API Endpoints

- **POST /api/stt**: Converts audio to text
- **POST /api/llm**: Generates AI response from text
- **POST /api/tts**: Converts text to speech
- **POST /api/conversation**: Processes a full conversation turn (STT → LLM → TTS)
- **GET /metrics**: Retrieves all logged metrics
- **GET /metrics/export**: Exports metrics to Excel file

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Create a `.env` file in the flask_backend directory with:
   ```
   DEEPGRAM_API_KEY=your_deepgram_api_key
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   ELEVENLABS_VOICE_ID=your_preferred_voice_id
   GROQ_API_KEY=your_groq_api_key
   ```

3. Run the server:
   ```bash
   python app.py
   ```

The server will run on http://localhost:5000 by default.

## Integration with Frontend

Update your Next.js frontend to make API calls to this Flask backend instead of using Genkit.