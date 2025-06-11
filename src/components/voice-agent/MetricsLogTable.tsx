'use client';

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { ScrollArea } from '@/components/ui/scroll-area';
import type { InteractionMetrics } from './VoiceAgentInterface'; // Adjust path if needed

interface MetricsLogTableProps {
  metrics: InteractionMetrics[];
}

export default function MetricsLogTable({ metrics }: MetricsLogTableProps) {
  if (metrics.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No metrics logged for this session yet.</p>;
  }

  return (
    <ScrollArea className="h-[300px] w-full rounded-md border shadow-inner">
      <Table>
        <TableCaption>A log of all interaction metrics for the current session.</TableCaption>
        <TableHeader className="sticky top-0 bg-card z-10">
          <TableRow>
            <TableHead className="w-[180px]">Timestamp</TableHead>
            <TableHead>User Input</TableHead>
            <TableHead>Agent Response</TableHead>
            <TableHead className="text-right">LLM (ms)</TableHead>
            <TableHead className="text-right">TTS (ms)</TableHead>
            <TableHead className="text-right">TTFB Text (ms)</TableHead>
            <TableHead className="text-right">EOU Audio (ms)</TableHead>
            <TableHead className="text-right">Total (ms)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {metrics.map((metric) => (
            <TableRow key={metric.turnId}>
              <TableCell className="font-medium">{new Date(metric.userInputTimestamp).toLocaleTimeString()}</TableCell>
              <TableCell className="max-w-[200px] truncate" title={metric.userInputText}>{metric.userInputText}</TableCell>
              <TableCell className="max-w-[200px] truncate" title={metric.agentResponseText}>{metric.agentResponseText}</TableCell>
              <TableCell className="text-right">{metric.llmProcessingTimeMs}</TableCell>
              <TableCell className="text-right">{metric.ttsProcessingTimeMs}</TableCell>
              <TableCell className="text-right">{metric.ttftTextMs}</TableCell>
              <TableCell className="text-right">{metric.eouAudioReadyMs}</TableCell>
              <TableCell className="text-right font-semibold">{metric.totalInteractionLatencyMs}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
