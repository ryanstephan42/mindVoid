import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import axios from 'axios';

const API_BASE_URL = '/api';

const ThoughtNode = ({ id, data }) => {
  const toggleNeedsAction = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    const newValue = !data.needs_action;
    
    // Optimistic update - this relies on the parent component's state being updated via re-fetch or manual state sync
    // But since data is passed down, we trigger the API and the parent should handle the state update.
    // In VoidView.jsx, we'll implement the actual state update logic when we handle the click or after the PUT.
    
    try {
      await axios.put(`${API_BASE_URL}/thoughts/${id}`, {
        needs_action: newValue
      });
      // Trigger a refresh of the nodes in the parent
      if (data.onToggleNeedsAction) {
        data.onToggleNeedsAction(id, newValue);
      }
    } catch (error) {
      console.error('Error toggling needs_action:', error);
    }
  };

  const floatClasses = ['floating-inner', 'floating-inner-alt', 'floating-inner-alt-2'];
  const floatClass = floatClasses[parseInt(id) % floatClasses.length] || floatClasses[0];

  const baseStyle = { 
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

  const glowStyle = (data.needs_action || data.isBeingLinked) ? {
    boxShadow: `0 0 15px 5px ${data.isBeingLinked ? 'rgba(59, 130, 246, 0.6)' : 'rgba(239, 68, 68, 0.5)'}`,
    border: `2px solid ${data.isBeingLinked ? '#3b82f6' : '#ef4444'}`,
    transform: data.isBeingLinked ? 'scale(1.1)' : 'none'
  } : {};

  const deleteStyle = data.isDeleteMode ? {
    background: '#fee2e2',
    border: '2px solid #ef4444',
    color: '#991b1b'
  } : {};

  // Combine styles
  const combinedStyle = { ...baseStyle, ...glowStyle, ...deleteStyle };

  const label = data.title ? `${data.title}: ${data.content}` : data.content;

  return (
    <div 
      onContextMenu={toggleNeedsAction}
      className="thought-node-wrapper"
      style={{ background: 'transparent', border: 'none', padding: 0 }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" style={{ top: '50%', left: '50%' }} />
      <div className={floatClass} style={combinedStyle}>
        {label}
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" style={{ top: '50%', left: '50%' }} />
    </div>
  );
};

export default memo(ThoughtNode);
