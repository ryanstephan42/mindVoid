import React, { memo } from 'react';
import { NodeResizer } from 'reactflow';

const GroupNode = ({ id, data, selected }) => {
  const toggleNeedsAction = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (data.onToggleNeedsAction) {
      data.onToggleNeedsAction(id, !data.needs_action);
    }
  };

  const style = {
    width: '100%',
    height: '100%',
    background: data.needs_action ? 'rgba(239, 68, 68, 0.1)' : 'rgba(30, 41, 59, 0.5)',
    border: `2px dashed ${data.needs_action ? '#ef4444' : '#64748b'}`,
    borderRadius: '12px',
    padding: '10px',
    color: '#94a3b8',
    transition: 'all 0.3s ease',
    opacity: data.is_locked ? 0.8 : 1
  };

  return (
    <div 
      onContextMenu={toggleNeedsAction}
      className="group-node-container"
      style={{ width: '100%', height: '100%', pointerEvents: 'all' }}
    >
      {!data.is_locked && (
        <NodeResizer 
          minWidth={100} 
          minHeight={100} 
          isVisible={selected} 
          lineClassName="border-blue-500" 
          handleClassName="h-3 w-3 bg-white border-2 border-blue-500 rounded"
        />
      )}
      <div style={style}>
        <div className="flex justify-between items-start">
          <div className="text-xs font-bold uppercase tracking-wider mb-2">
            {data.title || 'Box'}
          </div>
          {data.is_locked && (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(GroupNode);
