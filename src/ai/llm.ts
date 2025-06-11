import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY; // Assuming you'll add this to your .env.local
// If you are using a different provider with Groq (like Together AI or OpenAI proxy),
// you might need to adjust the baseURL and how the API key is handled.

if (!GROQ_API_KEY) {
  console.warn(
    "GROQ_API_KEY is not set in environment variables. LLM functionality will be limited."
  );
}

let groqClient: Groq;

const getGroqClient = () => {
  if (!groqClient && GROQ_API_KEY) {
    groqClient = new Groq({
      apiKey: GROQ_API_KEY,
      // If using a custom base URL for a proxy or different provider with Groq:
      // baseURL: "https://api.example.com/v1" 
    });
  }
  return groqClient;
};

export interface LlmOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  systemPrompt?: string;
  // Add other LLM options as needed
}

/**
 * Generates a text response from the LLM based on the user query.
 */
export const generateLlmResponse = async (
  userQuery: string,
  options?: LlmOptions
): Promise<string | null> => {
  const client = getGroqClient();
  if (!client) {
    console.error("Groq client not initialized. Check API key.");
    return "Error: LLM client not initialized.";
  }

  const model = options?.model || "llama3-8b-8192"; // Default model, adjust as needed

  try {
    const chatCompletion = await client.chat.completions.create({
      messages: [
        {
          role: "system",
          content: options?.systemPrompt || "You are a helpful AI assistant for a small business in India. Respond concisely and naturally. If discussing complex topics, try to break them down.",
        },
        {
          role: "user",
          content: userQuery,
        },
      ],
      model: model,
      temperature: options?.temperature || 0.7,
      max_tokens: options?.max_tokens || 150,
      // stream: true, // Enable for streaming responses if needed for TTFB
    });

    // If streaming:
    /*
    let fullResponse = "";
    for await (const chunk of chatCompletion) {
      fullResponse += chunk.choices[0]?.delta?.content || "";
      // Here you could yield or send chunks for faster TTFB to TTS
    }
    return fullResponse;
    */

    return chatCompletion.choices[0]?.message?.content || "";

  } catch (error) {
    console.error(`Error generating LLM response from ${model}:`, error);
    return `Sorry, I encountered an issue trying to respond with ${model}.`;
  }
};

// Example Usage (you'll integrate this into your agent pipeline):
/*
async function testLlm() {
  const userQuery = "नमस्ते, आपकी दुकान कितने बजे खुलती है?"; // Example in Hindi
  try {
    const response = await generateLlmResponse(userQuery, {
      systemPrompt: "You are a helpful shop assistant for a local Kirana store in India. Respond in Hinglish or Hindi if appropriate.",
      model: "mixtral-8x7b-32768" // Or another model available via Groq
    });
    console.log("LLM Response:", response);
  } catch (error) {
    console.error("Failed to get LLM response:", error);
  }
}

testLlm();
*/
