// src/App.tsx
import { useState, useEffect, useCallback } from 'react';
import { Canvas } from './components/Canvas';
import { ChatPanel } from './components/ChatPanel';
import { Plus, MessageSquare, Bot, X, HelpCircle, User } from 'lucide-react';
import { cacheService } from './utils/firebase';

interface Agent {
  id: string;
  name: string;
  description?: string;
  model_provider: string;
  model_name: string;
  temperature: number;
  system_prompt: string;
  position_x: number;
  position_y: number;
}

interface Connection {
  id: string;
  source_agent_id: string;
  target_agent_id: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);

  // Orchestration state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingAgentId, setExecutingAgentId] = useState<string | null>(null);

  // Edit / Add Agent Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [agentForm, setAgentForm] = useState({
    name: '',
    description: '',
    model_provider: 'gemini',
    model_name: 'gemini-1.5-flash',
    temperature: 0.7,
    system_prompt: 'You are a helpful AI assistant.',
  });

  // Fetch all base configurations
  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, connsRes, convsRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/connections'),
        fetch('/api/conversations'),
      ]);

      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (connsRes.ok) setConnections(await connsRes.json());
      if (convsRes.ok) {
        const convsList = await convsRes.json();
        setConversations(convsList);
        // Default to the first conversation if none selected
        if (convsList.length > 0 && !activeConversationId) {
          setActiveConversationId(convsList[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  }, [activeConversationId]);

  // Fetch messages when active conversation changes
  const fetchMessages = useCallback(async () => {
    if (!activeConversationId) return;
    try {
      const res = await fetch(`/api/conversations/${activeConversationId}/messages`);
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  }, [activeConversationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to Firebase real-time status updates
  useEffect(() => {
    if (!activeConversationId) return;
    const unsubscribe = cacheService.subscribeToRunningState(activeConversationId, (state) => {
      setExecutingAgentId(state.status === 'executing' ? state.agentId : null);
    });
    return () => unsubscribe();
  }, [activeConversationId]);

  // Handle message submission
  const handleSendMessage = async (content: string) => {
    if (!activeConversationId) return;
    setIsExecuting(true);
    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeConversationId,
          content,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      } else {
        const data = await res.json();
        alert(`Execution error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsExecuting(false);
    }
  };

  // Handle branch message regeneration (Prompt Tuning)
  const handleRegenerate = async (
    messageId: string,
    updatedPrompt: string,
    provider: string,
    model: string
  ) => {
    if (!activeConversationId) return;
    setIsExecuting(true);
    try {
      const res = await fetch('/api/chat/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: messageId,
          system_prompt: updatedPrompt,
          model_provider: provider,
          model_name: model,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        // Refresh agents configs to sync new prompt state visually
        fetchData();
      } else {
        const data = await res.json();
        alert(`Regeneration error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsExecuting(false);
    }
  };

  // Create new conversation
  const handleNewConversation = async () => {
    const title = prompt('請輸入對話名稱：', `對話 ${conversations.length + 1}`);
    if (!title) return;

    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      if (res.ok) {
        const newConv = await res.json();
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(newConv.id);
        setMessages([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Open Add/Edit modal
  const handleOpenAgentModal = (agent: Agent | null) => {
    if (agent) {
      setEditingAgent(agent);
      setAgentForm({
        name: agent.name,
        description: agent.description || '',
        model_provider: agent.model_provider,
        model_name: agent.model_name,
        temperature: agent.temperature,
        system_prompt: agent.system_prompt,
      });
    } else {
      setEditingAgent(null);
      setAgentForm({
        name: '',
        description: '',
        model_provider: 'gemini',
        model_name: 'gemini-1.5-flash',
        temperature: 0.7,
        system_prompt: 'You are a helpful AI assistant.',
      });
    }
    setIsModalOpen(true);
  };

  // Save Agent configuration
  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...agentForm,
        id: editingAgent ? editingAgent.id : undefined,
        // Place new agents roughly in the center if no coordinates exist
        position_x: editingAgent ? editingAgent.position_x : 100 + Math.random() * 200,
        position_y: editingAgent ? editingAgent.position_y : 100 + Math.random() * 200,
      };

      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchData();
      } else {
        const errorData = await res.json();
        alert(`Failed to save agent: ${errorData.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* 1. Sidebar Panel */}
      <aside className="w-[280px] bg-slate-900/60 border-r border-slate-800 flex flex-col flex-shrink-0 z-20">
        {/* Workspace Title */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-2">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-lg">
            <Bot size={20} />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-widest text-indigo-300 m-0">ANTIGRAVITY</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest m-0 font-semibold">Agent Studio</p>
          </div>
        </div>

        {/* Action: New Conversation */}
        <div className="p-3">
          <button
            onClick={handleNewConversation}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 border border-indigo-500/20 text-xs font-semibold text-white shadow-lg shadow-indigo-600/10 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus size={14} /> 新建對話
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-500 px-3 mb-2 tracking-wider">歷史對話</div>
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveConversationId(conv.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left transition cursor-pointer ${
                activeConversationId === conv.id
                  ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <MessageSquare size={14} className="flex-shrink-0" />
              <span className="truncate">{conv.title}</span>
            </button>
          ))}
        </div>

        {/* Footer: User profile / settings */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/30 shadow-inner">
              <User size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-300 leading-none">開發人員</p>
              <span className="text-[10px] text-emerald-500 flex items-center gap-1 mt-1 font-semibold">
                ● 本地開發環境
              </span>
            </div>
          </div>
          <HelpCircle size={16} className="text-slate-500 hover:text-slate-300 transition cursor-pointer" />
        </div>
      </aside>

      {/* 2. Visual Flow Canvas Container */}
      <main className="flex-1 h-full flex flex-col min-w-0 bg-slate-950 relative">
        <Canvas
          agents={agents}
          connections={connections}
          executingAgentId={executingAgentId}
          onRefresh={fetchData}
          onEditAgent={handleOpenAgentModal}
        />
      </main>

      {/* 3. Right Chat Panel */}
      <section className="w-[420px] h-full flex-shrink-0">
        <ChatPanel
          conversationId={activeConversationId}
          messages={messages}
          onSendMessage={handleSendMessage}
          onRegenerate={handleRegenerate}
          isExecuting={isExecuting}
          executingAgentId={executingAgentId}
          agents={agents}
        />
      </section>

      {/* 4. Edit/Add Agent Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg glass-panel p-6 shadow-2xl relative border border-slate-800">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition cursor-pointer"
            >
              <X size={16} />
            </button>

            <h3 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Bot size={18} className="text-indigo-400" />
              {editingAgent ? '編輯 Agent 節點設定' : '建立新 Agent 節點'}
            </h3>

            <form onSubmit={handleSaveAgent} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {/* Agent Name */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-semibold">Agent 名稱</label>
                  <input
                    type="text"
                    required
                    value={agentForm.name}
                    onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                    placeholder="例如: 寫作助理"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Model Provider */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-semibold">模型供應商</label>
                  <select
                    value={agentForm.model_provider}
                    onChange={(e) => setAgentForm({ ...agentForm, model_provider: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="gemini">Gemini (Google)</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Model Name */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-semibold">模型名稱</label>
                  <input
                    type="text"
                    required
                    value={agentForm.model_name}
                    onChange={(e) => setAgentForm({ ...agentForm, model_name: e.target.value })}
                    placeholder="例如: gemini-1.5-flash"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Temperature */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-semibold">
                    溫度設定 ({agentForm.temperature})
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={agentForm.temperature}
                    onChange={(e) => setAgentForm({ ...agentForm, temperature: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 mt-2"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-semibold">功能描述</label>
                <input
                  type="text"
                  value={agentForm.description}
                  onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })}
                  placeholder="簡短描述此 Agent 的職掌或分工"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-semibold">系統提示詞 (System Prompt)</label>
                <textarea
                  required
                  rows={5}
                  value={agentForm.system_prompt}
                  onChange={(e) => setAgentForm({ ...agentForm, system_prompt: e.target.value })}
                  placeholder="定義此 Agent 的角色、工作規範與回覆指南..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-slate-200 focus:outline-none focus:border-indigo-500 resize-none font-mono text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg glow-btn text-white font-semibold cursor-pointer"
                >
                  儲存 Agent 設定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
