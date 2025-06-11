import {
  RoomServiceClient,
  AccessToken,
  Room as ServerRoom, // Renamed to avoid conflict with ClientRoom
  WebhookReceiver
} from "livekit-server-sdk";
import {
  Room as ClientRoom,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  ParticipantEvent,
  TrackEvent,
  RoomEvent,
  LocalAudioTrack,
  createLocalAudioTrack,
  DataPacket_Kind,
  Track,
} from "livekit-client";
import { transcribeAudioStream, transcribeAudioBuffer } from "./stt"; // Assuming STT handles audio stream directly
import { generateLlmResponse } from "./llm";
import { textToSpeech, textToSpeechBuffer } from "./tts";
import type { InteractionMetrics } from "../components/voice-agent/VoiceAgentInterface"; // Adjust path as needed

const LIVEKIT_HOST = process.env.LIVEKIT_HOST!;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID!;

if (!LIVEKIT_HOST || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !ELEVENLABS_VOICE_ID) {
  throw new Error(
    "LiveKit API credentials, host, or ElevenLabs Voice ID are not set in environment variables."
  );
}

const roomService = new RoomServiceClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

interface AgentOptions {
  roomName: string;
  participantIdentity: string;
  participantName?: string;
  participantMetadata?: string;
}

export class PropalVoiceAgent {
  private room?: ClientRoom;
  private agentParticipant?: RemoteParticipant; // This will be the agent's own participant object after connecting
  private targetParticipant?: RemoteParticipant; // The user participant
  private currentMetrics: Partial<InteractionMetrics> = {};
  private metricsLog: InteractionMetrics[] = [];
  private isAgentSpeaking: boolean = false;
  private audioBuffer: Uint8Array[] = [];
  private sttLanguage: string = "en-US";
  private livekitToken?: string;
  private localAudioTrack?: LocalAudioTrack; // Agent's audio track for TTS output

  constructor(private options: AgentOptions) {
    this.sttLanguage = "hi-IN"; // Example
  }

  private async getOrCreateRoom(roomName: string): Promise<ServerRoom> { // Return type is ServerRoom
    try {
      const existingRooms = await roomService.listRooms([roomName]);
      if (existingRooms.length > 0) {
        console.log(`Room '${roomName}' already exists.`);
        return existingRooms[0];
      }
    } catch (error) {
      console.warn(`Could not list rooms, proceeding to create: ${error}`);
    }
    console.log(`Creating room '${roomName}'...`);
    return await roomService.createRoom({
      name: roomName,
      emptyTimeout: 300, // 5 minutes
      maxParticipants: 2, // Agent + 1 User
    });
  }

  public async start() {
    console.log(`Attempting to join LiveKit room: ${this.options.roomName} as ${this.options.participantIdentity}`);

    // Ensure room exists or create it
    await this.getOrCreateRoom(this.options.roomName);

    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: this.options.participantIdentity,
      name: this.options.participantName || "Propal AI Agent",
    });
    token.addGrant({
      roomJoin: true,
      room: this.options.roomName,
      canPublish: true,
      canSubscribe: true,
      // agent: true, // Uncomment if using LiveKit Agent Framework specific features
    });
    this.livekitToken = await token.toJwt();

    this.room = new ClientRoom();

    try {
      console.log("Connecting to LiveKit room with token...");
      await this.room.connect(LIVEKIT_HOST, this.livekitToken, {
        autoSubscribe: true, // Automatically subscribe to new tracks
      });
      console.log(`Successfully connected to room: ${this.room.name} as ${this.room.localParticipant.identity}`);
      
      this.localAudioTrack = await createLocalAudioTrack({
        // name: "agent-tts-output", // Name is not a direct option here
        echoCancellation: true,
        noiseSuppression: true,
      });
      await this.room.localParticipant.publishTrack(this.localAudioTrack);
      console.log("Agent's local audio track published.");

      this.setupRoomEventHandlers();

      this.room.remoteParticipants.forEach(participant => {
        this.handleParticipantConnected(participant);
      });
    } catch (error) {
      console.error("Failed to connect to LiveKit room:", error);
      throw error; // Re-throw to be caught by the API route
    }
  }

  private setupRoomEventHandlers() {
    if (!this.room) return;

    this.room
      .on(RoomEvent.ParticipantConnected, this.handleParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected)
      .on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed)
      // .on(RoomEvent.DataReceived, this.handleDataReceived) // If using data channels for text or commands
      .on(RoomEvent.Disconnected, () => {
        console.log("Agent disconnected from the room.");
        // Perform cleanup if necessary
      });
  }

  private handleParticipantConnected = (participant: RemoteParticipant) => {
    console.log(`Participant connected: ${participant.identity}`);
    if (!this.targetParticipant && participant.identity !== this.options.participantIdentity) {
      this.targetParticipant = participant;
      console.log(`Target participant set to: ${participant.identity}`);
      participant.trackPublications.forEach(publication => { // Changed from participant.tracks to participant.trackPublications
        if (publication.track && publication.kind === Track.Kind.Audio) { // Used Track.Kind.Audio for clarity
          this.handleTrackSubscribed(publication.track as RemoteTrack, publication, participant);
        }
      });
    }
  }

  private handleParticipantDisconnected = (participant: RemoteParticipant) => {
    console.log(`Participant disconnected: ${participant.identity}`);
    if (this.targetParticipant && this.targetParticipant.sid === participant.sid) {
      console.log(`Target participant ${participant.identity} left.`);
      this.targetParticipant = undefined;
      // Potentially stop agent or wait for new participant
    }
  }

  private handleTrackSubscribed = (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ) => {
    if (track.kind === Track.Kind.Audio && participant.identity === this.targetParticipant?.identity) { // Used Track.Kind.Audio
      console.log(`Subscribed to audio track from: ${participant.identity}`);
      
      // For Node.js, getting raw audio from RemoteAudioTrack is non-trivial
      // as it's designed to be attached to an <audio> element.
      // The 'AudioDataReceived' event is for DataTracks with Kind.LOSSY or Kind.RELIABLE.
      // We will need a different approach for server-side audio processing.
      // This might involve using the LiveKit Egress service to get an audio stream,
      // or a more advanced Agent SDK setup that provides raw audio frames.
      // For now, this part will be a placeholder and won't receive audio data directly.
      console.warn("Raw audio data ingestion from RemoteAudioTrack in Node.js is not directly supported by livekit-client in this manner. This needs a server-side solution or Agent SDK.");

      // Placeholder for where audio processing would happen if we could get raw data:
      // track.on(SomeAudioEvent, (audioData) => { ... });
      // For the purpose of this exercise, we'll assume handleUserAudio will be called externally
      // or via a simulated mechanism for now.
    }
  }
  
  private handleTrackUnsubscribed = (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ) => {
    console.log(`Track unsubscribed: ${track.sid} from ${participant.identity}`);
    // Clean up resources associated with this track if necessary
  }
  
  private initializeMetrics(turnId: string) {
    this.currentMetrics = {
      turnId,
      userInputTimestamp: Date.now(), // Placeholder, actual EOU time is critical
      sttModelUsed: "Deepgram Nova-2", // Example
      llmModelUsed: "Groq Llama3-8B", // Example
      ttsModelUsed: "ElevenLabs Multilingual v2", // Example
    };
  }

  private finalizeMetrics() {
    if (this.currentMetrics.userInputTimestamp && this.currentMetrics.llmResponseLastByteTimestamp) {
        this.currentMetrics.llmProcessingTimeMs = this.currentMetrics.llmResponseLastByteTimestamp - (this.currentMetrics.llmRequestTimestamp || this.currentMetrics.userInputTimestamp);
    }
    if (this.currentMetrics.userInputTimestamp && this.currentMetrics.ttsResponseLastAudioTimestamp) {
        this.currentMetrics.eouAudioReadyMs = this.currentMetrics.ttsResponseLastAudioTimestamp - this.currentMetrics.userInputTimestamp;
        this.currentMetrics.totalInteractionLatencyMs = this.currentMetrics.ttsResponseLastAudioTimestamp - this.currentMetrics.userInputTimestamp;
    }
    if (this.currentMetrics.userInputTimestamp && this.currentMetrics.llmResponseFirstByteTimestamp) {
        this.currentMetrics.ttftTextMs = this.currentMetrics.llmResponseFirstByteTimestamp - this.currentMetrics.userInputTimestamp;
    }
    // Add TTS processing time if available
    if (this.currentMetrics.ttsRequestTimestamp && this.currentMetrics.ttsResponseLastAudioTimestamp) {
        this.currentMetrics.ttsProcessingTimeMs = this.currentMetrics.ttsResponseLastAudioTimestamp - this.currentMetrics.ttsRequestTimestamp;
    }

    this.metricsLog.push(this.currentMetrics as InteractionMetrics);
    console.log("Logged metrics:", JSON.stringify(this.currentMetrics, null, 2));
    this.currentMetrics = {}; // Reset for next turn
  }

  // This method would be triggered when the agent detects user speech has ended (EOU)
  // or when it receives a full audio chunk for processing.
  public async handleUserAudio(audioData: Buffer) {
    const turnId = `turn_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.initializeMetrics(turnId);
    // This is a simplified EOU detection. Real EOU detection is complex.
    this.currentMetrics.userInputTimestamp = Date.now(); // Mark EOU time

    console.log(`[${turnId}] Processing user audio...`);

    try {
      // 1. STT: Transcribe audio to text
      const userInputText = await transcribeAudioBuffer(audioData, { language: this.sttLanguage });
      this.currentMetrics.userInputText = userInputText;
      console.log(`[${turnId}] STT Result: ${userInputText}`);

      if (!userInputText || userInputText.trim().length === 0) {
        console.log(`[${turnId}] STT returned empty. Not proceeding to LLM.`);
        this.finalizeMetrics(); // Log metrics even for empty input
        return;
      }

      // 2. LLM: Get response from language model
      this.currentMetrics.llmRequestTimestamp = Date.now();
      const agentResponseText = await generateLlmResponse(userInputText, { model: "llama3-8b-8192" });
      // Note: TTFB for LLM would ideally be captured inside generateLlmResponse if streaming
      this.currentMetrics.llmResponseFirstByteTimestamp = Date.now(); // Placeholder if not streaming
      this.currentMetrics.llmResponseLastByteTimestamp = Date.now(); // Placeholder
      
      if (!agentResponseText) {
        console.error(`[${turnId}] LLM returned empty response.`);
        this.currentMetrics.agentResponseText = "Sorry, I could not generate a response.";
        this.finalizeMetrics();
        // Optionally, play a canned error message via TTS
        await this.playText(this.currentMetrics.agentResponseText);
        return;
      }
      this.currentMetrics.agentResponseText = agentResponseText;
      console.log(`[${turnId}] LLM Response: ${agentResponseText}`);

      // 3. TTS: Convert LLM text response to speech
      //    await this.playText(agentResponseText); // This needs to stream to LiveKit
      if (agentResponseText) { // Ensure there's text to synthesize
        await this.streamTTSAudioToLiveKit(agentResponseText);
      }

    } catch (error) {
      console.error(`[${turnId}] Error in agent pipeline:`, error);
      this.currentMetrics.agentResponseText = "I encountered an error."; // Log error state
      // Optionally, play a canned error message via TTS
      await this.playText("Sorry, an error occurred.");
    } finally {
      this.finalizeMetrics();
    }
  }

  private async streamTTSAudioToLiveKit(text: string) {
    if (!this.localAudioTrack || !this.room?.localParticipant) {
        console.error("Agent's local audio track is not available for TTS.");
        return;
    }

    console.log(`[TTS] Streaming: "${text}"`);
    this.isAgentSpeaking = true;
    this.currentMetrics.ttsRequestTimestamp = Date.now();

    try {
        const elevenLabsStream = await textToSpeech(text, {
            voiceId: ELEVENLABS_VOICE_ID,
            modelId: "eleven_multilingual_v2",
            // outputFormat: "pcm_16000", // Ensure this matches what LocalAudioTrack expects or handle conversion
        });

        // The LocalAudioTrack expects raw PCM data (Float32Array or Int16Array).
        // ElevenLabs SDK might return a stream of Buffers (e.g., MP3 chunks).
        // We need to decode and feed PCM data.
        // For simplicity, if textToSpeech directly gives PCM or can be configured, that's best.
        // Otherwise, a decoding step is needed here.
        // Assuming textToSpeech gives us a stream of audio chunks (e.g. MP3 that needs decoding, or raw PCM)

        // This is a simplified example. In a real scenario, you'd pipe the stream
        // into an audio processing pipeline that feeds the LocalAudioTrack.
        // For `createLocalAudioTrack`, it can accept a MediaStreamTrack.
        // If ElevenLabs can output to a MediaStream, that's one way.
        // Or, manually feed PCM data to the track if it's a custom track.

        // Placeholder: Simulating feeding audio data.
        // The `this.localAudioTrack.element` is for browser environments.
        // For Node.js, you'd use a different mechanism if `localAudioTrack` is a custom track
        // or if `textToSpeech` can directly provide a MediaStreamTrack.

        // If `textToSpeech` returns a stream of Buffers (e.g. audio file chunks)
        // and `LocalAudioTrack` expects raw PCM, you need a decoder.
        // This part is complex and depends on the exact format from ElevenLabs and LocalAudioTrack requirements.
        // Let's assume `textToSpeechBuffer` gives a complete buffer of playable audio (e.g. WAV/MP3)
        // and we'd need to stream it properly.

        // For now, let's use the textToSpeechBuffer which gives a full buffer,
        // then simulate "streaming" it by sending it in chunks if possible, or playing it.
        // However, LocalAudioTrack is designed for continuous streams.

        // A more robust solution involves:
        // 1. Getting a stream from ElevenLabs (e.g., PCM or Opus).
        // 2. If not PCM, decode it.
        // 3. Feed the PCM data into the LocalAudioTrack.
        // LiveKit's `AudioFrame` can be used with `publishFrame` on a `LocalTrack`.
        // `createLocalAudioTrack` might not be the best fit if we are manually pushing frames.
        // Consider `new LocalAudioTrack()` with appropriate kind and then `publishFrame`.

        // Let's assume `textToSpeechBuffer` returns a Buffer of PCM data for simplicity.
        // This is a major simplification.
        const audioBuffer = await textToSpeechBuffer(text, { voiceId: ELEVENLABS_VOICE_ID, modelId: "eleven_multilingual_v2" });
        this.currentMetrics.ttsResponseFirstAudioTimestamp = Date.now(); // Approximation
        
        // How to play this buffer through localAudioTrack?
        // If localAudioTrack is from createLocalAudioTrack, it expects a MediaStreamTrack source.
        // We might need to create a custom track or use a library to convert Buffer to MediaStreamTrack.
        // For example, if `this.localAudioTrack` is an instance of `LocalAudioTrack` from `livekit-client`,
        // and it was created without a specific MediaStreamTrack, it might not have a direct way to push buffer data from Node.js.
        // The `AudioFrame` approach is more for server-side SDKs or custom track sources.

        // TODO: Implement actual streaming of audioBuffer to this.localAudioTrack.
        // This is a critical part for the agent to speak.
        // One approach: use a library like 'node-webrtc' if you need to create MediaStreamTracks from buffers in Node.js,
        // or ensure your TTS service can output a compatible stream format.

        this.currentMetrics.ttsResponseLastAudioTimestamp = Date.now();

    } catch (error) {
        console.error(`[TTS] Error during speech synthesis or streaming: ${error}`);
        this.currentMetrics.ttsResponseLastAudioTimestamp = Date.now(); // Mark error time
    } finally {
        this.isAgentSpeaking = false;
    }
  }

  // TODO: Implement interruption handling
  // This would involve checking if user starts speaking while isAgentSpeaking is true.
  // If so, stop TTS playback and STT the new user input.

  public async stop() {
    console.log("Stopping agent and disconnecting from LiveKit room...");
    if (this.room) { // Corrected syntax: added parentheses
      await this.room.disconnect();
      console.log("Disconnected from room.");
      this.room = undefined;
      this.localAudioTrack?.stop(); // Stop the local audio track
      this.localAudioTrack = undefined;
    }
    // Any other cleanup
    this.metricsLog.push(...this.finalizeAnyOngoingMetrics()); // Log any pending metrics
    console.log("Agent stopped.");
  }

  private finalizeAnyOngoingMetrics(): InteractionMetrics[] {
    // If there's a currentMetrics object that hasn't been pushed, finalize and add it.
    // This is a simplified version.
    if (Object.keys(this.currentMetrics).length > 0 && this.currentMetrics.turnId) {
        // Fill in any missing timestamps if possible, or mark as incomplete
        if (!this.currentMetrics.llmResponseLastByteTimestamp) this.currentMetrics.llmResponseLastByteTimestamp = Date.now();
        if (!this.currentMetrics.ttsResponseLastAudioTimestamp) this.currentMetrics.ttsResponseLastAudioTimestamp = Date.now();
        this.finalizeMetrics(); // This will push to metricsLog if turnId is present
    }
    return []; // finalizeMetrics already pushes, so return empty or adjust logic
  }
  
  public getMetricsLog(): InteractionMetrics[] {
    return this.metricsLog;
  }

  // This method is a placeholder for actual TTS playback to LiveKit.
  // It should use this.localAudioTrack to send audio.
  private async playText(text: string): Promise<void> {
    if (!text) return;
    console.log(`Agent would say: "${text}"`); // Placeholder
    // This should call streamTTSAudioToLiveKit
    await this.streamTTSAudioToLiveKit(text);
  }
}

// Example of how you might use this agent (e.g., in a Next.js API route or a standalone Node.js script)
/*
async function runAgent() {
  const roomName = "test-agent-room";
  const agentIdentity = "propal-agent-001";

  // Ensure room exists or create it
  try {
    await roomService.createRoom({ name: roomName, emptyTimeout: 10 * 60 }); // emptyTimeout in seconds
    console.log(`Room ${roomName} created or already exists.`);
  } catch (e: any) {
    // Assuming error means room already exists, which is fine for this example
    console.log(`Could not create room ${roomName}, assuming it exists: ${e.message}`);
  }

  const agent = new PropalVoiceAgent({
    roomName,
    participantIdentity: agentIdentity,
  });

  await agent.start();

  // Simulate receiving audio from a user (replace with actual LiveKit track handling)
  // This is a major simplification. In reality, you\'d get audio from a LiveKit RemoteAudioTrack.
  console.log("Simulating user speaking...");
  // Create a dummy audio buffer (e.g., a silent WAV file or a short spoken phrase)
  // For a real test, you\'d need actual audio data.
  // This is just a placeholder to trigger the pipeline.
  const dummyAudioData = Buffer.from("this is a test audio buffer"); // NOT A VALID WAV/AUDIO
  
  // Wait a bit for the agent to be "ready" (in a real scenario, wait for user connection)
  await new Promise(resolve => setTimeout(resolve, 5000)); 
  
  // Simulate user speaking after some time
  // In a real app, this would come from a LiveKit participant\'s audio track
  // and you\'d need a mechanism for VAD (Voice Activity Detection) / EOU (End of Utterance)
  // to know when to send the audio to STT.
  // For now, we just call it directly.
  // await agent.handleUserAudio(dummyAudioData); // This dummy data won\'t work with STT

  // To test properly, you would need:
  // 1. A client (e.g., web browser) connected to the LiveKit room.
  // 2. The client sending audio.
  // 3. The agent subscribing to that audio track and processing it.

  // Keep the agent running for a while for testing, or implement a proper shutdown mechanism
  // setTimeout(async () => {
  //   await agent.stop();
  //   console.log("Agent metrics:", agent.getMetricsLog());
  // }, 60000); // Stop after 60 seconds
}

// runAgent().catch(console.error);
*/

// Further considerations:
// - Error Handling: More robust error handling throughout the pipeline.
// - State Management: Better state management for the agent (e.g., idle, listening, speaking, processing).
// - LiveKit Agent Framework: For more complex agents, consider using the official LiveKit Agent Framework
//   which provides helpers for managing agent lifecycle, jobs, and state.
// - Audio Buffering & VAD: Real VAD/EOU detection is needed instead of just passing a buffer.
// - Streaming STT/TTS: For lower latency, integrate streaming STT and TTS more deeply.
//   This means STT provides interim results, LLM might stream tokens, and TTS starts playing audio as it arrives.
// - Interruption Handling: If user speaks while agent TTS is playing, agent should stop TTS and listen.
// - Configuration: Make models, languages, voice IDs, etc., more configurable.
