'use client';

export interface InteractionMetrics {
  turnId: string; // Unique identifier for each turn in the conversation
  userInputTimestamp: number; // Timestamp when user input (speech) ends (EOU)
  userInputText?: string; // Text transcribed from user input
  llmRequestTimestamp?: number; // Timestamp when request is sent to LLM
  llmResponseFirstByteTimestamp?: number; // Timestamp when first byte of LLM response is received (TTFB Text)
  llmResponseLastByteTimestamp?: number; // Timestamp when full LLM response is received
  llmProcessingTimeMs?: number; // Time taken by LLM to process and respond (LLM Response Last Byte - LLM Request)
  agentResponseText?: string; // Text response from the LLM
  ttsRequestTimestamp?: number; // Timestamp when request is sent to TTS
  ttsResponseFirstAudioTimestamp?: number; // Timestamp when first audio chunk from TTS is received (TTFB Audio)
  ttsResponseLastAudioTimestamp?: number; // Timestamp when full audio from TTS is received
  ttsProcessingTimeMs?: number; // Time taken by TTS to process and respond
  eouAudioReadyMs?: number; // Time from end of user utterance to when agent audio is ready to play (TTS Response Last Audio - User Input Timestamp)
  ttftTextMs?: number; // Time to first text token from LLM (LLM Response First Byte - User Input Timestamp)
  totalInteractionLatencyMs?: number; // Total time for the turn (Agent audio ready - User input ends)
  // Optional: Add any other specific metrics you want to track
  llmModelUsed?: string;
  sttModelUsed?: string;
  ttsModelUsed?: string;
}

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../ui/card';
import { Badge } from '../ui/badge';
import MetricsDisplay from './MetricsDisplay';
import MetricsLogTable from './MetricsLogTable';

const VoiceAgentInterface: React.FC = () => {
  // States for the voice conversation
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [metrics, setMetrics] = useState<InteractionMetrics[]>([]);
  const [currentMetric, setCurrentMetric] = useState<InteractionMetrics | null>(null);
  const [status, setStatus] = useState('idle');
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Function to start the voice conversation
  const startConversation = async () => {
    setIsListening(true);
    setStatus('listening');
    setTranscript('');
    setResponse('');
    setCurrentMetric(null); 

    audioChunksRef.current = []; // Clear previous audio chunks

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' }); // Or appropriate mimetype
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const audioDataUri = reader.result as string;
          // Now send this to the backend
          await processAudioAndGetResponse(audioDataUri);
        };
        // Stop microphone tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      // You might want a timeout or a way to detect end of speech to call mediaRecorderRef.current.stop()
      // For now, stopConversation will handle it, or a fixed duration timeout for simplicity if needed.

    } catch (error) {
      console.error("Error starting recording:", error);
      setStatus('idle');
      setIsListening(false);
      setResponse("Error: Could not start recording. Please check microphone permissions.");
    }
  };

  const processAudioAndGetResponse = async (audioDataUri: string) => {
    const turnId = Date.now().toString();
    const userInputTimestamp = Date.now(); 

    setCurrentMetric({
      turnId,
      userInputTimestamp,
    });
    setStatus('processing');

    try {
      const apiResponse = await fetch('http://localhost:5000/api/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audioDataUri }),
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        throw new Error(errorData.error || `HTTP error! status: ${apiResponse.status}`);
      }

      const data = await apiResponse.json();

      setTranscript(data.transcription);
      setResponse(data.response);
      setStatus('responding');

      const backendMetrics = data.metrics;
      const finalMetric: InteractionMetrics = {
        turnId,
        userInputTimestamp,
        userInputText: data.transcription,
        agentResponseText: data.response,
        llmProcessingTimeMs: parseFloat(backendMetrics.llm_latency),
        ttsProcessingTimeMs: parseFloat(backendMetrics.tts_latency),
        eouAudioReadyMs: parseFloat(backendMetrics.ttfb),
        ttftTextMs: parseFloat(backendMetrics.ttft),
        totalInteractionLatencyMs: parseFloat(backendMetrics.total_latency),
        llmModelUsed: 'Groq-Llama3-8B',
        sttModelUsed: 'Deepgram Nova-2',
        ttsModelUsed: 'ElevenLabs',
      };
      
      setCurrentMetric(finalMetric);
      setMetrics(prev => [...prev, finalMetric]);

      if (data.audio) {
        const audioBlob = new Blob([Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const newAudioPlayer = new Audio(audioUrl);
        setAudioPlayer(newAudioPlayer);
        newAudioPlayer.play();
        newAudioPlayer.onended = () => {
          setStatus('idle');
          setIsListening(false);
        };
      } else {
        setStatus('idle');
        setIsListening(false);
      }

    } catch (error) {
      console.error("Error processing conversation:", error);
      setStatus('idle');
      setIsListening(false);
      setResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Function to stop the conversation
  const stopConversation = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop(); // This will trigger onstop and process the audio
    }
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    }
    // If mediaRecorder didn't stop tracks (e.g. error before onstop), ensure they are stopped.
    // This might be redundant if onstop always fires and cleans up.
    // Consider if stream needs to be stored in a ref to access it here for cleanup in all cases.
    setIsListening(false);
    setStatus('idle');
  };
  
  // Function to clear metrics log
  const clearMetrics = () => {
    setMetrics([]);
    setCurrentMetric(null);
  };

  return (
    <div className="container mx-auto px-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center">VoiceFlow AI</CardTitle>
          <div className="flex justify-center mt-2">
            <Badge variant={status === 'idle' ? 'outline' : 'default'} 
              className={`${status === 'listening' ? 'bg-red-500' : 
                status === 'processing' ? 'bg-yellow-500' : 
                status === 'responding' ? 'bg-green-500' : ''} text-white px-4 py-1`}>
              {status === 'idle' ? 'Ready' : 
               status === 'listening' ? 'Listening' : 
               status === 'processing' ? 'Processing' : 'Responding'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row gap-6">
            <Card className="flex-1">
              <CardHeader>
                <CardTitle className="text-lg">You Said</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="min-h-[100px] p-3 bg-slate-50 rounded-md">
                  {transcript || 'Nothing yet...'}
                </p>
              </CardContent>
            </Card>
            
            <Card className="flex-1">
              <CardHeader>
                <CardTitle className="text-lg">AI Response</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="min-h-[100px] p-3 bg-slate-50 rounded-md">
                  {response || 'Waiting for input...'}
                </p>
              </CardContent>
            </Card>
          </div>
          
          {currentMetric && (
            <MetricsDisplay metric={currentMetric} />
          )}
        </CardContent>
        <CardFooter className="justify-center gap-4">
          <Button 
            onClick={startConversation}
            disabled={isListening}
            className="bg-blue-600 hover:bg-blue-700"
            size="lg"
          >
            Start Conversation
          </Button>
          <Button 
            onClick={stopConversation}
            disabled={!isListening}
            className="bg-red-600 hover:bg-red-700"
            size="lg"
          >
            Stop
          </Button>
          <Button 
            onClick={clearMetrics}
            variant="outline"
            size="lg"
          >
            Clear Metrics
          </Button>
        </CardFooter>
      </Card>
      
      {metrics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Conversation Metrics Log</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricsLogTable metrics={metrics} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default VoiceAgentInterface;
