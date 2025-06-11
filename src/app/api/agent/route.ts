import { NextRequest, NextResponse } from "next/server";
import { PropalVoiceAgent } from "@/ai/livekit-agent"; // Adjust path if your tsconfig has different aliases
import type { InteractionMetrics } from "@/components/voice-agent/VoiceAgentInterface";
import { exportMetricsToCSV } from "@/lib/csvExporter"; // We will create this file next

// In-memory store for active agents (roomName -> agentInstance)
// For a real application, you'd use a more persistent store or a proper agent management system.
const activeAgents: Map<string, PropalVoiceAgent> = new Map();

// Ensure LiveKit environment variables are loaded (though agent itself checks)
if (!process.env.LIVEKIT_HOST || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
  console.warn("LiveKit API credentials or host are not set. Agent functionality may be limited.");
}

/**
 * POST /api/agent/start
 * Starts a new voice agent for a given room.
 * Request body: { roomName: string, agentIdentity?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const roomName = body.roomName;
    const agentIdentity = body.agentIdentity || `propal-agent-${roomName.replace(/\W/g, '_')}`;

    if (!roomName) {
      return NextResponse.json({ message: "roomName is required" }, { status: 400 });
    }

    if (activeAgents.has(roomName)) {
      return NextResponse.json({ message: `Agent already active in room ${roomName}` }, { status: 400 });
    }

    console.log(`[API] Received request to start agent for room: ${roomName} with identity: ${agentIdentity}`);

    const agent = new PropalVoiceAgent({
      roomName,
      participantIdentity: agentIdentity,
      participantName: `Propal AI (${roomName})`,
    });

    await agent.start(); // Agent's start method is currently simplified
    activeAgents.set(roomName, agent);

    console.log(`[API] Agent started and registered for room: ${roomName}`);
    return NextResponse.json({ message: `Agent started for room ${roomName}`, agentIdentity });

  } catch (error) {
    console.error("[API] Error starting agent:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ message: "Failed to start agent", error: errorMessage }, { status: 500 });
  }
}

/**
 * GET /api/agent/metrics?roomName={roomName}
 * Retrieves the metrics log for an agent in a specific room.
 * Optionally, ?format=csv to download as CSV.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const roomName = searchParams.get("roomName");
  const format = searchParams.get("format");

  if (!roomName) {
    return NextResponse.json({ message: "roomName query parameter is required" }, { status: 400 });
  }

  const agent = activeAgents.get(roomName);
  if (!agent) {
    return NextResponse.json({ message: `No active agent found for room ${roomName}` }, { status: 404 });
  }

  const metricsLog = agent.getMetricsLog();

  if (format === "csv") {
    if (metricsLog.length === 0) {
      return NextResponse.json({ message: "No metrics to export for room " + roomName }, { status: 200 });
    }
    try {
      const csvData = exportMetricsToCSV(metricsLog);
      return new NextResponse(csvData, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="metrics_${roomName}_${new Date().toISOString()}.csv"`,
        },
      });
    } catch (error) {
      console.error("[API] Error generating CSV:", error);
      return NextResponse.json({ message: "Failed to generate CSV" }, { status: 500 });
    }
  } else {
    return NextResponse.json({ roomName, metricsLogCount: metricsLog.length, metricsLog });
  }
}

/**
 * POST /api/agent/stop  // Corrected to DELETE as per previous implementation, but the comment says POST. Assuming DELETE is intended.
 * Stops an agent in a given room.
 * Request body: { roomName: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json(); // Added to parse the request body
    const roomName = body.roomName; // Added to extract roomName from the body

    if (!roomName) {
      return NextResponse.json({ message: "roomName is required" }, { status: 400 });
    }

    const agent = activeAgents.get(roomName);
    if (!agent) {
      return NextResponse.json({ message: `No active agent found for room ${roomName}` }, { status: 404 });
    }

    await agent.stop();
    activeAgents.delete(roomName);

    return NextResponse.json({ message: `Agent stopped for room ${roomName}` });

  } catch (error) {
    console.error("[API] Error stopping agent:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ message: "Failed to stop agent", error: errorMessage }, { status: 500 });
  }
}

// TODO: Add an endpoint to simulate sending audio to the agent for testing the pipeline
// POST /api/agent/process-audio
// Body: { roomName: string, audioBase64: string }
// This would convert base64 audio to a Buffer and call agent.handleUserAudio(buffer)
