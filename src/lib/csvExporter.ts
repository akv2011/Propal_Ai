import type { InteractionMetrics } from "@/components/voice-agent/VoiceAgentInterface";

export function exportToCsv(filename: string, rows: object[]): boolean {
  if (typeof window === 'undefined' || !rows || !rows.length) {
    return false;
  }
  const separator = ',';
  const keys = Object.keys(rows[0]);
  const csvContent =
    keys.join(separator) +
    '\n' +
    rows.map(row => {
      return keys.map(k => {
        let cell = (row as any)[k] === null || (row as any)[k] === undefined ? '' : (row as any)[k];
        cell = cell instanceof Date
          ? cell.toISOString() // Use ISOString for dates for consistency
          : cell.toString().replace(/"/g, '""');
        if (cell.search(/("|,|\n)/g) >= 0) {
          cell = `"${cell}"`;
        }
        return cell;
      }).join(separator);
    }).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  }
  return false;
}

/**
 * Converts an array of InteractionMetrics objects into a CSV formatted string.
 * @param metricsLog Array of InteractionMetrics objects.
 * @returns A string in CSV format.
 */
export function exportMetricsToCSV(metricsLog: InteractionMetrics[]): string {
  if (!metricsLog || metricsLog.length === 0) {
    return ""; // Return empty string if no metrics
  }

  const headers: Array<keyof InteractionMetrics> = [
    "turnId",
    "userInputTimestamp",
    "userInputText",
    "sttModelUsed",
    "llmRequestTimestamp",
    "llmResponseFirstByteTimestamp",
    "llmResponseLastByteTimestamp",
    "llmProcessingTimeMs",
    "ttftTextMs",
    "agentResponseText",
    "llmModelUsed",
    "ttsRequestTimestamp",
    "ttsResponseFirstAudioTimestamp",
    "ttsResponseLastAudioTimestamp",
    "ttsProcessingTimeMs",
    "ttsModelUsed",
    "eouAudioReadyMs",
    "totalInteractionLatencyMs",
  ];

  const csvRows: string[] = [];
  csvRows.push(headers.join(",")); // Header row

  for (const log of metricsLog) {
    const values = headers.map(header => {
      const value = log[header];
      if (value === undefined || value === null) {
        return ""; 
      }
      const stringValue = String(value);
      // Escape commas, quotes, and newlines in string values
      if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}
