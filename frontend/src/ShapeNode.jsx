import React, { memo, useState, useEffect } from 'react';
import { NodeResizer } from 'reactflow';

const ShapeNode = ({ id, data, selected }) => {
  const { 
    type, 
    color = '#64748b', 
    stroke_width = 2, 
    text = '', 
    points = [],
    isDrawingMode = false
  } = data;

  const [isEditingText, setIsEditingText] = useState(false);
  const [localText, setLocalText] = useState(text);

  useEffect(() => {
    setLocalText(text);
  }, [text]);

  const handleTextChange = (e) => {
    setLocalText(e.target.value);
  };

  const handleBlur = () => {
    setIsEditingText(false);
    if (data.onTextChange) {
      data.onTextChange(id, localText);
    }
  };

  const commonProps = {
    fill: 'none',
    stroke: color,
    strokeWidth: stroke_width,
    vectorEffect: 'non-scaling-stroke'
  };

  const renderShape = () => {
    switch (type) {
      case 'rectangle':
        return <rect x={stroke_width} y={stroke_width} width={100 - stroke_width * 2} height={100 - stroke_width * 2} {...commonProps} />;
      case 'circle':
        return <ellipse cx="50" cy="50" rx={50 - stroke_width} ry={50 - stroke_width} {...commonProps} />;
      case 'triangle':
        return <polygon points="50,2 98,98 2,98" {...commonProps} />;
      case 'line':
        return <line x1="0" y1="100" x2="100" y2="0" {...commonProps} />;
      case 'arrow':
        return (
          <g>
            <line x1="0" y1="100" x2="95" y2="5" {...commonProps} />
            <polygon points="100,0 80,5 95,20" fill={color} stroke="none" />
          </g>
        );
      case 'freehand':
        if (!points || points.length < 2) return null;
        const d = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
        return <path d={d} {...commonProps} />;
      default:
        return null;
    }
  };

  return (
    <div 
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative',
        pointerEvents: isDrawingMode ? 'all' : 'none'
      }}
    >
      {isDrawingMode && selected && (
        <NodeResizer 
          minWidth={20} 
          minHeight={20} 
          isVisible={selected} 
          lineClassName="border-blue-500" 
          handleClassName="h-2 w-2 bg-white border border-blue-500 rounded-sm"
          onResizeStop={(event, params) => {
            if (data.onResizeStop) {
              data.onResizeStop(event, { id, ...params });
            }
          }}
        />
      )}
      
      <svg 
        width="100%" 
        height="100%" 
        viewBox={type === 'freehand' ? undefined : "0 0 100 100"} 
        preserveAspectRatio="none"
        style={{ overflow: 'visible', display: 'block' }}
      >
        {renderShape()}
      </svg>

      {(type === 'text' || text) && (
        <div 
          style={{ 
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)',
            color: color,
            width: '100%',
            textAlign: 'center',
            pointerEvents: isDrawingMode ? 'all' : 'none',
            wordWrap: 'break-word',
            fontSize: '14px',
            padding: '4px',
            userSelect: isDrawingMode ? 'text' : 'none'
          }}
          onDoubleClick={() => isDrawingMode && setIsEditingText(true)}
        >
          {isEditingText ? (
            <textarea
              autoFocus
              value={localText}
              onChange={handleTextChange}
              onBlur={handleBlur}
              className="bg-transparent border-none text-center outline-none w-full resize-none"
              style={{ color: color }}
            />
          ) : (
            <span>{localText}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(ShapeNode);
