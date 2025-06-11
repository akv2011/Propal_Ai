'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type DisplayableMetrics = {
  ttfbTextMs: number;
  eouAudioReadyMs: number;
  totalInteractionLatencyMs: number;
  llmProcessingTimeMs: number;
  ttsProcessingTimeMs: number;
} | null;

interface MetricsDisplayProps {
  metrics: DisplayableMetrics;
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

export default function MetricsDisplay({ metrics }: MetricsDisplayProps) {
  if (!metrics) {
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
          <MetricItem label="TTFB (Text)" value={metrics.ttfbTextMs} />
          <MetricItem label="EOU (Audio Ready)" value={metrics.eouAudioReadyMs} />
          <MetricItem label="Total Interaction" value={metrics.totalInteractionLatencyMs} />
          <MetricItem label="LLM Processing" value={metrics.llmProcessingTimeMs} />
          <MetricItem label="TTS Processing" value={metrics.ttsProcessingTimeMs} />
        </div>
        {metrics.totalInteractionLatencyMs > 2000 && (
          <p className="mt-3 text-sm text-destructive text-center font-medium">
            Warning: Total interaction latency is above 2 seconds.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
