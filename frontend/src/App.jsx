import React, { useState } from 'react'
import VoidView from './VoidView'
import ListView from './ListView'

function App() {
  const [view, setView] = useState('void');

  return (
    <div className="w-screen h-screen flex flex-col">
      {/* Navigation Header */}
      <nav className="fixed top-6 left-6 z-50 flex bg-slate-800/80 backdrop-blur-md rounded-full border border-slate-700 p-1 shadow-2xl">
        <button
          onClick={() => setView('void')}
          className={`px-6 py-2 rounded-full transition-all duration-300 text-sm font-medium ${
            view === 'void' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
          }`}
        >
          Void Map
        </button>
        <button
          onClick={() => setView('list')}
          className={`px-6 py-2 rounded-full transition-all duration-300 text-sm font-medium ${
            view === 'list' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
          }`}
        >
          Table View
        </button>
      </nav>

      <main className="flex-grow">
        {view === 'void' ? <VoidView /> : <ListView />}
      </main>
    </div>
  )
}

export default App
