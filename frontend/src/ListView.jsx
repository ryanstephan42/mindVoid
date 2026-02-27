import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = '/api';

const ListView = () => {
  const [thoughts, setThoughts] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [editingThought, setEditingThought] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [linkToDelete, setLinkToDelete] = useState(null);

  const fetchData = async () => {
    try {
      const [thoughtsRes, linksRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/thoughts/`),
        axios.get(`${API_BASE_URL}/links/`)
      ]);
      setThoughts(thoughtsRes.data);
      setLinks(linksRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getConnectionsCount = (thoughtId) => {
    return links.filter(l => l.source_id === thoughtId || l.target_id === thoughtId).length;
  };

  const handleEditClick = (thought) => {
    setEditingThought(thought);
    setEditTitle(thought.title || '');
    setEditContent(thought.content || '');
  };

  const handleUpdateThought = async () => {
    try {
      await axios.put(`${API_BASE_URL}/thoughts/${editingThought.id}`, {
        title: editTitle,
        content: editContent
      });
      setEditingThought(null);
      fetchData();
    } catch (error) {
      console.error('Error updating thought:', error);
    }
  };

  const handleDeleteLink = async () => {
    if (!linkToDelete) return;
    try {
      await axios.delete(`${API_BASE_URL}/links/${linkToDelete.id}`);
      setLinkToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting link:', error);
      setLinkToDelete(null);
    }
  };

  const onDragStart = (e, thoughtId) => {
    e.dataTransfer.setData("thoughtId", thoughtId);
    e.currentTarget.style.opacity = '0.5';
  };

  const onDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-blue-900/40');
  };

  const onDragLeave = (e) => {
    e.currentTarget.classList.remove('bg-blue-900/40');
  };

  const onDrop = async (e, targetId) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-blue-900/40');
    const sourceId = e.dataTransfer.getData("thoughtId");
    
    if (sourceId && sourceId !== targetId.toString()) {
      try {
        await axios.post(`${API_BASE_URL}/links/`, {
          source_id: parseInt(sourceId),
          target_id: parseInt(targetId)
        });
        fetchData();
      } catch (error) {
        console.error('Error linking thoughts:', error);
      }
    }
  };

  return (
    <div className="w-full h-full bg-slate-900 p-4 md:p-8 overflow-auto">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-8">Thought Repository</h1>
        
        {loading ? (
          <div className="text-slate-400 text-lg">Loading thoughts...</div>
        ) : (
          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-700/50 border-b border-slate-700">
                    <th className="px-6 py-5 text-slate-300 font-bold uppercase text-sm tracking-wider">Thought</th>
                    <th className="px-6 py-5 text-slate-300 font-bold uppercase text-sm tracking-wider">Created</th>
                    <th className="px-6 py-5 text-slate-300 font-bold uppercase text-sm tracking-wider text-center">Links</th>
                    <th className="px-6 py-5 text-slate-300 font-bold uppercase text-sm tracking-wider text-right">Loc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {thoughts.map((thought) => (
                    <tr 
                      key={thought.id} 
                      className="hover:bg-slate-700/30 transition-colors cursor-pointer group"
                      draggable
                      onDragStart={(e) => onDragStart(e, thought.id)}
                      onDragEnd={onDragEnd}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={(e) => onDrop(e, thought.id)}
                      onClick={() => handleEditClick(thought)}
                    >
                      <td className="px-6 py-6">
                        <div className="text-white font-bold text-lg md:text-xl mb-1">
                          {thought.title || <span className="text-slate-500 italic font-normal text-base">Untitled</span>}
                        </div>
                        <div className="text-slate-300 text-base md:text-lg max-w-lg line-clamp-2">
                          {thought.content}
                        </div>
                      </td>
                      <td className="px-6 py-6 text-slate-400 text-sm whitespace-nowrap">
                        {new Date(thought.created_at).toLocaleDateString()}<br/>
                        {new Date(thought.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-6 text-center">
                        <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-bold ${
                          getConnectionsCount(thought.id) > 0 ? 'bg-blue-900/50 text-blue-300 border border-blue-700' : 'bg-slate-700/50 text-slate-500'
                        }`}>
                          {getConnectionsCount(thought.id)}
                        </span>
                      </td>
                      <td className="px-6 py-6 text-slate-500 text-xs text-right font-mono">
                        {Math.round(thought.x_pos)}, {Math.round(thought.y_pos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {thoughts.length === 0 && (
              <div className="px-6 py-12 text-center text-slate-500 text-xl">
                The void is empty. Add some thoughts in the map view.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingThought && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Edit Thought</h2>
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
              <button onClick={() => setEditingThought(null)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
              <button onClick={handleUpdateThought} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListView;
