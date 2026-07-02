// src/components/AgentNode.tsx
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Cpu, Settings2, Trash2 } from 'lucide-react';

interface AgentNodeProps {
  data: {
    id: string;
    name: string;
    description?: string;
    model_provider: string;
    model_name: string;
    temperature: number;
    system_prompt: string;
    isExecuting?: boolean;
    onEdit?: (agentId: string) => void;
    onDelete?: (agentId: string) => void;
  };
}

export const AgentNode: React.FC<AgentNodeProps> = ({ data }) => {
  const getProviderColor = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'gemini': return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      case 'openai': return 'text-sky-400 border-sky-500/30 bg-sky-500/10';
      case 'anthropic': return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      default: return 'text-slate-400 border-slate-500/30 bg-slate-500/10';
    }
  };

  return (
    <div 
      className={`glass-panel p-4 min-w-[240px] max-w-[280px] border-2 transition-all duration-300 ${
        data.isExecuting 
          ? 'executing-node border-indigo-500 shadow-lg shadow-indigo-500/20' 
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Handles */}
      <Handle 
        type="target" 
        position={Position.Top} 
        style={{ background: '#6366f1' }}
      />
      
      {/* Node Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
            <Cpu size={16} />
          </div>
          <div>
            <h4 className="font-semibold text-slate-100 text-sm tracking-wide m-0">{data.name}</h4>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border mt-0.5 inline-block ${getProviderColor(data.model_provider)}`}>
              {data.model_provider.toUpperCase()}
            </span>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1">
          {data.onEdit && (
            <button 
              onClick={(e) => { e.stopPropagation(); data.onEdit!(data.id); }}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              title="編輯 Agent 設定"
            >
              <Settings2 size={14} />
            </button>
          )}
          {data.onDelete && (
            <button 
              onClick={(e) => { e.stopPropagation(); data.onDelete!(data.id); }}
              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
              title="刪除 Agent"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      
      {/* Description */}
      {data.description && (
        <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 mb-2 leading-relaxed border-t border-slate-800 pt-2">
          {data.description}
        </p>
      )}

      {/* Info footer */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 border-t border-slate-800 pt-2">
        <span>模型：<b className="text-slate-400">{data.model_name}</b></span>
        <span>溫度：<b className="text-slate-400">{data.temperature}</b></span>
      </div>

      <Handle 
        type="source" 
        position={Position.Bottom} 
        style={{ background: '#6366f1' }}
      />
    </div>
  );
};
