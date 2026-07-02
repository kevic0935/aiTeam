// src/components/Canvas.tsx
import React, { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react';
import type { Connection, Edge, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AgentNode } from './AgentNode';
import { Plus } from 'lucide-react';

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

interface CanvasProps {
  agents: Agent[];
  connections: Array<{ id: string; source_agent_id: string; target_agent_id: string }>;
  executingAgentId: string | null;
  onRefresh: () => void;
  onEditAgent: (agent: Agent | null) => void;
}

const nodeTypes = {
  agent: AgentNode,
};

export const Canvas: React.FC<CanvasProps> = ({
  agents,
  connections,
  executingAgentId,
  onRefresh,
  onEditAgent,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Convert Agent and Connection arrays to React Flow structures
  useEffect(() => {
    const flowNodes: Node[] = agents.map((agent) => ({
      id: agent.id,
      type: 'agent',
      position: { x: agent.position_x, y: agent.position_y },
      data: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        model_provider: agent.model_provider,
        model_name: agent.model_name,
        temperature: agent.temperature,
        system_prompt: agent.system_prompt,
        isExecuting: executingAgentId === agent.id,
        onEdit: () => onEditAgent(agent),
        onDelete: handleDeleteAgent,
      },
    }));

    const flowEdges: Edge[] = connections.map((conn) => ({
      id: conn.id,
      source: conn.source_agent_id,
      target: conn.target_agent_id,
      animated: executingAgentId === conn.source_agent_id, // animate when active
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [agents, connections, executingAgentId, onEditAgent]);

  // Handle agent delete
  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm('您確定要刪除此 Agent 嗎？所有與其相關的連線也將被一併移除。')) return;
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      if (res.ok) {
        onRefresh();
      } else {
        const data = await res.json();
        alert(`刪除 Agent 失敗：${data.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const onNodeDragStop = useCallback(
    async (_event: any, node: any) => {
      const agent = agents.find((a) => a.id === node.id);
      if (!agent) return;

      try {
        await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...agent,
            position_x: node.position.x,
            position_y: node.position.y,
          }),
        });
        // Refresh local data to match coordinates
        onRefresh();
      } catch (err) {
        console.error('更新節點位置失敗：', err);
      }
    },
    [agents, onRefresh]
  );

  // Handle new connection creation
  const onConnect = useCallback(
    async (params: Connection) => {
      if (!params.source || !params.target) return;
      
      const newEdge: Edge = {
        id: `e-${params.source}-${params.target}`,
        source: params.source,
        target: params.target,
      };

      try {
        const res = await fetch('/api/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: newEdge.id,
            source_agent_id: params.source,
            target_agent_id: params.target,
          }),
        });

        if (res.ok) {
          setEdges((eds) => addEdge(newEdge, eds));
          onRefresh();
        } else {
          const data = await res.json();
          alert(`連結 Agent 失敗：${data.error}`);
        }
      } catch (err) {
        console.error(err);
      }
    },
    [setEdges, onRefresh]
  );

  // Handle connection deletion
  const onEdgesDelete = useCallback(
    async (edgesToDelete: Edge[]) => {
      for (const edge of edgesToDelete) {
        try {
          await fetch(`/api/connections/${edge.id}`, { method: 'DELETE' });
        } catch (err) {
          console.error(`刪除連線失敗 ${edge.id}:`, err);
        }
      }
      onRefresh();
    },
    [onRefresh]
  );

  return (
    <div className="relative w-full h-full flex-grow">
      {/* Canvas Actions */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button
          onClick={() => onEditAgent(null)}
          className="glow-btn flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white cursor-pointer shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] transition-all"
        >
          <Plus size={14} /> 新增 Agent 節點
        </button>
      </div>

      {/* React Flow Workspace */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onEdgesDelete={onEdgesDelete}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#1e293b" gap={16} />
        <Controls style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }} />
        <MiniMap 
          style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
          nodeColor={() => '#1f2937'}
          maskColor="rgba(0,0,0,0.4)"
        />
      </ReactFlow>
    </div>
  );
};
