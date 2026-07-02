// src/components/ChatPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, RefreshCw, Cpu, ArrowRight } from 'lucide-react';
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
  agents: any[];
  connections: any[];
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  conversationId,
  messages,
  onSendMessage,
  onRegenerate,
  isExecuting,
  agents,
  connections,
}) => {
  const [input, setInput] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedProvider, setEditedProvider] = useState('gemini');
  const [editedModel, setEditedModel] = useState('gemini-2.0-flash');
  
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
      setEditedModel('gemini-2.0-flash');
    }
  };

  const handleSaveTweak = async (msgId: string) => {
    if (!conversationId) return;
    
    // Set executing state in real-time db
    const msg = messages.find(m => m.id === msgId);
    if (msg && msg.sender_id) {
      await cacheService.setRunningState(conversationId, msg.sender_id, 'executing');
    }

    try {
      await onRegenerate(msgId, editedPrompt, editedProvider, editedModel);
    } finally {
      setEditingMessageId(null);
      await cacheService.setRunningState(conversationId, null, 'done');
    }
  };

  // Helper: Get topological execution order
  const getExecutionOrder = () => {
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

    const agentMap = new Map(agents.map(a => [a.id, a]));
    return order.map(id => agentMap.get(id)).filter(Boolean);
  };

  const executionOrder = getExecutionOrder();

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Top Header Status Bar */}
      <div className="px-6 py-3 bg-slate-900/40 border-b border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs font-semibold text-slate-300">
            {conversationId ? '對話視窗已開啟' : '請在左側選擇或新建對話'}
          </span>
        </div>

        {/* Visualized Connection Sequence */}
        {executionOrder.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mr-1">工作流程:</span>
            {executionOrder.map((agent, idx) => {
              const isActive = realtimeState.agentId === agent.id && realtimeState.status === 'executing';
              return (
                <React.Fragment key={agent.id}>
                  {idx > 0 && <ArrowRight size={10} className="text-slate-700" />}
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                      isActive
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse shadow-md shadow-amber-500/5'
                        : 'bg-slate-900/60 text-slate-400 border-slate-800/60'
                    }`}
                  >
                    {agent.name}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Chat Messages Log */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
            <div className="p-4 rounded-full bg-indigo-500/5 border border-indigo-500/10 text-indigo-400">
              <Sparkles size={32} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-200">張奶爸投資顧問公司 - 工作室</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                在下方發送您的今日指令。您的 AI 員工將會根據配置好的工作流依序執行、傳遞資訊，並向您呈報最終成果。
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender_type === 'user';
            const isEditing = editingMessageId === msg.id;

            return (
              <div
                key={msg.id}
                className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {/* Agent Avatar */}
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400 flex-shrink-0 font-semibold text-xs shadow-md">
                    {msg.sender_name.slice(0, 2)}
                  </div>
                )}

                <div className={`max-w-[75%] space-y-1.5 ${isUser ? 'text-right' : 'text-left'}`}>
                  {/* Sender Name & Info */}
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 px-1">
                    <span className="font-semibold text-slate-400">{msg.sender_name}</span>
                    {!isUser && msg.model_snapshot && (
                      <span className="font-mono bg-slate-900 border border-slate-800/80 px-1 rounded text-slate-500">
                        {msg.model_snapshot}
                      </span>
                    )}
                  </div>

                  {/* Bubble Content */}
                  <div
                    className={`rounded-xl px-4 py-3 text-xs leading-relaxed shadow-sm border transition-all ${
                      isUser
                        ? 'bg-indigo-600 border-indigo-500/20 text-white text-left'
                        : 'bg-slate-900/60 border-slate-800/60 text-slate-300'
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-3 py-1">
                        <div>
                          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">微調系統提示詞 (Prompt Tuning)</label>
                          <textarea
                            rows={4}
                            value={editedPrompt}
                            onChange={(e) => setEditedPrompt(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none focus:border-indigo-500 font-mono resize-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">供應商 (Provider)</label>
                            <select
                              value={editedProvider}
                              onChange={(e) => setEditedProvider(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500"
                            >
                              <option value="gemini">Gemini</option>
                              <option value="openrouter">OpenRouter</option>
                              <option value="openai">OpenAI</option>
                              <option value="anthropic">Anthropic</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">模型 (Model)</label>
                            <input
                              type="text"
                              value={editedModel}
                              onChange={(e) => setEditedModel(e.target.value)}
                              placeholder="例如: gemini-2.0-flash"
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-1.5 pt-1">
                          <button
                            onClick={() => setEditingMessageId(null)}
                            className="px-2.5 py-1.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
                          >
                            取消
                          </button>
                          <button
                            onClick={() => handleSaveTweak(msg.id)}
                            className="px-2.5 py-1.5 rounded text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer flex items-center gap-1"
                          >
                            <RefreshCw size={10} /> 重新執行
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>

                  {/* Actions (Tweak Prompt for Agent Responses) */}
                  {!isUser && !isEditing && msg.prompt_snapshot && (
                    <div className="flex justify-start px-1">
                      <button
                        onClick={() => handleStartTweak(msg)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-900 transition-colors cursor-pointer"
                      >
                        <Cpu size={10} /> 調整提示詞並重試
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Real-time executing indicators */}
        {realtimeState.status === 'executing' && realtimeState.agentId && (
          <div className="flex gap-4 justify-start animate-pulse">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-400 flex-shrink-0 font-bold text-xs">
              {agents.find(a => a.id === realtimeState.agentId)?.name.slice(0, 2) || 'AI'}
            </div>
            <div className="max-w-[75%] space-y-1.5 text-left">
              <div className="text-[10px] text-slate-500 px-1 font-semibold text-amber-500">
                {agents.find(a => a.id === realtimeState.agentId)?.name || 'AI 員工'} 正在執行分析...
              </div>
              <div className="rounded-xl px-4 py-3 bg-slate-900/30 border border-slate-800/40 text-slate-400 text-xs italic flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin text-amber-500" />
                正在撰寫市場報告與進度呈報...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Message Form */}
      <div className="p-6 border-t border-slate-900 bg-slate-950/60">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            required
            disabled={isExecuting || !conversationId}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              !conversationId
                ? '請先在左側選取對話或新建對話'
                : isExecuting
                ? '工作流正在執行中，請稍候...'
                : '發送您的指令給經理 (例如: 經理，請整理早盤晨報)...'
            }
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isExecuting || !input.trim() || !conversationId}
            className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/10 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center cursor-pointer"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};
