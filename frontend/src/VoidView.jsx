import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, { 
  Background, 
  applyNodeChanges, 
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import ThoughtNode from './ThoughtNode';
import GroupNode from './GroupNode';

const API_BASE_URL = '/api';

const nodeTypes = {
  thought: ThoughtNode,
  group: GroupNode
};

const innerNodeStyle = { 
  background: '#fff', 
  color: '#333', 
  borderRadius: '20px', 
  padding: '10px 20px',
  border: '1px solid #ddd',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  minWidth: '100px',
  textAlign: 'center',
  display: 'inline-block',
  transition: 'all 0.3s ease'
};

const deleteNodeStyle = {
  ...innerNodeStyle,
  background: '#fee2e2',
  border: '2px solid #ef4444',
  color: '#991b1b'
};

const VoidContent = () => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const { fitView } = useReactFlow();
  
  const [editingNode, setEditingNode] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editIsLocked, setEditIsLocked] = useState(false);
  const [edgeToDelete, setEdgeToDelete] = useState(null);

  const linkingTimer = useRef(null);
  const [linkingState, setLinkingState] = useState({ 
    sourceId: null, 
    targetId: null, 
    isPending: false
  });

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const onToggleNeedsAction = useCallback((id, newValue) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id === id) {
        return { ...n, data: { ...n.data, needs_action: newValue } };
      }
      return n;
    }));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [thoughtsRes, linksRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/thoughts/`),
        axios.get(`${API_BASE_URL}/links/`)
      ]);

      const fetchedNodes = thoughtsRes.data.map((thought) => {
        const isGroup = thought.is_group;
        return {
          id: thought.id.toString(),
          type: isGroup ? 'group' : 'thought',
          data: { 
            title: thought.title,
            content: thought.content,
            needs_action: thought.needs_action,
            isDeleteMode: isDeleteMode,
            onToggleNeedsAction: onToggleNeedsAction,
            is_group: isGroup,
            is_locked: thought.is_locked
          },
          position: { x: thought.x_pos, y: thought.y_pos },
          draggable: !thought.is_locked,
          style: isGroup ? { 
            width: thought.width || 300, 
            height: thought.height || 200, 
            zIndex: -1 
          } : { zIndex: 1 },
          raw: thought
        };
      });

      const fetchedEdges = linksRes.data.map((link) => ({
        id: `e${link.id}`,
        source: link.source_id.toString(),
        target: link.target_id.toString(),
        style: { 
          stroke: isDeleteMode ? '#ef4444' : '#64748b',
          strokeWidth: 6,
          cursor: 'pointer'
        }
      }));

      setNodes(fetchedNodes);
      setEdges(fetchedEdges);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, [isDeleteMode, onToggleNeedsAction]);

  const onNodeDrag = useCallback((event, node) => {
    if (node.type !== 'thought') return;

    const targetThought = nodes.find((n) => {
      if (n.id === node.id || n.type !== 'thought') return false;
      const dx = n.position.x - node.position.x;
      const dy = n.position.y - node.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < 80;
    });

    if (targetThought) {
      if (linkingState.targetId !== targetThought.id) {
        if (linkingTimer.current) clearTimeout(linkingTimer.current);
        setLinkingState({ sourceId: node.id, targetId: targetThought.id, isPending: false });
        
        linkingTimer.current = setTimeout(() => {
          setLinkingState(prev => ({ ...prev, isPending: true }));
        }, 400); 
      }
    } else {
      if (linkingTimer.current) {
        clearTimeout(linkingTimer.current);
        linkingTimer.current = null;
      }
      if (linkingState.sourceId || linkingState.targetId) {
        setLinkingState({ sourceId: null, targetId: null, isPending: false });
      }
    }
  }, [nodes, linkingState]);

  const onNodeResizeStop = useCallback(async (event, { id, width, height }) => {
    try {
      await axios.put(`${API_BASE_URL}/thoughts/${parseInt(id)}`, {
        width,
        height
      });
      setNodes((nds) => nds.map((n) => n.id === id ? { ...n, style: { ...n.style, width, height } } : n));
    } catch (error) {
      console.error('Error saving group dimensions:', error);
    }
  }, []);

  const onNodeDragStop = useCallback(async (event, node) => {
    try {
      await axios.put(`${API_BASE_URL}/thoughts/${node.id}`, {
        x_pos: node.position.x,
        y_pos: node.position.y
      });
      
      setNodes((nds) => nds.map((n) => n.id === node.id ? { ...n, position: node.position } : n));

      if (linkingState.isPending && linkingState.targetId) {
        const existingLink = edges.find(e => 
          (e.source === linkingState.sourceId && e.target === linkingState.targetId) ||
          (e.source === linkingState.targetId && e.target === linkingState.sourceId)
        );

        if (existingLink) {
          setEdgeToDelete(existingLink);
        } else {
          await axios.post(`${API_BASE_URL}/links/`, {
            source_id: parseInt(linkingState.sourceId),
            target_id: parseInt(linkingState.targetId)
          });
          fetchData();
        }
      }
      
      if (linkingTimer.current) clearTimeout(linkingTimer.current);
      setLinkingState({ sourceId: null, targetId: null, isPending: false });
    } catch (error) {
      console.error('Error saving node position or creating/deleting link:', error);
    }
  }, [linkingState, edges, fetchData]);

  const onConnect = useCallback(async (params) => {
    if (isDeleteMode) return;
    const linkExists = edges.some(e => 
      (e.source === params.source && e.target === params.target) ||
      (e.source === params.target && e.target === params.source)
    );
    if (linkExists) return;

    try {
      await axios.post(`${API_BASE_URL}/links/`, {
        source_id: parseInt(params.source),
        target_id: parseInt(params.target)
      });
      fetchData();
    } catch (error) {
      console.error('Error saving link:', error);
    }
  }, [isDeleteMode, edges, fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const displayNodes = nodes.map(n => {
    const isBeingLinked = linkingState.isPending && (linkingState.sourceId === n.id || linkingState.targetId === n.id);
    if (isBeingLinked) {
      const glowStyle = {
        boxShadow: '0 0 20px 5px rgba(59, 130, 246, 0.6)',
        border: '2px solid #3b82f6',
        transform: 'scale(1.1)'
      };
      return {
        ...n,
        data: { 
          ...n.data, 
          isDeleteMode: isDeleteMode,
          isBeingLinked: true
        },
        style: { ...n.style, zIndex: 1000 }
      };
    }
    return n;
  });

  const handleAddBox = async () => {
    try {
      await axios.post(`${API_BASE_URL}/thoughts/`, {
        content: '',
        title: 'Box',
        x_pos: 100,
        y_pos: 100,
        is_group: true
      });
      fetchData();
    } catch (error) {
      console.error('Error creating group box:', error);
    }
  };

  const handleSend = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim() || isDeleteMode) return;
    const randomX = Math.random() * 400 + 200;
    const randomY = Math.random() * 400 + 100;
    try {
      await axios.post(`${API_BASE_URL}/thoughts/`, {
        content: text,
        x_pos: randomX,
        y_pos: randomY,
      });
      fetchData();
      setInputText('');
    } catch (error) {
      console.error('Error creating thought:', error);
    }
  };

  const onNodeClick = async (event, node) => {
    if (isDeleteMode) {
      try {
        await axios.delete(`${API_BASE_URL}/thoughts/${node.id}`);
        fetchData();
      } catch (error) {
        console.error('Error deleting thought:', error);
      }
    } else {
      setEditingNode(node);
      setEditTitle(node.data.title || '');
      setEditContent(node.data.content || '');
      setEditIsLocked(node.data.is_locked || false);
    }
  };

  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    setEdgeToDelete(edge);
  }, []);

  const handleDeleteEdge = async () => {
    if (!edgeToDelete) return;
    try {
      const linkId = edgeToDelete.id.replace('e', '');
      await axios.delete(`${API_BASE_URL}/links/${linkId}`);
      setEdgeToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting link:', error);
      setEdgeToDelete(null);
    }
  };

  const handleUpdateNode = async () => {
    try {
      await axios.put(`${API_BASE_URL}/thoughts/${editingNode.id}`, {
        title: editTitle,
        content: editContent,
        is_locked: editIsLocked
      });
      setEditingNode(null);
      fetchData();
    } catch (error) {
      console.error('Error updating thought:', error);
    }
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert('Not supported');
    const recognition = new SpeechRecognition();
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInputText(transcript);
      handleSend(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  return (
    <div className={`w-full h-full transition-colors duration-700 ${isDeleteMode ? 'bg-red-950/40' : ''} void-bg relative`}>
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeResizeStop={onNodeResizeStop}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeContextMenu={onEdgeContextMenu}
        fitView
      >
        <Background color={isDeleteMode ? "#7f1d1d" : "#334155"} gap={20} />
      </ReactFlow>

      <div className="absolute top-6 right-6 flex flex-col gap-3">
        <button 
          onClick={handleAddBox}
          className="bg-slate-800/80 backdrop-blur-md p-3 rounded-full text-white border border-slate-700 hover:text-blue-400 transition-all shadow-xl"
          title="Add Group Box"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
          </svg>
        </button>

        <button 
          onClick={() => fitView({ duration: 800 })}
          className="bg-slate-800/80 backdrop-blur-md p-3 rounded-full text-white border border-slate-700 hover:bg-slate-700 transition-all shadow-xl"
          title="Reset View"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>
        
        <button 
          onClick={() => setIsDeleteMode(!isDeleteMode)}
          className={`p-3 rounded-full transition-all shadow-xl border backdrop-blur-md ${
            isDeleteMode 
            ? 'bg-red-600 border-red-400 text-white animate-pulse' 
            : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-red-400'
          }`}
          title={isDeleteMode ? "Exit Delete Mode" : "Enter Delete Mode"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {!isDeleteMode && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-lg px-4 z-50">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className={`bg-slate-800/80 backdrop-blur-md rounded-full shadow-2xl border ${isListening ? 'border-red-500 ring-2 ring-red-500/20' : 'border-slate-700'} flex items-center p-2 transition-all duration-300`}
          >
            <input
              type="text"
              className="flex-grow bg-transparent text-white px-4 py-2 outline-none placeholder-slate-400"
              placeholder={isListening ? "Listening..." : "What's on your mind?"}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button 
              type="submit"
              className={`p-2 transition-colors ${inputText.trim() ? 'text-blue-500 hover:text-blue-400' : 'text-slate-500 cursor-not-allowed'}`}
              disabled={!inputText.trim()}
              title="Send"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
            <button type="button" onClick={startListening} className={`p-2 ${isListening ? 'text-red-500 animate-pulse' : 'text-slate-400 hover:text-white'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {editingNode && !isDeleteMode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Edit {editingNode.type === 'group' ? 'Box' : 'Thought'}</h2>
              {editingNode.type === 'group' && (
                <button 
                  onClick={() => setEditIsLocked(!editIsLocked)}
                  className={`p-2 rounded-lg transition-colors ${editIsLocked ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                  title={editIsLocked ? "Unlock movement" : "Lock movement"}
                >
                  {editIsLocked ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-400 text-sm mb-1">Title</label>
                <input 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Optional title"
                />
              </div>
              {editingNode.type !== 'group' && (
                <div>
                  <label className="block text-slate-400 text-sm mb-1">Content</label>
                  <textarea 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 min-h-[100px]"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingNode(null)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
              <button onClick={handleUpdateNode} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {edgeToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2">Delete Link?</h2>
            <p className="text-slate-400 mb-6">Are you sure you want to remove the connection between these thoughts?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setEdgeToDelete(null)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
              <button onClick={handleDeleteEdge} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const VoidView = () => (
  <ReactFlowProvider>
    <VoidContent />
  </ReactFlowProvider>
);

export default VoidView;
