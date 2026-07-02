// src/App.tsx
import { useState, useEffect, useCallback } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { Plus, MessageSquare, Bot, X, HelpCircle, User, Settings2, Trash2 } from 'lucide-react';

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

  // Edit / Add Agent Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [agentForm, setAgentForm] = useState({
    name: '',
    description: '',
    model_provider: 'gemini',
    model_name: 'gemini-2.0-flash',
    temperature: 0.7,
    system_prompt: '你是個得力助手。',
    predecessor_id: '',
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
        alert(`執行錯誤: ${data.error}`);
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
        alert(`重新執行錯誤: ${data.error}`);
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
    // Find predecessor
    let predId = '';
    if (agent) {
      const conn = connections.find(c => c.target_agent_id === agent.id);
      if (conn) predId = conn.source_agent_id;
    }

    if (agent) {
      setEditingAgent(agent);
      setAgentForm({
        name: agent.name,
        description: agent.description || '',
        model_provider: agent.model_provider,
        model_name: agent.model_name,
        temperature: agent.temperature,
        system_prompt: agent.system_prompt,
        predecessor_id: predId,
      });
    } else {
      setEditingAgent(null);
      setAgentForm({
        name: '',
        description: '',
        model_provider: 'gemini',
        model_name: 'gemini-2.0-flash',
        temperature: 0.7,
        system_prompt: '你是個得力助手。',
        predecessor_id: '',
      });
    }
    setIsModalOpen(true);
  };

  // Handler when provider changes in modal
  const handleProviderChange = (provider: string) => {
    let defaultModel = 'gemini-2.0-flash';
    if (provider === 'openrouter') defaultModel = 'google/gemma-2-9b-it:free';
    else if (provider === 'openai') defaultModel = 'gpt-4o-mini';
    else if (provider === 'anthropic') defaultModel = 'claude-3-5-sonnet-latest';

    setAgentForm(prev => ({
      ...prev,
      model_provider: provider,
      model_name: defaultModel
    }));
  };

  // Save Agent configuration and handle Connection changes
  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const agentId = editingAgent ? editingAgent.id : 'agent-' + Math.random().toString(36).substr(2, 9);
      
      const payload = {
        id: agentId,
        name: agentForm.name,
        description: agentForm.description,
        model_provider: agentForm.model_provider,
        model_name: agentForm.model_name,
        temperature: agentForm.temperature,
        system_prompt: agentForm.system_prompt,
        position_x: editingAgent ? editingAgent.position_x : 0,
        position_y: editingAgent ? editingAgent.position_y : 0,
      };

      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(`儲存 AI 員工失敗: ${errorData.error}`);
        return;
      }

      // Handle Connection Update
      const oldConn = connections.find(c => c.target_agent_id === agentId);
      const newPredId = agentForm.predecessor_id;
      const oldPredId = oldConn ? oldConn.source_agent_id : '';

      if (newPredId !== oldPredId) {
        // Delete old connection
        if (oldConn) {
          await fetch(`/api/connections/${oldConn.id}`, { method: 'DELETE' });
        }

        // Create new connection if newPredId is set
        if (newPredId) {
          const connId = `e-${newPredId}-${agentId}`;
          await fetch('/api/connections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: connId,
              source_agent_id: newPredId,
              target_agent_id: agentId,
            }),
          });
        }
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Agent
  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm('您確定要刪除此 AI 員工嗎？所有與其相關的連線也將被一併移除。')) return;
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      if (res.ok) {
        setIsModalOpen(false);
        fetchData();
      } else {
        const data = await res.json();
        alert(`刪除 AI 員工失敗：${data.error}`);
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

        {/* AI Employees Section */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1 mt-4 border-t border-slate-800/60 pt-4">
          <div className="flex items-center justify-between px-3 mb-2">
            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">AI 員工與工作流</div>
            <button
              onClick={() => handleOpenAgentModal(null)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-0.5 cursor-pointer"
              title="新增 AI 員工"
            >
              <Plus size={12} /> 新增
            </button>
          </div>
          <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
            {agents.map((agent) => {
              const predConn = connections.find(c => c.target_agent_id === agent.id);
              const predAgent = predConn ? agents.find(a => a.id === predConn.source_agent_id) : null;
              
              return (
                <div
                  key={agent.id}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent transition group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/20"></div>
                    <div className="truncate text-left">
                      <p className="font-semibold text-slate-200 truncate m-0 leading-tight">{agent.name}</p>
                      <span className="text-[9px] text-slate-500 font-mono truncate block mt-0.5">
                        {predAgent ? `來源: ${predAgent.name}` : '入口員工'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenAgentModal(agent)}
                    className="p-1 rounded text-slate-500 hover:text-indigo-400 hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    title="編輯員工設定"
                  >
                    <Settings2 size={12} />
                  </button>
                </div>
              );
            })}
            {agents.length === 0 && (
              <div className="text-[10px] text-slate-600 px-3 py-2 italic">尚無 AI 員工設定</div>
            )}
          </div>
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

      {/* Main Content Area (Spacious Chat Workstation) */}
      <main className="flex-1 h-full flex flex-col min-w-0 bg-slate-950">
        <ChatPanel
          conversationId={activeConversationId}
          messages={messages}
          onSendMessage={handleSendMessage}
          onRegenerate={handleRegenerate}
          isExecuting={isExecuting}
          agents={agents}
          connections={connections}
        />
      </main>

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
                    onChange={(e) => handleProviderChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="gemini">Gemini (Google)</option>
                    <option value="openrouter">OpenRouter (免費開源模型)</option>
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
                    placeholder="例如: gemini-2.0-flash"
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

              {/* Upstream Predecessor Dropdown */}
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-semibold">上游輸入員工 (資料來源)</label>
                <select
                  value={agentForm.predecessor_id}
                  onChange={(e) => setAgentForm({ ...agentForm, predecessor_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">無 (做為入口員工，直接接收使用者輸入)</option>
                  {agents
                    .filter(a => !editingAgent || a.id !== editingAgent.id) // exclude current
                    .map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))
                  }
                </select>
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
              <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                <div>
                  {editingAgent && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAgent(editingAgent.id)}
                      className="px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Trash2 size={14} /> 刪除員工
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
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
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
