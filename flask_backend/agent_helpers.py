\
import os
import base64
import logging
import asyncio 
from dotenv import load_dotenv

from deepgram import DeepgramClient, PrerecordedOptions
try:
    import groq
except ImportError:
    import openai as groq # Fallback
from elevenlabs.client import ElevenLabs # Changed import

load_dotenv()
logger = logging.getLogger(__name__)

# Initialize API keys
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Initialize clients
deepgram_client = None
if DEEPGRAM_API_KEY:
    try:
        deepgram_client = DeepgramClient(DEEPGRAM_API_KEY)
        logger.info("Deepgram client initialized successfully in agent_helpers.")
    except Exception as e:
        logger.error(f"Failed to initialize Deepgram client in agent_helpers: {e}")
else:
    logger.warning("DEEPGRAM_API_KEY not found. STT functionality will be unavailable.")

groq_client = None
if GROQ_API_KEY:
    try:
        groq_client = groq.Client(api_key=GROQ_API_KEY)
        logger.info("Groq client initialized successfully in agent_helpers.")
    except Exception as e:
        logger.error(f"Failed to initialize Groq client in agent_helpers: {e}")
else:
    logger.warning("GROQ_API_KEY not found. LLM functionality will be unavailable.")

elevenlabs_client = None # Added client initialization
if ELEVENLABS_API_KEY:
    try:
        elevenlabs_client = ElevenLabs(api_key=ELEVENLABS_API_KEY) # Initialize client
        logger.info("ElevenLabs client initialized successfully in agent_helpers.")
    except Exception as e:
        logger.error(f"Failed to initialize ElevenLabs client in agent_helpers: {e}")
else:
    logger.warning("ELEVENLABS_API_KEY not found in agent_helpers. TTS functionality will be unavailable.")


async def transcribe_audio_data(audio_binary, mime_type="audio/wav"):
    if not deepgram_client:
        logger.error("Deepgram client not available for transcription.")
        raise ConnectionError("Deepgram client not initialized.")
    try:
        options = PrerecordedOptions(
            model="nova-2",
            smart_format=True,
            language="en-US",
        )
        payload = {"buffer": audio_binary, "mimetype": mime_type}
        # Note: The Deepgram SDK calls are typically synchronous.
        # If the LiveKit agent SDK requires async, you might need to run this in an executor.
        response = deepgram_client.listen.rest.v("1").transcribe_file(payload, options)
        return response.results.channels[0].alternatives[0].transcript
    except Exception as e:
        logger.error(f"Error during Deepgram transcription: {e}")
        raise

async def get_llm_response(transcription):
    if not groq_client:
        logger.error("Groq client not available for LLM response.")
        raise ConnectionError("Groq client not initialized.")
    try:
        prompt = f"""You are a helpful voice assistant for a small business.
        The user said: '{transcription}'
        Respond naturally and concisely, keeping your response under 3 sentences when possible."""

        # Note: The Groq SDK calls are typically synchronous.
        # If the LiveKit agent SDK requires async, you might need to run this in an executor.
        groq_response = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a helpful voice assistant that provides concise, accurate responses."},
                {"role": "user", "content": prompt}
            ],
            model="llama3-8b-8192",
            max_tokens=300,
            temperature=0.7,
        )
        return groq_response.choices[0].message.content
    except Exception as e:
        logger.error(f"Error during Groq LLM call: {e}")
        raise

async def synthesize_speech(text):
    if not elevenlabs_client: # Check if client is initialized
        logger.error("ElevenLabs client not available for TTS.")
        raise ConnectionError("ElevenLabs client not configured.")
    try:
        logger.debug(f"Synthesizing speech for text: '{text[:50]}...' using ElevenLabs client API.")
        loop = asyncio.get_event_loop()
        
        # Use the client's text_to_speech.convert method
        # This method itself might be synchronous depending on the exact 1.x.x version,
        # so run_in_executor is still a good practice for non-blocking IO.
        audio_binary = await loop.run_in_executor(
            None,  # Use default ThreadPoolExecutor
            elevenlabs_client.text_to_speech.convert,
            ELEVENLABS_VOICE_ID, # voice_id first
            text, # then text
            # model_id="eleven_multilingual_v2" # model_id is part of voice settings or default
            # output_format is handled by client/API, typically mp3
        )
        # For newer SDK versions (e.g., 1.3.0+), the convert method might take slightly different args
        # or be part of a sub-client like client.generate()
        # Let's assume client.text_to_speech.convert(voice_id=, text=) is a common pattern for 1.x
        # If `convert` itself is async, `await` can be used directly.
        # If not, `run_in_executor` is correct.
        # The `elevenlabs.generate` function is also an option in newer versions for a more direct call.
        # Let's try the `generate` function directly from the client if `text_to_speech.convert` is not found
        # or if a simpler call is preferred.
        # audio_binary = await loop.run_in_executor(
        #     None,
        #     elevenlabs_client.generate, # Using the client's generate method
        #     text,
        #     voice=ELEVENLABS_VOICE_ID,
        #     model="eleven_multilingual_v2" 
        #     # output_format="mp3_22050_32" # output_format might be available here
        # )


        logger.info(f"ElevenLabs TTS generated audio. Voice: {ELEVENLABS_VOICE_ID}")
        return audio_binary # This is binary data
    except AttributeError as ae:
        logger.error(f"ElevenLabs SDK AttributeError: {ae}. This might indicate an issue with the method call for the current SDK version.")
        # Attempting a fallback to client.generate if text_to_speech.convert caused an error.
        # This is speculative and depends on the exact 1.x version's API structure.
        if "text_to_speech" in str(ae) or "convert" in str(ae):
            logger.info("Attempting fallback to elevenlabs_client.generate()")
            try:
                loop = asyncio.get_event_loop()
                audio_binary = await loop.run_in_executor(
                    None,
                    elevenlabs_client.generate,
                    text,
                    ELEVENLABS_VOICE_ID, # voice_id
                    "eleven_multilingual_v2" # model_id
                )
                logger.info(f"ElevenLabs TTS generated audio (using fallback client.generate). Voice: {ELEVENLABS_VOICE_ID}")
                return audio_binary
            except Exception as e_fallback:
                logger.error(f"Error during ElevenLabs TTS (fallback client.generate): {e_fallback}")
                raise ConnectionError(f"ElevenLabs TTS failed after fallback: {e_fallback}")
        else:
            raise # Re-raise original AttributeError if not related to tts.convert
    except Exception as e:
        logger.error(f"Error during ElevenLabs TTS: {e}")
        raise
