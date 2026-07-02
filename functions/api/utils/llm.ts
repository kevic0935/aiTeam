// functions/api/utils/llm.ts

export interface LLMRequest {
  provider: string; // 'gemini' | 'openai' | 'anthropic'
  model: string;
  systemPrompt: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  prompt: string;
  temperature?: number;
  apiKey: string;
}

// Helper: Fetch with exponential backoff on 429 Rate Limit
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 5,
  initialDelay = 2000
): Promise<Response> {
  let retries = maxRetries;
  let delay = initialDelay;

  while (retries > 0) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      retries--;
      if (retries === 0) {
        return response;
      }
      // Wait before retrying (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
      continue;
    }
    return response;
  }
  return fetch(url, options);
}

export async function callLLM({
  provider,
  model,
  systemPrompt,
  history,
  prompt,
  temperature = 0.7,
  apiKey,
}: LLMRequest): Promise<string> {
  if (!apiKey) {
    throw new Error(`API key for provider "${provider}" is missing.`);
  }

  if (provider === 'gemini') {
    // Format history for Gemini API
    const contents = [];
    
    // Add history
    for (const h of history) {
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      });
    }

    // Add current user prompt
    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          temperature,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } 
  
  if (provider === 'openai') {
    const messages = [];
    
    // System prompt
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // History
    for (const h of history) {
      messages.push({ role: h.role, content: h.content });
    }

    // Current prompt
    messages.push({ role: 'user', content: prompt });

    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'anthropic') {
    const messages = [];

    // History
    for (const h of history) {
      messages.push({ role: h.role, content: h.content });
    }

    // Current prompt
    messages.push({ role: 'user', content: prompt });

    const url = 'https://api.anthropic.com/v1/messages';
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages,
        max_tokens: 4096,
        temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    return data.content?.[0]?.text || '';
  }

  throw new Error(`Unsupported LLM provider: ${provider}`);
}
