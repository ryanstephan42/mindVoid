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
import ShapeNode from './ShapeNode';

const API_BASE_URL = '/api';

const nodeTypes = {
  thought: ThoughtNode,
  shape: ShapeNode
};

const VoidContent = () => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [activeTool, setActiveTool] = useState('thought'); // 'thought', 'rectangle', 'circle', 'triangle', 'line', 'arrow', 'text', 'freehand', 'eraser'
  const { fitView, project, screenToFlowPosition } = useReactFlow();
  
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

  const [clipboardNode, setClipboardNode] = useState(null);
  const [drawingStart, setDrawingStart] = useState(null);
  const [currentDrawingNode, setCurrentDrawingNode] = useState(null);
  const [isDrawExpanded, setIsDrawExpanded] = useState(false);

  const isDrawingMode = activeTool !== 'thought';

  useEffect(() => {
    if (isDrawingMode) {
      setIsDrawExpanded(true);
    }
  }, [isDrawingMode]);

  const onNodesChange = useCallback(
    (changes) => {
      // If we're not in drawing mode, we should prevent changing shape nodes
      const filteredChanges = changes.filter(change => {
        if (change.type === 'position' || change.type === 'dimensions') {
          const node = nodes.find(n => n.id === change.id);
          if (node && node.type === 'shape' && !isDrawingMode) return false;
        }
        return true;
      });
      setNodes((nds) => applyNodeChanges(filteredChanges, nds));
    },
    [nodes, isDrawingMode]
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
      const [thoughtsRes, linksRes, drawingsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/thoughts/`),
        axios.get(`${API_BASE_URL}/links/`),
        axios.get(`${API_BASE_URL}/drawings/`)
      ]);

      const fetchedThoughts = thoughtsRes.data.map((thought) => ({
        id: `thought-${thought.id}`,
        type: 'thought',
        data: { 
          title: thought.title,
          content: thought.content,
          needs_action: thought.needs_action,
          isDeleteMode: isDeleteMode,
          onToggleNeedsAction: onToggleNeedsAction,
          is_locked: thought.is_locked,
          isDrawingMode: isDrawingMode
        },
        position: { x: thought.x_pos, y: thought.y_pos },
        draggable: !isDrawingMode && !thought.is_locked,
        zIndex: 1,
        raw: thought
      }));

      const fetchedDrawings = drawingsRes.data.map((drawing) => ({
        id: `drawing-${drawing.id}`,
        type: 'shape',
        data: { 
          type: drawing.type,
          width: drawing.width,
          height: drawing.height,
          color: drawing.color,
          stroke_width: drawing.stroke_width,
          text: drawing.text,
          points: drawing.points ? JSON.parse(drawing.points) : [],
          isDrawingMode: isDrawingMode,
          onTextChange: (id, newText) => handleUpdateShapeText(id, newText),
          onResizeStop: handleNodeResizeStop
        },
        position: { x: drawing.x, y: drawing.y },
        draggable: isDrawingMode && activeTool === 'thought', // Only draggable if we are NOT in a specific drawing tool
        selectable: isDrawingMode,
        style: { width: drawing.width, height: drawing.height },
        zIndex: -1,
        raw: drawing
      }));

      const fetchedEdges = linksRes.data.map((link) => ({
        id: `e${link.id}`,
        source: `thought-${link.source_id}`,
        target: `thought-${link.target_id}`,
        style: { 
          stroke: isDeleteMode ? '#ef4444' : '#64748b',
          strokeWidth: 6,
          cursor: 'pointer'
        }
      }));

      setNodes([...fetchedThoughts, ...fetchedDrawings]);
      setEdges(fetchedEdges);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, [isDeleteMode, isDrawingMode, onToggleNeedsAction]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpdateShapeText = async (id, newText) => {
    try {
      const drawingId = id.split('-')[1];
      await axios.put(`${API_BASE_URL}/drawings/${drawingId}`, {
        text: newText
      });
      fetchData();
    } catch (error) {
      console.error('Error updating drawing text:', error);
    }
  };

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

  const onNodeDragStop = useCallback(async (event, node) => {
    try {
      const id = node.id.split('-')[1];
      if (node.type === 'thought') {
        await axios.put(`${API_BASE_URL}/thoughts/${id}`, {
          x_pos: node.position.x,
          y_pos: node.position.y
        });
      } else if (node.type === 'shape') {
        await axios.put(`${API_BASE_URL}/drawings/${id}`, {
          x: node.position.x,
          y: node.position.y
        });
      }
      
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
            source_id: parseInt(linkingState.sourceId.split('-')[1]),
            target_id: parseInt(linkingState.targetId.split('-')[1])
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

  const handleNodeResizeStop = useCallback(async (event, { id, width, height }) => {
    try {
      const drawingId = id.split('-')[1];
      await axios.put(`${API_BASE_URL}/drawings/${drawingId}`, {
        width,
        height
      });
      setNodes((nds) => nds.map((n) => n.id === id ? { ...n, style: { ...n.style, width, height } } : n));
    } catch (error) {
      console.error('Error saving drawing dimensions:', error);
    }
  }, []);

  const onConnect = useCallback(async (params) => {
    if (isDeleteMode || isDrawingMode) return;
    const linkExists = edges.some(e => 
      (e.source === params.source && e.target === params.target) ||
      (e.source === params.target && e.source === params.source)
    );
    if (linkExists) return;

    try {
      await axios.post(`${API_BASE_URL}/links/`, {
        source_id: parseInt(params.source.split('-')[1]),
        target_id: parseInt(params.target.split('-')[1])
      });
      fetchData();
    } catch (error) {
      console.error('Error saving link:', error);
    }
  }, [isDeleteMode, isDrawingMode, edges, fetchData]);

  const onPaneMouseDown = useCallback((event) => {
    if (!isDrawingMode || activeTool === 'eraser') return;
    
    // In drawing mode, only left click (0) or touch starts drawing
    if (event.button !== undefined && event.button !== 0) return;
    
    // Check if we are in thought mode - if so, don't start drawing 
    if (activeTool === 'thought') return;

    // Prevent default behavior to stop panning/selection
    if (event.preventDefault) event.preventDefault();

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setDrawingStart(position);

    const commonPreviewData = { 
      type: activeTool, 
      color: '#ffffff', // Use white for preview
      isDrawingMode: false 
    };

    if (activeTool === 'freehand') {
      setCurrentDrawingNode({
        type: 'shape',
        data: { ...commonPreviewData, points: [{ x: 0, y: 0 }] },
        position: position,
        zIndex: 1000,
        style: { width: 1, height: 1, pointerEvents: 'none' }
      });
    } else {
      setCurrentDrawingNode({
        type: 'shape',
        data: commonPreviewData,
        position: position,
        zIndex: 1000,
        style: { width: 1, height: 1, pointerEvents: 'none' }
      });
    }
  }, [isDrawingMode, activeTool, screenToFlowPosition]);

  const onPaneMouseMove = useCallback((event) => {
    if (!drawingStart || !currentDrawingNode || activeTool === 'eraser') return;

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

    if (activeTool === 'freehand') {
      setCurrentDrawingNode(prev => {
        if (!prev) return null;
        const newPoint = { x: position.x - prev.position.x, y: position.y - prev.position.y };
        return {
          ...prev,
          data: { ...prev.data, points: [...prev.data.points, newPoint] },
          style: { width: 1, height: 1, pointerEvents: 'none' }
        };
      });
    } else {
      const width = position.x - drawingStart.x;
      const height = position.y - drawingStart.y;
      
      const x = width < 0 ? position.x : drawingStart.x;
      const y = height < 0 ? position.y : drawingStart.y;
      const absWidth = Math.max(2, Math.abs(width));
      const absHeight = Math.max(2, Math.abs(height));

      setCurrentDrawingNode({
        type: 'shape',
        data: { ...currentDrawingNode.data },
        position: { x, y },
        style: { width: absWidth, height: absHeight, pointerEvents: 'none' },
        zIndex: 1000
      });
    }
  }, [drawingStart, currentDrawingNode, activeTool, screenToFlowPosition]);

  const onPaneMouseUp = useCallback(async () => {
    if (!drawingStart || !currentDrawingNode) {
      setDrawingStart(null);
      setCurrentDrawingNode(null);
      return;
    }

    try {
      let finalX = currentDrawingNode.position.x;
      let finalY = currentDrawingNode.position.y;
      let finalWidth = currentDrawingNode.style?.width || 100;
      let finalHeight = currentDrawingNode.style?.height || 100;
      let finalPoints = null;

      if (activeTool === 'freehand' && currentDrawingNode.data.points) {
        const pts = currentDrawingNode.data.points;
        if (pts.length > 1) {
          // Calculate bounding box for the freehand drawing
          const minX = Math.min(...pts.map(p => p.x));
          const minY = Math.min(...pts.map(p => p.y));
          const maxX = Math.max(...pts.map(p => p.x));
          const maxY = Math.max(...pts.map(p => p.y));
          
          finalWidth = Math.max(20, maxX - minX);
          finalHeight = Math.max(20, maxY - minY);
          
          // Adjust points to be relative to the new bounding box top-left
          finalPoints = JSON.stringify(pts.map(p => ({
            x: p.x - minX,
            y: p.y - minY
          })));
          
          finalX += minX;
          finalY += minY;
        } else {
          // Don't save if it's just a dot
          setDrawingStart(null);
          setCurrentDrawingNode(null);
          return;
        }
      }

      const payload = {
        type: activeTool,
        x: finalX,
        y: finalY,
        width: finalWidth,
        height: finalHeight,
        points: finalPoints,
        text: activeTool === 'text' ? 'Double click to edit' : null,
        color: '#64748b'
      };

      await axios.post(`${API_BASE_URL}/drawings/`, payload);
      fetchData();
    } catch (error) {
      console.error('Error creating drawing:', error);
    }

    setDrawingStart(null);
    setCurrentDrawingNode(null);
  }, [drawingStart, currentDrawingNode, activeTool, fetchData]);

  const onNodeClick = async (event, node) => {
    if (activeTool === 'eraser' || isDeleteMode) {
      try {
        const id = node.id.split('-')[1];
        if (node.type === 'thought') {
          await axios.delete(`${API_BASE_URL}/thoughts/${id}`);
        } else if (node.type === 'shape') {
          await axios.delete(`${API_BASE_URL}/drawings/${id}`);
        }
        fetchData();
      } catch (error) {
        console.error('Error deleting node:', error);
      }
    } else if (node.type === 'thought') {
      setEditingNode(node);
      setEditTitle(node.data.title || '');
      setEditContent(node.data.content || '');
      setEditIsLocked(node.data.is_locked || false);
    }
  };

  const handleSend = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim() || isDeleteMode || isDrawingMode) return;
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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selectedNodes = nodes.filter(n => n.selected);
        if (selectedNodes.length > 0) {
          setClipboardNode(selectedNodes[0]);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboardNode) {
          pasteNode(clipboardNode);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, clipboardNode]);

  const pasteNode = async (node) => {
    try {
      const id = node.id.split('-')[1];
      if (node.type === 'thought') {
        await axios.post(`${API_BASE_URL}/thoughts/`, {
          ...node.raw,
          x_pos: node.position.x + 50,
          y_pos: node.position.y + 50
        });
      } else if (node.type === 'shape') {
        await axios.post(`${API_BASE_URL}/drawings/`, {
          ...node.raw,
          x: node.position.x + 50,
          y: node.position.y + 50
        });
      }
      fetchData();
    } catch (error) {
      console.error('Error pasting node:', error);
    }
  };

  const displayNodes = [...nodes];
  if (currentDrawingNode) {
    displayNodes.push({ ...currentDrawingNode, id: 'temp-drawing' });
  }

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
    <div 
      className={`w-full h-full transition-colors duration-700 ${isDeleteMode ? 'bg-red-950/40' : ''} ${isDrawingMode ? 'drawing-active' : ''} ${activeTool === 'eraser' ? 'eraser-active' : ''} ${isDeleteMode ? 'delete-active' : ''} void-bg relative`}
      onMouseDown={(e) => {
        if (!isDrawingMode) return;
        // Check if the click is on the pane (the empty space)
        if (e.target.classList.contains('react-flow__pane')) {
          onPaneMouseDown(e);
        }
      }}
      onMouseMove={(e) => {
        if (!isDrawingMode) return;
        onPaneMouseMove(e);
      }}
      onMouseUp={(e) => {
        if (!isDrawingMode) return;
        onPaneMouseUp(e);
      }}
    >
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        panOnDrag={!isDrawingMode}
        nodesDraggable={!isDrawingMode}
        selectionOnDrag={false}
        panOnScroll={true}
        zoomOnPinch={true}
        fitView
      >
        <Background color={isDeleteMode ? "#7f1d1d" : "#334155"} gap={20} />
      </ReactFlow>

      {/* Drawing Toolbar */}
      <div className="absolute top-6 right-6 flex flex-col gap-3">
        <div className="bg-slate-800/80 backdrop-blur-md p-1.5 rounded-2xl border border-slate-700 flex flex-col gap-1 shadow-2xl overflow-hidden">
          <ToolButton active={activeTool === 'thought'} onClick={() => { setActiveTool('thought'); setIsDrawExpanded(false); }} icon="🧠" title="Thought Mode" />
          <div className="h-px bg-slate-700 mx-2 my-1" />
          
          <button 
            onClick={() => {
              const newExpanded = !isDrawExpanded;
              setIsDrawExpanded(newExpanded);
              if (newExpanded && activeTool === 'thought') {
                setActiveTool('rectangle');
              }
            }}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
              isDrawingMode ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
            title="Toggle Drawing Tools"
          >
            <span className="text-lg">{isDrawExpanded ? '▼' : '✎'}</span>
          </button>

          {isDrawExpanded && (
            <div className="flex flex-col gap-1 pt-1 border-t border-slate-700/50 transition-all duration-300">
              <ToolButton active={activeTool === 'rectangle'} onClick={() => setActiveTool('rectangle')} icon="▭" title="Rectangle" />
              <ToolButton active={activeTool === 'circle'} onClick={() => setActiveTool('circle')} icon="○" title="Circle" />
              <ToolButton active={activeTool === 'triangle'} onClick={() => setActiveTool('triangle')} icon="△" title="Triangle" />
              <ToolButton active={activeTool === 'line'} onClick={() => setActiveTool('line')} icon="╱" title="Line" />
              <ToolButton active={activeTool === 'arrow'} onClick={() => setActiveTool('arrow')} icon="↗" title="Arrow" />
              <ToolButton active={activeTool === 'text'} onClick={() => setActiveTool('text')} icon="T" title="Text Input" />
              <ToolButton active={activeTool === 'freehand'} onClick={() => setActiveTool('freehand')} icon="✎" title="Freehand" />
              <ToolButton active={activeTool === 'eraser'} onClick={() => setActiveTool('eraser')} icon="⌫" title="Eraser Tool" />
            </div>
          )}
        </div>

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

      {!isDeleteMode && !isDrawingMode && (
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
              <h2 className="text-xl font-bold text-white">Edit Thought</h2>
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
              <div>
                <label className="block text-slate-400 text-sm mb-1">Content</label>
                <textarea 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 min-h-[100px]"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingNode(null)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
              <button onClick={async () => {
                await axios.put(`${API_BASE_URL}/thoughts/${editingNode.id.split('-')[1]}`, {
                  title: editTitle,
                  content: editContent
                });
                setEditingNode(null);
                fetchData();
              }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ToolButton = ({ active, onClick, icon, title }) => (
  <button 
    onClick={onClick}
    className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
      active ? 'bg-blue-600 text-white shadow-lg scale-110' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
    }`}
    title={title}
  >
    <span className="text-lg">{icon}</span>
  </button>
);

const VoidView = () => (
  <ReactFlowProvider>
    <VoidContent />
  </ReactFlowProvider>
);

export default VoidView;
