'use server';
/**
 * @fileOverview An AI agent to generate a relevant text response based on user query,
 * potentially acknowledging interruptions and suggesting an emotion for delivery.
 *
 * - respondToUserQuery - A function that handles the user query and returns a response.
 * - RespondToUserQueryInput - The input type for the respondToUserQuery function.
 * - RespondToUserQueryOutput - The return type for the respondToUserQuery function.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export type RespondToUserQueryInput = {
  userQuery: string;
  wasInterrupted?: boolean;
};

export type RespondToUserQueryOutput = {
  agentResponse: string;
  emotion: string;
};

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

export async function respondToUserQuery(input: RespondToUserQueryInput): Promise<RespondToUserQueryOutput> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    let prompt = `You are an AI voice agent for proPAL AI, an indigenous Voice AI platform revolutionizing how small and medium businesses (SMBs) in India interact with their customers.
Your goal is to provide helpful, relevant, and natural-sounding responses.

`;

    if (input.wasInterrupted) {
      prompt += `IMPORTANT: You were just speaking and got interrupted by the user. Start your response by briefly acknowledging this interruption (e.g., "My apologies, I believe I was cut off. What were you saying?" or "Oh, sorry about that. Please go ahead.").
When acknowledging an interruption, your "emotion" output field should be 'apologetic'. After the acknowledgement, proceed to answer their current query.

`;
    }

    prompt += `Based on the user's query: "${input.userQuery}"

1. Generate a text response.
2. Determine an appropriate emotion for delivering this response.
   - If you are acknowledging an interruption, the primary emotion for the entire response should be 'apologetic' or 'calm' to maintain a polite tone.
   - Otherwise, choose an emotion from: 'neutral', 'excited', 'curious', 'calm'. Select the emotion that best fits the content of your text response and the context of the user's query.

Provide your output ONLY as a JSON object with "agentResponse" and "emotion" fields.
Example: {"agentResponse": "That's a great question! Let me help you with that.", "emotion": "curious"}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    try {
      // Try to parse as JSON
      const parsedResponse = JSON.parse(text);
      
      if (parsedResponse.agentResponse && parsedResponse.emotion) {
        return {
          agentResponse: parsedResponse.agentResponse,
          emotion: parsedResponse.emotion,
        };
      }
    } catch (parseError) {
      // If JSON parsing fails, extract response manually
      console.warn('Failed to parse JSON response, using fallback:', text);
    }
    
    // Fallback: use the raw text as response
    return {
      agentResponse: text || "I apologize, but I'm having trouble processing your request right now.",
      emotion: input.wasInterrupted ? 'apologetic' : 'neutral',
    };
    
  } catch (error) {
    console.error('Error in respondToUserQuery:', error);
    return {
      agentResponse: "I apologize, but I'm experiencing technical difficulties. Please try again.",
      emotion: 'apologetic',
    };
  }
}
