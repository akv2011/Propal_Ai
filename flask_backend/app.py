import os
import time
import json
import base64
import logging
from datetime import datetime
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import requests

# Import the correct Deepgram SDK 
try:
    # First try modern API style
    from deepgram import DeepgramClient
    from deepgram import PrerecordedOptions
    MODERN_DEEPGRAM = True
    DEEPGRAM_AVAILABLE = True
    print("Using modern Deepgram SDK")
except ImportError as e:
    print(f"Modern Deepgram import error: {e}")
    MODERN_DEEPGRAM = False
    try:
        # Fall back to legacy API style
        from deepgram import Deepgram
        DEEPGRAM_AVAILABLE = True
        print("Using legacy Deepgram SDK")
    except ImportError as e:
        print(f"Legacy Deepgram import error: {e}")
        DEEPGRAM_AVAILABLE = False

try:
    import groq
except ImportError:
    # Fallback to openai-style client if groq not installed
    import openai as groq
    
# Import ElevenLabs with updated API structure - using newest 2.3.0 version
from elevenlabs.client import ElevenLabs
from elevenlabs import Voice, VoiceSettings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Print environment variables for debugging
logger.info(f"DEEPGRAM_API_KEY: {'Set' if os.getenv('DEEPGRAM_API_KEY') else 'Not set'}")
logger.info(f"ELEVENLABS_API_KEY: {'Set' if os.getenv('ELEVENLABS_API_KEY') else 'Not set'}")
logger.info(f"GROQ_API_KEY: {'Set' if os.getenv('GROQ_API_KEY') else 'Not set'}")

# Initialize API keys and clients
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Default to Rachel
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Initialize clients
if DEEPGRAM_AVAILABLE:
    try:
        deepgram = DeepgramClient(DEEPGRAM_API_KEY)
        logger.info("Deepgram client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Deepgram client: {e}")
        DEEPGRAM_AVAILABLE = False

groq_client = groq.Client(api_key=GROQ_API_KEY)
elevenlabs_client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

# Metrics storage
metrics_log = []

def save_metrics_to_excel():
    """Save metrics to Excel file"""
    if metrics_log:
        df = pd.DataFrame(metrics_log)
        filename = f"metrics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        df.to_excel(filename, index=False)
        return filename
    return None

@app.route('/metrics', methods=['GET'])
def get_metrics():
    """Get all metrics logged during the session"""
    return jsonify(metrics_log)

@app.route('/metrics/export', methods=['GET'])
def export_metrics():
    """Export metrics to Excel file"""
    filename = save_metrics_to_excel()
    if filename:
        return jsonify({"status": "success", "filename": filename})
    return jsonify({"status": "error", "message": "No metrics to export"})

@app.route('/api/stt', methods=['POST'])
def speech_to_text():
    """Convert audio to text using Deepgram"""
    start_time = time.time()
    
    if not DEEPGRAM_AVAILABLE:
        return jsonify({"error": "Deepgram SDK not available"}), 500
    
    try:
        data = request.json
        if not data or 'audioDataUri' not in data:
            return jsonify({"error": "No audio data provided"}), 400
        
        # Extract the base64 audio data from the data URI
        audio_data_uri = data['audioDataUri']
        header, base64_data = audio_data_uri.split(',')
        
        # Convert base64 to binary
        audio_binary = base64.b64decode(base64_data)
        
        # Determine content type from header
        mime_type = header.split(':')[1].split(';')[0] if ':' in header else "audio/wav"
        
        # Process with Deepgram
        deepgram_start = time.time()
        
        if MODERN_DEEPGRAM:
            # Modern Deepgram SDK approach
            options = PrerecordedOptions(
                model="nova-2", 
                smart_format=True,
                language="en-US",
            )
            
            # Create payload directly without FileSource
            payload = {"buffer": audio_binary, "mimetype": mime_type}
            
            # Make the transcription request - UPDATED LINE
            response = deepgram.listen.rest.v("1").transcribe_file(payload, options)
            
            # Extract transcript
            transcript = response.results.channels[0].alternatives[0].transcript
        else:
            # Legacy approach
            source = {"buffer": audio_binary, "mimetype": mime_type}
            response = deepgram.transcription.sync_prerecorded(source, {"punctuate": True, "model": "nova"})
            transcript = response["results"]["channels"][0]["alternatives"][0]["transcript"]
        
        deepgram_end = time.time()
        
        end_time = time.time()
        stt_latency = end_time - start_time
        deepgram_latency = deepgram_end - deepgram_start
        
        # Log metrics
        metric_entry = {
            "timestamp": datetime.now().isoformat(),
            "type": "stt",
            "total_latency": round(stt_latency * 1000, 2),  # ms
            "service_latency": round(deepgram_latency * 1000, 2),  # ms
            "processing_overhead": round((stt_latency - deepgram_latency) * 1000, 2),  # ms
        }
        metrics_log.append(metric_entry)
        
        return jsonify({
            "transcription": transcript,
            "metrics": metric_entry
        })
    
    except Exception as e:
        logger.error(f"Error in speech_to_text: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/llm', methods=['POST'])
def generate_response():
    """Generate response using Groq LLM"""
    start_time = time.time()
    
    try:
        data = request.json
        if not data or 'transcription' not in data:
            return jsonify({"error": "No transcription provided"}), 400
        
        transcription = data['transcription']
        
        # Prepare the prompt
        prompt = f"""You are a helpful voice assistant for a small business. 
        The user said: '{transcription}'
        
        Respond naturally and concisely, keeping your response under 3 sentences when possible.
        """
        
        # Call Groq API
        llm_start = time.time()
        groq_response = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful voice assistant that provides concise, accurate responses."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama3-8b-8192",  # Use Llama 3 8B model for a good balance of quality and speed
            max_tokens=300,
            temperature=0.7,
        )
        llm_end = time.time()
        
        # Extract the generated text
        response_text = groq_response.choices[0].message.content
        
        end_time = time.time()
        llm_latency = end_time - start_time
        groq_latency = llm_end - llm_start
        
        # Calculate TTFT (Time to First Token)
        ttft = groq_response.usage.completion_tokens > 0 if hasattr(groq_response, 'usage') else True
        
        # Log metrics
        metric_entry = {
            "timestamp": datetime.now().isoformat(),
            "type": "llm",
            "total_latency": round(llm_latency * 1000, 2),  # ms
            "service_latency": round(groq_latency * 1000, 2),  # ms
            "processing_overhead": round((llm_latency - groq_latency) * 1000, 2),  # ms
            "ttft": ttft,
            "tokens": groq_response.usage.completion_tokens if hasattr(groq_response, 'usage') else None,
        }
        metrics_log.append(metric_entry)
        
        return jsonify({
            "response": response_text,
            "metrics": metric_entry
        })
    
    except Exception as e:
        logger.error(f"Error in generate_response: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/tts', methods=['POST'])
def text_to_speech():
    """Convert text to speech using ElevenLabs"""
    start_time = time.time()
    
    try:
        data = request.json
        if not data or 'text' not in data:
            return jsonify({"error": "No text provided"}), 400
        
        text = data['text']
        voice_id = data.get('voiceId', ELEVENLABS_VOICE_ID)
        
        # Call ElevenLabs API
        tts_start = time.time()
        response = elevenlabs_client.generate(
            text=text,
            voice=voice_id,
            model_id="eleven_multilingual_v2",
            output_format="mp3_22050_32"
        )
        audio = response  # Get the binary audio content
        tts_end = time.time()
        
        # Convert audio to base64 for sending via JSON
        audio_base64 = base64.b64encode(audio).decode('utf-8')
        
        end_time = time.time()
        tts_latency = end_time - start_time
        elevenlabs_latency = tts_end - tts_start
        
        # Log metrics
        metric_entry = {
            "timestamp": datetime.now().isoformat(),
            "type": "tts",
            "total_latency": round(tts_latency * 1000, 2),  # ms
            "service_latency": round(elevenlabs_latency * 1000, 2),  # ms
            "processing_overhead": round((tts_latency - elevenlabs_latency) * 1000, 2),  # ms
            "text_length": len(text),
        }
        metrics_log.append(metric_entry)
        
        return jsonify({
            "audio": audio_base64,
            "metrics": metric_entry
        })
    
    except Exception as e:
        logger.error(f"Error in text_to_speech: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/conversation', methods=['POST'])
def process_conversation():
    """Process a full conversation turn (STT → LLM → TTS)"""
    start_time = time.time()
    eou_start = time.time()  # EOU (End of Utterance) start time
    
    if not DEEPGRAM_AVAILABLE:
        return jsonify({"error": "Deepgram SDK not available"}), 500
    
    try:
        data = request.json
        if not data or 'audioDataUri' not in data:
            return jsonify({"error": "No audio data provided"}), 400
        
        # 1. Speech-to-Text
        stt_start = time.time()
        
        # Extract audio data
        audio_data_uri = data['audioDataUri']
        header, base64_data = audio_data_uri.split(',')
        audio_binary = base64.b64decode(base64_data)
        
        # Determine content type from header
        mime_type = header.split(':')[1].split(';')[0] if ':' in header else "audio/wav"
        
        # Process with Deepgram
        deepgram_start = time.time()
        
        if MODERN_DEEPGRAM:
            # Modern Deepgram SDK approach
            options = PrerecordedOptions(
                model="nova-2", 
                smart_format=True,
                language="en-US",
            )
            
            # Create payload directly without FileSource
            payload = {"buffer": audio_binary, "mimetype": mime_type}
            
            # Make the transcription request - UPDATED LINE
            response = deepgram.listen.rest.v("1").transcribe_file(payload, options)
            
            # Extract transcript
            transcription = response.results.channels[0].alternatives[0].transcript
        else:
            # Legacy approach
            source = {"buffer": audio_binary, "mimetype": mime_type}
            response = deepgram.transcription.sync_prerecorded(source, {"punctuate": True, "model": "nova"})
            transcription = response["results"]["channels"][0]["alternatives"][0]["transcript"]
            
        deepgram_end = time.time()
        stt_end = time.time()
        
        # Calculate STT metrics
        stt_latency = stt_end - stt_start
        deepgram_latency = deepgram_end - deepgram_start
        stt_metrics = {
            "timestamp": datetime.now().isoformat(),
            "type": "stt",
            "total_latency": round(stt_latency * 1000, 2),  # ms
            "service_latency": round(deepgram_latency * 1000, 2),  # ms
            "processing_overhead": round((stt_latency - deepgram_latency) * 1000, 2),  # ms
        }
        metrics_log.append(stt_metrics)
        
        eou_time = time.time() - eou_start
        
        # 2. LLM Response Generation
        llm_start = time.time()
        
        # Prepare the prompt
        prompt = f"""You are a helpful voice assistant for a small business. 
        The user said: '{transcription}'
        
        Respond naturally and concisely, keeping your response under 3 sentences when possible.
        """
        
        # Call Groq API
        groq_start = time.time()
        groq_response = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful voice assistant that provides concise, accurate responses."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama3-8b-8192",  # Use Llama 3 8B model for a good balance of quality and speed
            max_tokens=300,
            temperature=0.7,
        )
        groq_end = time.time()
        
        # Extract the generated text
        response_text = groq_response.choices[0].message.content
        llm_end = time.time()
        
        # Calculate LLM metrics
        llm_latency = llm_end - llm_start
        groq_latency = groq_end - groq_start
        ttft = time.time() - llm_start
        
        llm_metrics = {
            "timestamp": datetime.now().isoformat(),
            "type": "llm",
            "total_latency": round(llm_latency * 1000, 2),  # ms
            "service_latency": round(groq_latency * 1000, 2),  # ms
            "processing_overhead": round((llm_latency - groq_latency) * 1000, 2),  # ms
            "ttft": True,  # Simplified
            "tokens": groq_response.usage.completion_tokens if hasattr(groq_response, 'usage') else None,
        }
        metrics_log.append(llm_metrics)
        
        # 3. Text-to-Speech
        tts_start = time.time()
        
        # Call ElevenLabs API
        elevenlabs_start = time.time()
        response = elevenlabs_client.generate(
            text=response_text,
            voice=ELEVENLABS_VOICE_ID,
            model_id="eleven_multilingual_v2",
            output_format="mp3_22050_32"
        )
        audio = response  # Get the binary audio content
        elevenlabs_end = time.time()
        
        # Convert audio to base64 for sending via JSON
        audio_base64 = base64.b64encode(audio).decode('utf-8')
        tts_end = time.time()
        
        # Calculate TTS metrics
        tts_latency = tts_end - tts_start
        elevenlabs_latency = elevenlabs_end - elevenlabs_start
        
        tts_metrics = {
            "timestamp": datetime.now().isoformat(),
            "type": "tts",
            "total_latency": round(tts_latency * 1000, 2),  # ms
            "service_latency": round(elevenlabs_latency * 1000, 2),  # ms
            "processing_overhead": round((tts_latency - elevenlabs_latency) * 1000, 2),  # ms
            "text_length": len(response_text),
        }
        metrics_log.append(tts_metrics)
        ttfb = time.time() - start_time
        
        # Calculate total latency
        end_time = time.time()
        total_latency = end_time - start_time
        
        # Compile all metrics
        full_metrics = {
            "timestamp": datetime.now().isoformat(),
            "type": "conversation",
            "total_latency": round(total_latency * 1000, 2),  # ms
            "eou_delay": round(eou_time * 1000, 2),  # ms
            "ttft": round(ttft * 1000, 2),  # ms
            "ttfb": round(ttfb * 1000, 2),  # ms
            "stt_latency": stt_metrics['total_latency'],
            "llm_latency": llm_metrics['total_latency'],
            "tts_latency": tts_metrics['total_latency'],
            "text_length": len(response_text),
        }
        metrics_log.append(full_metrics)
        
        return jsonify({
            "transcription": transcription,
            "response": response_text,
            "audio": audio_base64,
            "metrics": full_metrics
        })
    
    except Exception as e:
        logger.error(f"Error in process_conversation: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/', methods=['GET'])
def index():
    return "VoiceFlow AI Flask Backend is running!"

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)