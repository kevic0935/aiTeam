// src/components/ChatPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, RefreshCw, Cpu } from 'lucide-react';
import { cacheService } from '../utils/firebase';

interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'user' | 'agent';
  sender_id: string | null;
  sender_name: string;
  content: string;
  prompt_snapshot?: string;
  model_snapshot?: string;
  created_at: string;
}

interface ChatPanelProps {
  conversationId: string | null;
  messages: Message[];
  onSendMessage: (content: string) => Promise<void>;
  onRegenerate: (messageId: string, updatedPrompt: string, provider: string, model: string) => Promise<void>;
  isExecuting: boolean;
  executingAgentId: string | null;
  agents: any[];
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  conversationId,
  messages,
  onSendMessage,
  onRegenerate,
  isExecuting,
  executingAgentId,
  agents,
}) => {
  const [input, setInput] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedProvider, setEditedProvider] = useState('gemini');
  const [editedModel, setEditedModel] = useState('gemini-2.5-flash');
  
  // Real-time listener state from Firebase/Cache
  const [realtimeState, setRealtimeState] = useState<{ agentId: string | null; status: string }>({ agentId: null, status: 'idle' });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to Firebase real-time status updates
  useEffect(() => {
    if (!conversationId) return;
    
    const unsubscribe = cacheService.subscribeToRunningState(conversationId, (state) => {
      setRealtimeState(state);
    });

    return () => unsubscribe();
  }, [conversationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, realtimeState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isExecuting || !conversationId) return;

    const text = input;
    setInput('');
    // Start running animation
    await cacheService.setRunningState(conversationId, 'starting', 'executing');
    try {
      await onSendMessage(text);
    } finally {
      await cacheService.setRunningState(conversationId, null, 'done');
    }
  };

  const handleStartTweak = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditedPrompt(msg.prompt_snapshot || '');
    
    // Attempt to match with existing agent's provider if possible, else defaults
    const agent = agents.find(a => a.id === msg.sender_id);
    if (agent) {
      setEditedProvider(agent.model_provider);
      setEditedModel(agent.model_name);
    } else {
      setEditedProvider('gemini');
      setEditedModel('gemini-2.5-flash');
    }
  };

  const handleSaveTweak = async (msgId: string) => {
    if (!conversationId) return;
    
    // Set executing state in real-time db
    const msg = messages.find(m => m.id === msgId);
    await cacheService.setRunningState(conversationId, msg?.sender_id || null, 'executing');

    try {
      await onRegenerate(msgId, editedPrompt, editedProvider, editedModel);
      setEditingMessageId(null);
    } catch (err) {
      alert('Regeneration failed.');
      console.error(err);
    } finally {
      await cacheService.setRunningState(conversationId, null, 'done');
    }
  };

  // Get agent name by running status
  const getExecutingAgentName = () => {
    const runningAgentId = realtimeState.agentId || executingAgentId;
    if (!runningAgentId) return 'Agent Team';
    const agent = agents.find(a => a.id === runningAgentId);
    return agent ? agent.name : 'Agent';
  };

  return (
    <div className="flex flex-col h-full w-full glass-panel border-0 border-l border-slate-800 rounded-none bg-slate-950/40">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-slate-100 text-sm tracking-wider">AI AGENT COLLABORATION CHAT</h3>
          <p className="text-[10px] text-slate-500 m-0">
            {cacheService.isRealtime() 
              ? '⚡️ Real-time Firebase Sync active' 
              : '💾 In-memory State Sync active (Fallback)'}
          </p>
        </div>
        
        {/* Run state indicator */}
        {(isExecuting || realtimeState.status === 'executing') && (
          <div className="flex items-center gap-1.5 text-xs text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
            <RefreshCw size={12} className="animate-spin" />
            <span>{getExecutingAgentName()} executing...</span>
          </div>
        )}
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!conversationId ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
            <Sparkles size={24} className="text-slate-600 animate-pulse" />
            <p className="text-xs">Create or select a conversation to start testing</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
            <Sparkles size={24} className="text-indigo-500/50" />
            <p className="text-xs">Send a message to trigger the agent workflow</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender_type === 'user';
            const isEditing = editingMessageId === msg.id;

            return (
              <div 
                key={msg.id} 
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group`}
              >
                {/* Sender Tag */}
                <span className="text-[10px] font-semibold text-slate-500 mb-1 px-1">
                  {msg.sender_name}
                </span>

                {/* Message Bubble */}
                <div 
                  className={`relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm transition-all duration-200 ${
                    isUser 
                      ? 'bg-indigo-600 text-white rounded-tr-none' 
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap m-0 leading-relaxed">{msg.content}</p>

                  {/* Prompt Tuning Snapshot Details */}
                  {!isUser && msg.prompt_snapshot && !isEditing && (
                    <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-500 flex items-center gap-2">
                      <span className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                        <Cpu size={10} /> {msg.model_snapshot}
                      </span>
                    </div>
                  )}

                  {/* Dialogue Iteration Tweak Trigger */}
                  {!isUser && msg.sender_id && !isEditing && (
                    <button
                      onClick={() => handleStartTweak(msg)}
                      className="absolute right-2 bottom-2 p-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/30 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer duration-200"
                      title="Tweak Agent configuration & regenerate from here"
                    >
                      <Sparkles size={12} />
                    </button>
                  )}
                </div>

                {/* In-place Prompt Tuning Editor */}
                {isEditing && (
                  <div className="w-full max-w-[90%] mt-2 p-4 glass-card border-indigo-500/50 rounded-xl space-y-3 z-10">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <h5 className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                        <Sparkles size={12} /> Tweak Agent Prompt & Model
                      </h5>
                      <span className="text-[10px] text-slate-500">Updates Agent & regenerates path</span>
                    </div>

                    {/* Model Config Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Provider</label>
                        <select
                          value={editedProvider}
                          onChange={(e) => setEditedProvider(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500"
                        >
                          <option value="gemini">Gemini</option>
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Model</label>
                        <input
                          type="text"
                          value={editedModel}
                          onChange={(e) => setEditedModel(e.target.value)}
                          placeholder="e.g. gemini-2.5-flash"
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* System Prompt Input */}
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">System Prompt</label>
                      <textarea
                        value={editedPrompt}
                        onChange={(e) => setEditedPrompt(e.target.value)}
                        rows={4}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none focus:border-indigo-500 resize-none font-mono"
                      />
                    </div>

                    {/* Action Controls */}
                    <div className="flex justify-end gap-2 text-xs">
                      <button
                        onClick={() => setEditingMessageId(null)}
                        className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveTweak(msg.id)}
                        className="px-3 py-1.5 rounded glow-btn text-white font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw size={12} className="animate-spin-slow" /> Update & Re-run
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-800 bg-slate-950/80 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={!conversationId ? "Select a conversation first" : "Ask the agent team..."}
          disabled={!conversationId || isExecuting}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!conversationId || isExecuting || !input.trim()}
          className="p-2.5 rounded-xl glow-btn text-white disabled:opacity-50 disabled:shadow-none flex items-center justify-center cursor-pointer"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};
