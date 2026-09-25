const TOKEN_KEY = 'mindvoid_token';

const subscribers = new Set();
let memoryToken = null;

const notify = () => {
  subscribers.forEach((subscriber) => subscriber(getToken()));
};

export const getToken = () => {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
};

export const setToken = (token) => {
  memoryToken = token;

  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore storage failures; callers still receive the login callback.
  }
  notify();
};

export const clearToken = () => {
  memoryToken = null;

  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage failures.
  }
  notify();
};

export const subscribeToToken = (subscriber) => {
  subscribers.add(subscriber);

  return () => {
    subscribers.delete(subscriber);
  };
};
