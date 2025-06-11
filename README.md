# Propal AI - Voice Agent

## Overview

This project is an AI-powered voice agent designed to facilitate real-time, natural language conversations. It integrates Speech-to-Text (STT), Large Language Model (LLM) processing, and Text-to-Speech (TTS) into a cohesive pipeline. The initial implementation features a Flask backend providing these services over HTTP, and a React/Next.js frontend for user interaction and metrics display. The project is currently transitioning towards using the LiveKit agent framework for a more robust and real-time voice agent architecture.

A key focus is on performance, with detailed metrics logging (including EOU delay, TTFT, TTFB, and total latency) per session, aiming for a total interaction latency below 2 seconds. Interruption handling is a planned feature for more natural conversation flow.

## Key Features

*   **Real-time Voice Pipeline:** Integrates STT, LLM, and TTS.
*   **STT:** Deepgram (Nova-2 model).
*   **LLM:** Groq (Llama3-8B model).
*   **TTS:** ElevenLabs.
*   **Frontend Interface:** React/Next.js application for voice input, displaying conversation, and metrics.
*   **Detailed Metrics Logging:** Captures various latency metrics (EOU delay, TTFT, TTFB, total latency) for each interaction.
*   **Metrics Export:** Saves logged metrics to an Excel file.
*   **LiveKit Agent Integration (In Progress):** Refactoring to use the LiveKit agent framework for enhanced real-time capabilities.
*   **Interruption Handling (Planned):** Functionality to allow users to interrupt the agent naturally.

## Tech Stack

*   **Backend:**
    *   Python
    *   Flask (current HTTP backend)
    *   LiveKit Agent SDK (target architecture)
    *   Deepgram SDK
    *   Groq SDK
    *   ElevenLabs SDK
    *   python-dotenv
    *   Pandas (for metrics export)
*   **Frontend:**
    *   React
    *   Next.js
    *   TypeScript
    *   Tailwind CSS
*   **Environment Management:** `.env` files for API keys.

## Project Structure

```
/home/Arun/Desktop/Hack/Propal_Ai/
├── flask_backend/         # Python backend (Flask app and LiveKit agent)
│   ├── app.py             # Current Flask application
│   ├── agent_helpers.py   # Helper functions for STT/LLM/TTS clients
│   ├── livekit_agent.py   # LiveKit agent implementation (in progress)
│   ├── requirements.txt   # Python dependencies
│   └── .env.example       # Example environment variables for backend
├── src/                   # Next.js frontend application
│   ├── app/               # Main app routes and layout
│   ├── components/        # UI components (including voice agent interface)
│   │   └── voice-agent/   # Voice agent specific components
│   ├── ai/                # Client-side AI related logic (if any, or for future use)
│   └── ...
├── .env.example           # Example environment variables for frontend (if needed)
├── next.config.ts
├── package.json
└── README.md
```

## Setup and Installation

### Prerequisites

*   Python 3.8+
*   Node.js 18.x+ and npm/yarn

### Backend Setup (`flask_backend`)

1.  **Navigate to the backend directory:**
    ```bash
    cd flask_backend
    ```
2.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```
3.  **Install Python dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
4.  **Set up environment variables:**
    *   Copy `.env.example` to `.env` (if an example is provided, otherwise create `.env`):
        ```bash
        cp .env.example .env
        ```
    *   Fill in your API keys in the `.env` file:
        ```
        DEEPGRAM_API_KEY="your_deepgram_api_key"
        ELEVENLABS_API_KEY="your_elevenlabs_api_key"
        ELEVENLABS_VOICE_ID="your_elevenlabs_voice_id" # Optional, defaults provided
        GROQ_API_KEY="your_groq_api_key"
        
        LIVEKIT_API_KEY="your_livekit_api_key"         # For LiveKit agent
        LIVEKIT_API_SECRET="your_livekit_api_secret"   # For LiveKit agent
        LIVEKIT_URL="your_livekit_ws_url"            # For LiveKit agent (e.g., ws://localhost:7880)
        ```

### Frontend Setup (root directory)

1.  **Navigate to the project root directory:**
    ```bash
    cd /home/Arun/Desktop/Hack/Propal_Ai
    ```
2.  **Install Node.js dependencies:**
    ```bash
    npm install
    # or
    # yarn install
    ```
3.  **Environment Variables (Frontend):** If the frontend requires specific environment variables (e.g., for a different set of API keys or feature flags), create a `.env.local` file in the root and add them there, prefixed with `NEXT_PUBLIC_` if they need to be accessible in the browser.

## Running the Application

### 1. Backend

*   **Current Flask Backend:**
    ```bash
    cd flask_backend
    source venv/bin/activate # If you used a virtual environment
    python app.py
    ```
    The Flask app will typically run on `http://localhost:5000`.

*   **LiveKit Agent (Target):**
    Once the LiveKit agent (`livekit_agent.py`) is ready and LiveKit server is set up:
    ```bash
    cd flask_backend
    source venv/bin/activate # If you used a virtual environment
    # Ensure LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL are in .env or pass as args
    livekit-agent start --agent flask_backend.livekit_agent:VoiceAgent
    ```

### 2. Frontend

1.  **Navigate to the project root directory:**
    ```bash
    cd /home/Arun/Desktop/Hack/Propal_Ai
    ```
2.  **Start the Next.js development server:**
    ```bash
    npm run dev
    # or
    # yarn dev
    ```
    The frontend will typically be available at `http://localhost:3000`.

## Key Components

*   **`flask_backend/app.py`:** The current Flask application serving STT, LLM, and TTS functionalities via HTTP endpoints. It also handles metrics logging and export.
*   **`flask_backend/agent_helpers.py`:** Contains shared logic for initializing and interacting with Deepgram, Groq, and ElevenLabs clients.
*   **`flask_backend/livekit_agent.py`:** (In progress) Implementation of the `VoiceAssistant` from the LiveKit Agent SDK, intended to replace the Flask HTTP pipeline for real-time voice interactions.
*   **`src/components/voice-agent/VoiceAgentInterface.tsx`:** The main React component for the frontend, handling audio recording, communication with the backend, displaying conversation, and managing metrics UI.
*   **`src/components/voice-agent/MetricsDisplay.tsx` & `MetricsLogTable.tsx`:** Components for visualizing current and historical interaction metrics.

## Current Status & Future Goals

*   **Current:** A functional proof-of-concept with a React frontend communicating with a Flask backend over HTTP for STT, LLM, and TTS. Basic metrics are collected and can be exported.
*   **In Progress:** Migrating the core voice agent logic to the LiveKit agent framework (`livekit_agent.py`).
*   **TODOs / Future Enhancements:**
    *   Fully implement and test the LiveKit agent.
    *   Implement robust interruption handling (barge-in) within the LiveKit framework.
    *   Refine and ensure accurate metrics collection (EOU delay, TTFT, TTFB, total latency) within the LiveKit agent's lifecycle.
    *   Integrate Excel export functionality with LiveKit agent session management.
    *   Optimize the entire pipeline to consistently achieve < 2 seconds total latency.
    *   Enhance error handling and user feedback.