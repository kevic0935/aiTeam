// functions/api/[[path]].ts
import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { cors } from 'hono/cors';
import { callLLM } from './utils/llm';

type Bindings = {
  DB: D1Database;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

// Enable CORS
app.use('*', cors());

// Helper: Generate UUID
function generateUUID() {
  return crypto.randomUUID();
}

// -------------------------------------------------------------
// Agent Endpoints
// -------------------------------------------------------------

// List all agents
app.get('/agents', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM agents').all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Create/Update agent
app.post('/agents', async (c) => {
  try {
    const body = await c.req.json();
    const {
      id,
      name,
      description,
      system_prompt,
      model_provider,
      model_name,
      temperature,
      position_x,
      position_y,
    } = body;

    const agentId = id || generateUUID();
    
    await c.env.DB.prepare(`
      INSERT INTO agents (id, name, description, system_prompt, model_provider, model_name, temperature, position_x, position_y, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        system_prompt = excluded.system_prompt,
        model_provider = excluded.model_provider,
        model_name = excluded.model_name,
        temperature = excluded.temperature,
        position_x = excluded.position_x,
        position_y = excluded.position_y,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      agentId,
      name,
      description || '',
      system_prompt,
      model_provider,
      model_name,
      temperature !== undefined ? temperature : 0.7,
      position_x !== undefined ? position_x : 0.0,
      position_y !== undefined ? position_y : 0.0
    ).run();

    const agent = await c.env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first();
    return c.json(agent);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Delete agent
app.delete('/agents/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM agents WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// -------------------------------------------------------------
// Connection Endpoints
// -------------------------------------------------------------

// List connections
app.get('/connections', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM agent_connections').all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Create connection
app.post('/connections', async (c) => {
  try {
    const body = await c.req.json();
    const { id, source_agent_id, target_agent_id } = body;
    const connectionId = id || generateUUID();

    await c.env.DB.prepare(`
      INSERT INTO agent_connections (id, source_agent_id, target_agent_id)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source_agent_id = excluded.source_agent_id,
        target_agent_id = excluded.target_agent_id
    `).bind(connectionId, source_agent_id, target_agent_id).run();

    return c.json({ id: connectionId, source_agent_id, target_agent_id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Delete connection
app.delete('/connections/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM agent_connections WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// -------------------------------------------------------------
// Conversation & Message Endpoints
// -------------------------------------------------------------

// Get list of conversations
app.get('/conversations', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM conversations ORDER BY created_at DESC').all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Create conversation
app.post('/conversations', async (c) => {
  try {
    const body = await c.req.json();
    const id = body.id || generateUUID();
    const title = body.title || 'New Conversation';

    await c.env.DB.prepare('INSERT INTO conversations (id, title) VALUES (?, ?)').bind(id, title).run();
    return c.json({ id, title });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get messages in conversation
app.get('/conversations/:id/messages', async (c) => {
  const id = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').bind(id).all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// -------------------------------------------------------------
// Orchestration & Multi-Agent Execution
// -------------------------------------------------------------

// Topological sort helper for DAG of agents
function getExecutionOrder(agents: any[], connections: any[]): any[] {
  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  agents.forEach(a => {
    adjList.set(a.id, []);
    inDegree.set(a.id, 0);
  });

  connections.forEach(conn => {
    if (adjList.has(conn.source_agent_id) && adjList.has(conn.target_agent_id)) {
      adjList.get(conn.source_agent_id)!.push(conn.target_agent_id);
      inDegree.set(conn.target_agent_id, (inDegree.get(conn.target_agent_id) || 0) + 1);
    }
  });

  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const order: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    order.push(curr);
    
    const neighbors = adjList.get(curr) || [];
    neighbors.forEach(n => {
      inDegree.set(n, inDegree.get(n)! - 1);
      if (inDegree.get(n) === 0) {
        queue.push(n);
      }
    });
  }

  // Return the agents in order
  const agentMap = new Map(agents.map(a => [a.id, a]));
  return order.map(id => agentMap.get(id)).filter(Boolean);
}

// Function to run execution pipeline
async function executeAgentPipeline(
  db: D1Database,
  env: Bindings,
  conversationId: string,
  startFromAgentId?: string,
  userPromptForTurn?: string
) {
  // 1. Fetch agents & connections
  const { results: agents } = await db.prepare('SELECT * FROM agents').all();
  const { results: connections } = await db.prepare('SELECT * FROM agent_connections').all();

  if (agents.length === 0) {
    throw new Error('No agents configured in the workspace.');
  }

  // 2. Sort agents topologically
  const sortedAgents = getExecutionOrder(agents, connections);

  // 3. Find if we are starting from a specific agent (e.g. for regeneration)
  let startIndex = 0;
  if (startFromAgentId) {
    startIndex = sortedAgents.findIndex(a => a.id === startFromAgentId);
    if (startIndex === -1) startIndex = 0;
  }

  // 4. Retrieve existing messages to build historical context
  const { results: rawHistory } = await db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .bind(conversationId)
    .all();

  // We group message history by turns.
  // We want to pass previous user interactions and their full pipeline responses as context.
  // The history passed to LLM will contain the historical user prompts and agent responses.
  const historyForLLM: { role: 'user' | 'assistant'; content: string }[] = [];
  
  // To avoid duplicate context, let's build a clean list of past messages.
  // User messages -> 'user'. Agent messages -> 'assistant'.
  // However, since we are doing multi-agent, we can prefix agent messages with their names to help models understand who said what.
  rawHistory.forEach((msg: any) => {
    if (msg.sender_type === 'user') {
      historyForLLM.push({ role: 'user', content: msg.content });
    } else {
      historyForLLM.push({ role: 'assistant', content: `[${msg.sender_name}]: ${msg.content}` });
    }
  });

  // Track outputs generated during this current execution sweep
  const currentTurnOutputs = new Map<string, string>();

  // Iterate over agents in topological order starting from startIndex
  for (let i = startIndex; i < sortedAgents.length; i++) {
    const agent = sortedAgents[i];
    
    // Find who inputs into this agent
    const incomingConnections = connections.filter(c => c.target_agent_id === agent.id);
    
    let currentInputPrompt = '';
    
    if (incomingConnections.length === 0) {
      // Entry agent. Its input is either the explicit userPromptForTurn or the last user message in the conversation.
      if (userPromptForTurn) {
        currentInputPrompt = userPromptForTurn;
      } else {
        const lastUserMsg: any = rawHistory.filter((m: any) => m.sender_type === 'user').pop();
        currentInputPrompt = lastUserMsg ? lastUserMsg.content : '';
      }
    } else {
      // Non-entry agent. Its input is the concatenated output of its predecessor agents in this turn
      const inputs: string[] = [];
      incomingConnections.forEach(conn => {
        const out = currentTurnOutputs.get(conn.source_agent_id);
        if (out) {
          inputs.push(`[Input from ${agents.find(a => a.id === conn.source_agent_id)?.name}]:\n${out}`);
        } else {
          // If the predecessor has already run in past turns and is not run now, look it up in history
          const lastAgentMsg: any = rawHistory
            .filter((m: any) => m.sender_id === conn.source_agent_id)
            .pop();
          if (lastAgentMsg) {
            inputs.push(`[Input from ${agents.find(a => a.id === conn.source_agent_id)?.name}]:\n${lastAgentMsg.content}`);
          }
        }
      });
      currentInputPrompt = inputs.join('\n\n');
    }

    if (!currentInputPrompt) {
      // If there's no input for this agent, skip or use a placeholder
      currentInputPrompt = 'No preceding output.';
    }

    // Get API Key
    let apiKey = '';
    if (agent.model_provider === 'gemini') apiKey = env.GEMINI_API_KEY || '';
    else if (agent.model_provider === 'openai') apiKey = env.OPENAI_API_KEY || '';
    else if (agent.model_provider === 'anthropic') apiKey = env.ANTHROPIC_API_KEY || '';

    // Invoke the LLM
    let outputText = '';
    try {
      outputText = await callLLM({
        provider: agent.model_provider,
        model: agent.model_name,
        systemPrompt: agent.system_prompt,
        history: historyForLLM,
        prompt: currentInputPrompt,
        temperature: agent.temperature,
        apiKey,
      });
    } catch (err: any) {
      outputText = `[Error executing agent ${agent.name}]: ${err.message}`;
    }

    // Save the output to current turn outputs
    currentTurnOutputs.set(agent.id, outputText);

    // Save message to D1
    const messageId = generateUUID();
    await db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, content, prompt_snapshot, model_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      messageId,
      conversationId,
      'agent',
      agent.id,
      agent.name,
      outputText,
      agent.system_prompt,
      agent.model_name
    ).run();

    // Append this agent's response to the LLM history for the subsequent agents in this same sweep
    historyForLLM.push({ role: 'assistant', content: `[${agent.name}]: ${outputText}` });
  }

  return { success: true };
}

// 1. Submit User Message and run pipeline
app.post('/chat/message', async (c) => {
  try {
    const body = await c.req.json();
    const { conversation_id, content } = body;

    if (!conversation_id || !content) {
      return c.json({ error: 'conversation_id and content are required' }, 400);
    }

    // Save user message to database
    const userMsgId = generateUUID();
    await c.env.DB.prepare(`
      INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, content)
      VALUES (?, ?, 'user', NULL, 'User', ?)
    `).bind(userMsgId, conversation_id, content).run();

    // Execute multi-agent pipeline
    await executeAgentPipeline(c.env.DB, c.env, conversation_id, undefined, content);

    // Return the updated message list
    const { results } = await c.env.DB.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .bind(conversation_id)
      .all();
    return c.json({ messages: results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. Tweak Prompt / Model and Regenerate
app.post('/chat/regenerate', async (c) => {
  try {
    const body = await c.req.json();
    const { message_id, system_prompt, model_provider, model_name } = body;

    if (!message_id) {
      return c.json({ error: 'message_id is required' }, 400);
    }

    // Fetch the target message
    const msg: any = await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(message_id).first();
    if (!msg) {
      return c.json({ error: 'Message not found' }, 404);
    }

    const { conversation_id, sender_id, created_at } = msg;

    if (!sender_id) {
      return c.json({ error: 'Cannot regenerate a user message directly. Please edit agent messages.' }, 400);
    }

    // Update the agent configuration in DB
    await c.env.DB.prepare(`
      UPDATE agents
      SET system_prompt = ?, model_provider = ?, model_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(system_prompt, model_provider, model_name, sender_id).run();

    // Delete all messages in the conversation created AFTER or AT this message's creation time
    // This wipes the history from this execution onwards
    await c.env.DB.prepare(`
      DELETE FROM messages
      WHERE conversation_id = ? AND created_at >= ?
    `).bind(conversation_id, created_at).run();

    // Trigger execution pipeline starting specifically from this agent
    await executeAgentPipeline(c.env.DB, c.env, conversation_id, sender_id);

    // Return the updated message list
    const { results } = await c.env.DB.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .bind(conversation_id)
      .all();
    return c.json({ messages: results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export const onRequest = handle(app);
