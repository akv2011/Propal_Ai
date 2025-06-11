\
import asyncio
import logging
import os
from dotenv import load_dotenv

from livekit.agents import JobContext, JobType, VoiceAssistant
from livekit.agents.utils import AudioBuffer
from livekit.protocol import RoomService
from livekit.rtc import AudioFrame, AudioStream

from .agent_helpers import (
    transcribe_audio_data,
    get_llm_response,
    synthesize_speech,
    DEEPGRAM_API_KEY,
    ELEVENLABS_API_KEY,
    GROQ_API_KEY,
    ELEVENLABS_VOICE_ID
)

load_dotenv()

LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://localhost:7880")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class VoiceAgent(VoiceAssistant):
    def __init__(self):
        super().__init__(
            stt_lang="en-US",
            tts_lang="en-US",
            tts_voice=ELEVENLABS_VOICE_ID or "21m00Tcm4TlvDq8ikWAM" # Default if not set
        )
        self._audio_buffer = AudioBuffer()
        logger.info("VoiceAgent initialized.")
        if not all([DEEPGRAM_API_KEY, ELEVENLABS_API_KEY, GROQ_API_KEY]):
            logger.error("One or more API keys (Deepgram, ElevenLabs, Groq) are missing. Agent may not function correctly.")
        if not all([LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL]):
            logger.error("LiveKit API Key, Secret, or URL is missing. Agent cannot connect to LiveKit.")


    async def _stt_fn(self, audio_stream: AudioStream) -> str:
        """
        Transcribes audio frames from the stream using Deepgram.
        """
        logger.info("STT function called.")
        if not DEEPGRAM_API_KEY:
            logger.error("Deepgram API key not available for STT.")
            return "" # Return empty string or raise an error

        self._audio_buffer.reset()
        async for audio_frame_event in audio_stream:
            frame: AudioFrame = audio_frame_event.frame
            self._audio_buffer.append(frame)

        audio_data = self._audio_buffer.to_wave() # Returns bytes
        logger.info(f"Audio data captured for STT: {len(audio_data)} bytes")

        try:
            # Assuming transcribe_audio_data can handle raw bytes and a mime_type
            # The agent_helpers.py already uses "audio/wav" by default
            transcription = await transcribe_audio_data(audio_data)
            logger.info(f"STT result: {transcription}")
            return transcription
        except ConnectionError as ce:
            logger.error(f"STT ConnectionError: {ce}")
            return "Sorry, I couldn't connect to the transcription service."
        except Exception as e:
            logger.error(f"Error in STT: {e}")
            # Potentially provide a user-facing error message
            return "Sorry, I had trouble understanding that."


    async def _llm_fn(self, transcription: str) -> str:
        """
        Gets a response from an LLM (Groq) based on the transcription.
        """
        logger.info(f"LLM function called with transcription: {transcription}")
        if not GROQ_API_KEY:
            logger.error("Groq API key not available for LLM.")
            return "I'm sorry, I can't process your request right now."

        if not transcription or transcription.strip() == "Sorry, I had trouble understanding that.":
             logger.warning("Skipping LLM call due to empty or error transcription.")
             return "I didn't catch that, could you please repeat?"

        try:
            response_text = await get_llm_response(transcription)
            logger.info(f"LLM response: {response_text}")
            return response_text
        except ConnectionError as ce:
            logger.error(f"LLM ConnectionError: {ce}")
            return "Sorry, I couldn't connect to the language model."
        except Exception as e:
            logger.error(f"Error in LLM: {e}")
            return "I'm having trouble thinking of a response."

    async def _tts_fn(self, text: str) -> AudioStream:
        """
        Synthesizes speech from text using ElevenLabs and returns an AudioStream.
        """
        logger.info(f"TTS function called with text: {text}")
        if not ELEVENLABS_API_KEY:
            logger.error("ElevenLabs API key not available for TTS.")
            # Fallback or error handling:
            # Potentially synthesize a generic error message if possible,
            # or signal an error in a way the VoiceAssistant can handle.
            # For now, we'll let it raise an exception or return an empty stream.
            raise ConnectionError("TTS service not configured.")

        if not text or text.strip() == "I didn't catch that, could you please repeat?" or text.strip() == "I'm having trouble thinking of a response.":
            logger.warning(f"Skipping TTS for empty or error text: {text}")
            # Create an empty audio stream or a pre-recorded "silence" or "error" sound
            # For simplicity, we'll try to synthesize a short silence or a message.
            # However, VoiceAssistant expects an AudioStream.
            # Returning an empty stream might be problematic.
            # A better approach would be to have a silent audio segment.
            # For now, let's try synthesizing a very short, generic message.
            try:
                error_audio_binary = await synthesize_speech("I'm sorry, there was an issue.")
                # This needs to be converted to an AudioStream.
                # The VoiceAssistant class handles this conversion internally if we yield bytes.
                # However, the signature expects AudioStream.
                # This part needs careful handling based on how VoiceAssistant processes TTS output.
                # For now, let's assume we can yield bytes and it gets handled.
                # This is a placeholder for proper AudioStream creation.
                # The VoiceAssistant class itself should handle the conversion from bytes to AudioStream.
                # We will yield the bytes directly.
                # The `VoiceAssistant` class will internally convert these bytes to an AudioStream.
                # Let's refine this to directly return the bytes as per VoiceAssistant's expectation for _tts_fn
                # if it can handle bytes directly or if we need to wrap it.
                # Looking at VoiceAssistant, it seems it expects an async generator yielding bytes.
                
                # The `synthesize_speech` in `agent_helpers.py` returns bytes.
                # The `VoiceAssistant` expects `_tts_fn` to be an async generator yielding bytes.
                # So, we need to make this an async generator.
                
                # This part is tricky. If the text is an error message, we still need to synthesize it.
                # The check above is more for *not* synthesizing if the input text itself is an error from LLM.
                pass # Let it proceed to synthesize the error message from LLM.

            except Exception as e_tts_fallback:
                logger.error(f"TTS fallback synthesis failed: {e_tts_fallback}")
                # If even synthesizing a fallback fails, we are in a tough spot.
                # Yielding nothing or raising might be the only options.
                # For now, let an empty stream be implicitly handled or raise.
                async def empty_stream():
                    if False: # Never yield
                        yield
                return empty_stream() # Return an empty async generator


        try:
            logger.info(f"Synthesizing speech for: {text}")
            audio_binary = await synthesize_speech(text) # This returns bytes
            
            # The VoiceAssistant expects an async generator yielding bytes for the audio stream.
            async def text_stream():
                # Simulate streaming if the TTS service doesn't stream directly
                # For ElevenLabs, `generate` can return a stream if `stream=True` is used.
                # Our current `synthesize_speech` helper returns all bytes at once.
                # We'll yield it in chunks if necessary, or just once if it's small.
                # For simplicity, yield all at once.
                # Adjust chunk_size as needed for actual streaming behavior.
                chunk_size = 1024 
                for i in range(0, len(audio_binary), chunk_size):
                    yield audio_binary[i:i+chunk_size]
                logger.info("TTS audio stream finished.")

            return text_stream()
        except ConnectionError as ce:
            logger.error(f"TTS ConnectionError: {ce}")
            async def error_stream():
                # Try to synthesize a generic error message if the primary synthesis fails
                try:
                    error_message = "I'm sorry, I couldn't generate the audio response."
                    error_audio_binary = await synthesize_speech(error_message)
                    chunk_size = 1024
                    for i in range(0, len(error_audio_binary), chunk_size):
                        yield error_audio_binary[i:i+chunk_size]
                except Exception as e_tts_error:
                    logger.error(f"TTS error synthesis also failed: {e_tts_error}")
                    # If all fails, yield nothing.
                    if False:
                        yield
            return error_stream()
        except Exception as e:
            logger.error(f"Error in TTS: {e}")
            async def fallback_stream():
                # Fallback for other TTS errors
                try:
                    fallback_message = "There was an error with the speech synthesis."
                    fallback_audio_binary = await synthesize_speech(fallback_message)
                    chunk_size = 1024
                    for i in range(0, len(fallback_audio_binary), chunk_size):
                        yield fallback_audio_binary[i:i+chunk_size]
                except Exception as e_tts_fallback_final:
                    logger.error(f"TTS final fallback synthesis failed: {e_tts_fallback_final}")
                    if False:
                        yield # Yield nothing if all attempts fail
            return fallback_stream()

async def run_agent():
    # Check for necessary API keys before attempting to run
    if not all([LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL]):
        logger.critical("LiveKit API Key, Secret, or URL is not configured. Agent cannot start.")
        return
    if not all([DEEPGRAM_API_KEY, ELEVENLABS_API_KEY, GROQ_API_KEY]):
        logger.critical("One or more service API keys (Deepgram, ElevenLabs, Groq) are missing. Agent functionality will be impaired.")
        # Decide if the agent should start with impaired functionality or not.
        # For now, let's allow it to start but it will log errors in the respective functions.

    agent = VoiceAgent()
    
    # The JobAcceptor is what connects to LiveKit and handles incoming job requests.
    # It needs the agent instance and LiveKit connection details.
    # This part is typically handled by the livekit-agent CLI or a similar runner.
    # For direct execution, we might need to manually create and run a JobAcceptor.
    # However, the standard way is to use the CLI.

    # If running this script directly, it's usually for testing the agent logic locally
    # without a full LiveKit server connection, or by using a local JobRequest.
    # The `livekit-agent` CLI handles the connection and job lifecycle.

    # For now, this main function will just instantiate the agent.
    # To actually run it with LiveKit, you'd use:
    # `livekit-agent --api-key YOUR_API_KEY --api-secret YOUR_API_SECRET --url ws://your-livekit-url start --agent YourAgentModuleName:YourAgentClassName`
    # e.g. `livekit-agent start --agent flask_backend.livekit_agent:VoiceAgent`
    # Ensure LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL are in .env or passed as args.

    logger.info("VoiceAgent created. To run with LiveKit, use the livekit-agent CLI.")
    logger.info("Example: livekit-agent start --agent flask_backend.livekit_agent:VoiceAgent")
    logger.info("Ensure LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL are set in your environment or .env file.")

    # To simulate a job for local testing (advanced, requires more setup):
    # ctx = JobContext(job=None, room_service=None, agent_service=None) # Simplified
    # await agent.process_job(ctx) # This is not how it's typically run

if __name__ == "__main__":
    # This allows running the script directly, for example, to see if it initializes.
    # It won't connect to LiveKit unless the livekit-agent CLI is used.
    asyncio.run(run_agent())
