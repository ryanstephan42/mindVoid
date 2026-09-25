import React, { useCallback, useEffect, useState } from 'react'
import VoidView from './VoidView'
import ListView from './ListView'
import api from './api'
import { clearToken, getToken, subscribeToToken } from './auth'
import LoginScreen from './LoginScreen'

function App() {
  const [view, setView] = useState('void');
  const [authStatus, setAuthStatus] = useState('checking');
  const [authRequired, setAuthRequired] = useState(false);
  const [token, setTokenState] = useState(() => getToken());

  const loadAuthStatus = useCallback(async () => {
    try {
      const response = await api.get('/auth/status');
      setAuthRequired(Boolean(response.data.auth_required));
      setAuthStatus('ready');
    } catch {
      setAuthStatus('error');
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadAuthStatus);
  }, [loadAuthStatus]);

  useEffect(() => subscribeToToken(setTokenState), []);

  const handleAuthenticated = () => {
    setTokenState(getToken());
  };

  const handleLock = () => {
    clearToken();
  };

  const handleRetry = () => {
    setAuthStatus('checking');
    loadAuthStatus();
  };

  if (authStatus === 'checking') {
    return (
      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center">
        <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700 rounded-2xl px-6 py-4 text-slate-300 shadow-2xl">
          Loading mindVoid…
        </div>
      </div>
    );
  }

  if (authStatus === 'error') {
    return (
      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md bg-slate-800/80 backdrop-blur-md border border-slate-700 rounded-2xl p-8 text-center shadow-2xl">
          <h1 className="text-2xl font-bold text-white mb-3">Unable to reach mindVoid</h1>
          <p className="text-slate-400 mb-6">The backend did not respond while checking authentication.</p>
          <button
            type="button"
            onClick={handleRetry}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (authRequired && !token) {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

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
        {authRequired && (
          <button
            type="button"
            onClick={handleLock}
            className="px-5 py-2 rounded-full transition-all duration-300 text-sm font-medium text-slate-400 hover:text-white"
          >
            Lock
          </button>
        )}
      </nav>

      <main className="flex-grow">
        {view === 'void' ? <VoidView /> : <ListView />}
      </main>
    </div>
  )
}

export default App
