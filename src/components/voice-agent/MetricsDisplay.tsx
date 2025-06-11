'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { InteractionMetrics } from './VoiceAgentInterface';

interface MetricsDisplayProps {
  metric: InteractionMetrics | null;
}

const MetricItem: React.FC<{ label: string; value: number | string; unit?: string }> = ({ label, value, unit = "ms" }) => (
  <div className="flex flex-col items-center p-2 bg-secondary/50 rounded-lg shadow">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-lg font-bold text-primary">
      {value}
      <span className="text-sm font-normal">{unit}</span>
    </span>
  </div>
);

export default function MetricsDisplay({ metric }: MetricsDisplayProps) {
  if (!metric) {
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg text-center">Latency Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">No metrics to display yet. Start a session and send a message.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 shadow-lg border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="text-xl text-center font-headline text-primary">Current Interaction Latency</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-center">
          <MetricItem label="TTFB (Text)" value={metric.ttftTextMs || 0} />
          <MetricItem label="EOU (Audio Ready)" value={metric.eouAudioReadyMs || 0} />
          <MetricItem label="Total Interaction" value={metric.totalInteractionLatencyMs || 0} />
          <MetricItem label="LLM Processing" value={metric.llmProcessingTimeMs || 0} />
          <MetricItem label="TTS Processing" value={metric.ttsProcessingTimeMs || 0} />
        </div>
      </CardContent>
    </Card>
  );
}
