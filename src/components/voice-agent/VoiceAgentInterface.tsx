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

import React, { useState, useEffect } from 'react';
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
  
  // Function to start the voice conversation
  const startConversation = () => {
    setIsListening(true);
    setStatus('listening');
    setTranscript('');
    setResponse('');
    
    // Log start time for metrics
    const newMetric: InteractionMetrics = {
      turnId: Date.now().toString(),
      userInputTimestamp: Date.now(),
    };
    setCurrentMetric(newMetric);
    
    // Here you would initialize the LiveKit session, STT, etc.
    // For now, this is just a placeholder
    
    // Simulate receiving a transcript after 2 seconds
    setTimeout(() => {
      const userText = "Hello, I need assistance with setting up a new account.";
      setTranscript(userText);
      setStatus('processing');
      
      // Update metrics
      const updatedMetric = {
        ...newMetric,
        userInputText: userText,
        llmRequestTimestamp: Date.now(),
      };
      setCurrentMetric(updatedMetric);
      
      // Simulate LLM processing and response
      setTimeout(() => {
        const llmResponse = "I'd be happy to help you set up a new account. Could you please tell me what type of account you're interested in creating?";
        
        // Update metrics for LLM response
        const llmResponseTime = Date.now();
        const updatedMetricWithLLM = {
          ...updatedMetric,
          llmResponseFirstByteTimestamp: llmResponseTime - 500, // Simulate first byte arriving earlier
          llmResponseLastByteTimestamp: llmResponseTime,
          llmProcessingTimeMs: llmResponseTime - (updatedMetric.llmRequestTimestamp || 0),
          agentResponseText: llmResponse,
          ttsRequestTimestamp: llmResponseTime,
        };
        setCurrentMetric(updatedMetricWithLLM);
        
        // Simulate TTS processing
        setTimeout(() => {
          setResponse(llmResponse);
          setStatus('responding');
          
          // Complete metrics for this turn
          const ttsResponseTime = Date.now();
          const finalMetric = {
            ...updatedMetricWithLLM,
            ttsResponseFirstAudioTimestamp: ttsResponseTime - 300, // Simulate first audio chunk arriving earlier
            ttsResponseLastAudioTimestamp: ttsResponseTime,
            ttsProcessingTimeMs: ttsResponseTime - (updatedMetricWithLLM.ttsRequestTimestamp || 0),
            eouAudioReadyMs: ttsResponseTime - (newMetric.userInputTimestamp || 0),
            ttftTextMs: (updatedMetricWithLLM.llmResponseFirstByteTimestamp || 0) - (newMetric.userInputTimestamp || 0),
            totalInteractionLatencyMs: ttsResponseTime - (newMetric.userInputTimestamp || 0),
            llmModelUsed: 'Groq-Llama3-8B',
            sttModelUsed: 'Deepgram Nova-2',
            ttsModelUsed: 'ElevenLabs',
          };
          
          setCurrentMetric(finalMetric);
          setMetrics(prev => [...prev, finalMetric]);
          
          // End the turn after the "audio" would finish playing
          setTimeout(() => {
            setStatus('idle');
            setIsListening(false);
          }, 3000);
        }, 1000);
      }, 1500);
    }, 2000);
  };
  
  // Function to stop the conversation
  const stopConversation = () => {
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
