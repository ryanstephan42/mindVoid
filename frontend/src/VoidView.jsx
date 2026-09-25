import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactFlow, { 
  Background, 
  useReactFlow,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import api from './api';
import ThoughtNode from './ThoughtNode';
import ShapeNode from './ShapeNode';

const nodeTypes = {
  thought: ThoughtNode,
  shape: ShapeNode
};

const parseDrawingPoints = (points) => {
  if (!points) return [];
  try {
    const parsed = typeof points === 'string' ? JSON.parse(points) : points;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error parsing drawing points:', error);
    return [];
  }
};

const VoidContent = () => {
  const [rawThoughts, setRawThoughts] = useState([]);
  const [rawLinks, setRawLinks] = useState([]);
  const [rawDrawings, setRawDrawings] = useState([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [activeTool, setActiveTool] = useState('thought'); // 'thought', 'rectangle', 'circle', 'triangle', 'line', 'arrow', 'text', 'freehand', 'eraser'
  const { fitView, screenToFlowPosition } = useReactFlow();
  
  const [editingNode, setEditingNode] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editIsLocked, setEditIsLocked] = useState(false);
  const [edgeToDelete, setEdgeToDelete] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const linkingTimer = useRef(null);
  const recognitionRef = useRef(null);
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
  const isSpeechSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const showError = useCallback((message, error) => {
    console.error(message, error);
    setErrorMessage(message);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [thoughtsRes, linksRes, drawingsRes] = await Promise.all([
        api.get('/thoughts/'),
        api.get('/links/'),
        api.get('/drawings/')
      ]);

      setRawThoughts(thoughtsRes.data);
      setRawLinks(linksRes.data);
      setRawDrawings(drawingsRes.data);
      setHasLoadedData(true);
      setErrorMessage('');
    } catch (error) {
      showError('Unable to load the void. Please check the backend connection and try again.', error);
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (isDrawingMode) {
      setIsDrawExpanded(true);
    }
  }, [isDrawingMode]);

  useEffect(() => {
    return () => {
      if (linkingTimer.current) clearTimeout(linkingTimer.current);
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const onToggleNeedsAction = useCallback((id, newValue) => {
    const thoughtId = parseInt(id.split('-')[1]);
    setRawThoughts((thoughts) => thoughts.map((thought) => {
      if (thought.id === thoughtId) {
        return { ...thought, needs_action: newValue };
      }
      return thought;
    }));
  }, []);

  const handleUpdateShapeText = useCallback(async (id, newText) => {
    try {
      const drawingId = id.split('-')[1];
      await api.put(`/drawings/${drawingId}`, {
        text: newText
      });
      setRawDrawings((drawings) => drawings.map((drawing) => {
        if (drawing.id === parseInt(drawingId)) {
          return { ...drawing, text: newText };
        }
        return drawing;
      }));
    } catch (error) {
      showError('Unable to update drawing text. Please try again.', error);
    }
  }, [showError]);

  const handleNodeResizeStop = useCallback(async (event, { id, width, height }) => {
    try {
      const drawingId = id.split('-')[1];
      await api.put(`/drawings/${drawingId}`, {
        width,
        height
      });
      setRawDrawings((drawings) => drawings.map((drawing) => {
        if (drawing.id === parseInt(drawingId)) {
          return { ...drawing, width, height };
        }
        return drawing;
      }));
    } catch (error) {
      showError('Unable to save drawing size. Please try again.', error);
    }
  }, [showError]);

  const nodes = useMemo(() => {
    const fetchedThoughts = rawThoughts.map((thought) => ({
      id: `thought-${thought.id}`,
      type: 'thought',
      data: { 
        title: thought.title,
        content: thought.content,
        needs_action: thought.needs_action,
        isDeleteMode: isDeleteMode,
        onToggleNeedsAction: onToggleNeedsAction,
        is_locked: thought.is_locked,
        isDrawingMode: isDrawingMode,
        isBeingLinked: linkingState.isPending && (linkingState.sourceId === `thought-${thought.id}` || linkingState.targetId === `thought-${thought.id}`)
      },
      position: { x: thought.x_pos, y: thought.y_pos },
      selected: selectedNodeIds.includes(`thought-${thought.id}`),
      draggable: !isDrawingMode && !thought.is_locked,
      zIndex: 1,
      raw: thought
    }));

    const fetchedDrawings = rawDrawings.map((drawing) => ({
      id: `drawing-${drawing.id}`,
      type: 'shape',
      data: { 
        type: drawing.type,
        width: drawing.width,
        height: drawing.height,
        color: drawing.color,
        stroke_width: drawing.stroke_width,
        text: drawing.text,
        points: parseDrawingPoints(drawing.points),
        isDrawingMode: isDrawingMode,
        onTextChange: handleUpdateShapeText,
        onResizeStop: handleNodeResizeStop
      },
      position: { x: drawing.x, y: drawing.y },
      selected: selectedNodeIds.includes(`drawing-${drawing.id}`),
      draggable: isDrawingMode && activeTool === 'thought', // Only draggable if we are NOT in a specific drawing tool
      selectable: isDrawingMode,
      style: { width: drawing.width, height: drawing.height },
      zIndex: -1,
      raw: drawing
    }));

    return [...fetchedThoughts, ...fetchedDrawings];
  }, [activeTool, handleNodeResizeStop, handleUpdateShapeText, isDeleteMode, isDrawingMode, linkingState, onToggleNeedsAction, rawDrawings, rawThoughts, selectedNodeIds]);

  const edges = useMemo(() => rawLinks.map((link) => ({
    id: `e${link.id}`,
    source: `thought-${link.source_id}`,
    target: `thought-${link.target_id}`,
    style: { 
      stroke: isDeleteMode ? '#ef4444' : '#64748b',
      strokeWidth: 6,
      cursor: 'pointer'
    }
  })), [isDeleteMode, rawLinks]);

  const onNodesChange = useCallback((changes) => {
    const filteredChanges = changes.filter(change => {
      if (change.type === 'position' || change.type === 'dimensions') {
        const node = nodes.find(n => n.id === change.id);
        if (node && node.type === 'shape' && !isDrawingMode) return false;
      }
      return true;
    });

    setSelectedNodeIds((currentSelected) => {
      const nextSelected = new Set(currentSelected);
      filteredChanges.forEach((change) => {
        if (change.type === 'select') {
          if (change.selected) {
            nextSelected.add(change.id);
          } else {
            nextSelected.delete(change.id);
          }
        }
      });
      return Array.from(nextSelected);
    });

    setRawThoughts((thoughts) => thoughts.map((thought) => {
      const change = filteredChanges.find((item) => item.id === `thought-${thought.id}` && item.type === 'position' && item.position);
      if (!change) return thought;
      return { ...thought, x_pos: change.position.x, y_pos: change.position.y };
    }));

    setRawDrawings((drawings) => drawings.map((drawing) => {
      let nextDrawing = drawing;
      filteredChanges.forEach((change) => {
        if (change.id !== `drawing-${drawing.id}`) return;
        if (change.type === 'position' && change.position) {
          nextDrawing = { ...nextDrawing, x: change.position.x, y: change.position.y };
        }
        if (change.type === 'dimensions' && change.dimensions) {
          nextDrawing = { ...nextDrawing, width: change.dimensions.width, height: change.dimensions.height };
        }
      });
      return nextDrawing;
    }));
  }, [isDrawingMode, nodes]);

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
        await api.put(`/thoughts/${id}`, {
          x_pos: node.position.x,
          y_pos: node.position.y
        });
        setRawThoughts((thoughts) => thoughts.map((thought) => thought.id === parseInt(id) ? { ...thought, x_pos: node.position.x, y_pos: node.position.y } : thought));
      } else if (node.type === 'shape') {
        await api.put(`/drawings/${id}`, {
          x: node.position.x,
          y: node.position.y
        });
        setRawDrawings((drawings) => drawings.map((drawing) => drawing.id === parseInt(id) ? { ...drawing, x: node.position.x, y: node.position.y } : drawing));
      }

      if (linkingState.isPending && linkingState.targetId) {
        const existingLink = edges.find(e => 
          (e.source === linkingState.sourceId && e.target === linkingState.targetId) ||
          (e.source === linkingState.targetId && e.target === linkingState.sourceId)
        );

        if (existingLink) {
          setEdgeToDelete(existingLink);
        } else {
          await api.post('/links/', {
            source_id: parseInt(linkingState.sourceId.split('-')[1]),
            target_id: parseInt(linkingState.targetId.split('-')[1])
          });
          fetchData();
        }
      }
      
      if (linkingTimer.current) clearTimeout(linkingTimer.current);
      setLinkingState({ sourceId: null, targetId: null, isPending: false });
    } catch (error) {
      showError('Unable to save node position or link change. Please try again.', error);
    }
  }, [linkingState, edges, fetchData, showError]);

  const onConnect = useCallback(async (params) => {
    if (isDeleteMode || isDrawingMode) return;
    const linkExists = edges.some(e => 
      (e.source === params.source && e.target === params.target) ||
      (e.source === params.target && e.target === params.source)
    );
    if (linkExists) return;

    try {
      await api.post('/links/', {
        source_id: parseInt(params.source.split('-')[1]),
        target_id: parseInt(params.target.split('-')[1])
      });
      fetchData();
    } catch (error) {
      showError('Unable to save link. Please try again.', error);
    }
  }, [isDeleteMode, isDrawingMode, edges, fetchData, showError]);

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

      await api.post('/drawings/', payload);
      fetchData();
    } catch (error) {
      showError('Unable to create drawing. Please try again.', error);
    }

    setDrawingStart(null);
    setCurrentDrawingNode(null);
  }, [drawingStart, currentDrawingNode, activeTool, fetchData, showError]);

  const onNodeClick = async (event, node) => {
    if (activeTool === 'eraser' || isDeleteMode) {
      try {
        const id = node.id.split('-')[1];
        if (node.type === 'thought') {
          await api.delete(`/thoughts/${id}`);
        } else if (node.type === 'shape') {
          await api.delete(`/drawings/${id}`);
        }
        fetchData();
      } catch (error) {
        showError('Unable to delete node. Please try again.', error);
      }
    } else if (node.type === 'thought') {
      setEditingNode(node);
      setEditTitle(node.data.title || '');
      setEditContent(node.data.content || '');
      setEditIsLocked(node.data.is_locked || false);
    }
  };

  const handleSend = useCallback(async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim() || isDeleteMode || isDrawingMode) return;
    const randomX = Math.random() * 400 + 200;
    const randomY = Math.random() * 400 + 100;
    try {
      await api.post('/thoughts/', {
        content: text,
        x_pos: randomX,
        y_pos: randomY,
      });
      fetchData();
      setInputText('');
    } catch (error) {
      showError('Unable to create thought. Please try again.', error);
    }
  }, [fetchData, inputText, isDeleteMode, isDrawingMode, showError]);

  const pasteNode = useCallback(async (node) => {
    try {
      if (node.type === 'thought') {
        await api.post('/thoughts/', {
          content: node.raw.content,
          title: node.raw.title,
          needs_action: node.raw.needs_action,
          is_group: node.raw.is_group,
          is_locked: node.raw.is_locked,
          width: node.raw.width,
          height: node.raw.height,
          x_pos: node.position.x + 50,
          y_pos: node.position.y + 50
        });
      } else if (node.type === 'shape') {
        await api.post('/drawings/', {
          type: node.raw.type,
          width: node.raw.width,
          height: node.raw.height,
          points: node.raw.points,
          text: node.raw.text,
          color: node.raw.color,
          stroke_width: node.raw.stroke_width,
          x: node.position.x + 50,
          y: node.position.y + 50
        });
      }
      fetchData();
    } catch (error) {
      showError('Unable to paste node. Please try again.', error);
    }
  }, [fetchData, showError]);

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
  }, [nodes, clipboardNode, pasteNode]);

  const displayNodes = useMemo(() => {
    const nextNodes = [...nodes];
    if (currentDrawingNode) {
      nextNodes.push({ ...currentDrawingNode, id: 'temp-drawing' });
    }
    return nextNodes;
  }, [currentDrawingNode, nodes]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (isListening) {
      stopListening();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage('Speech recognition is not supported in this browser.');
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInputText(transcript);
      handleSend(transcript);
    };
    recognition.onerror = (e) => {
      setIsListening(false);
      recognitionRef.current = null;
      setErrorMessage(`Speech recognition failed: ${e.error || 'unknown error'}.`);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setIsListening(false);
    };
    recognition.start();
  }, [handleSend, isListening, stopListening]);

  const confirmDeleteEdge = async () => {
    if (!edgeToDelete) return;
    try {
      await api.delete(`/links/${edgeToDelete.id.replace(/^e/, '')}`);
      setEdgeToDelete(null);
      fetchData();
    } catch (error) {
      showError('Unable to remove link. Please try again.', error);
    }
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

      {isLoading && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 bg-slate-800/90 backdrop-blur-md border border-slate-700 text-slate-200 px-5 py-3 rounded-2xl shadow-2xl z-50">
          Loading void...
        </div>
      )}

      {errorMessage && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 bg-red-950/90 backdrop-blur-md border border-red-700 text-red-100 px-5 py-3 rounded-2xl shadow-2xl z-50 max-w-xl flex items-center gap-4">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="text-red-300 hover:text-white font-bold">Dismiss</button>
        </div>
      )}

      {hasLoadedData && !isLoading && !errorMessage && rawThoughts.length === 0 && rawDrawings.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="bg-slate-800/70 backdrop-blur-md border border-slate-700 text-slate-300 px-6 py-4 rounded-2xl shadow-2xl text-center">
            <div className="text-xl font-bold text-white mb-1">The void is empty.</div>
            <div className="text-sm text-slate-400">Add a thought below or draw something to begin.</div>
          </div>
        </div>
      )}

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
            <button type="button" onClick={startListening} disabled={!isSpeechSupported} title={isSpeechSupported ? (isListening ? 'Stop listening' : 'Start listening') : 'Speech recognition is not supported'} className={`p-2 ${isListening ? 'text-red-500 animate-pulse' : isSpeechSupported ? 'text-slate-400 hover:text-white' : 'text-slate-600 cursor-not-allowed'}`}>
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
              <label className="flex items-center gap-3 text-slate-300">
                <input
                  type="checkbox"
                  checked={editIsLocked}
                  onChange={(e) => setEditIsLocked(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
                />
                Locked
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingNode(null)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
              <button onClick={async () => {
                try {
                  await api.put(`/thoughts/${editingNode.id.split('-')[1]}`, {
                    title: editTitle,
                    content: editContent,
                    is_locked: editIsLocked
                  });
                  setEditingNode(null);
                  fetchData();
                } catch (error) {
                  showError('Unable to save thought. Please try again.', error);
                }
              }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {edgeToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">Remove Link?</h2>
            <p className="text-slate-300">These thoughts are already linked. Remove the existing link between them?</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEdgeToDelete(null)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
              <button onClick={confirmDeleteEdge} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg">Remove Link</button>
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
