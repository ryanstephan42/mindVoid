import { useRef, useState } from 'react';
import api from './api';
import { setToken } from './auth';

const LoginScreen = ({ onAuthenticated }) => {
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const response = await api.post('/auth/login', { password });
      setToken(response.data.token);
      setPassword('');
      onAuthenticated();
    } catch (error) {
      if (error.response?.status === 401) {
        setErrorMessage('Incorrect password');
      } else if (error.response) {
        setErrorMessage('Unable to sign in. Please try again.');
      } else {
        setErrorMessage('Unable to reach mindVoid. Check your connection and try again.');
      }

      inputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-slate-950 flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-slate-800/80 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-8"
      >
        <div className="mb-8 text-center">
          <p className="text-blue-400 text-sm font-semibold tracking-[0.3em] uppercase mb-3">mindVoid</p>
          <h1 className="text-3xl font-bold text-white mb-2">Unlock your void</h1>
          <p className="text-slate-400">Enter the password to continue.</p>
        </div>

        <label className="block text-slate-300 text-sm font-medium mb-2" htmlFor="mindvoid-password">
          Password
        </label>
        <input
          ref={inputRef}
          id="mindvoid-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-600/30 transition"
          autoComplete="current-password"
          autoFocus
          disabled={isSubmitting}
        />

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !password}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl px-6 py-3 font-semibold transition-colors shadow-lg"
        >
          {isSubmitting ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
};

export default LoginScreen;
