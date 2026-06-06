import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({ baseURL: `${BASE}/api` });

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Auth ───────────────────────────────────────────────────────────────────
export const register = (email: string, password: string) =>
  api.post('/auth/register', { email, password }).then((r) => r.data);

export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

// ── Wills ──────────────────────────────────────────────────────────────────
export const createWill = () => api.post('/wills').then((r) => r.data);
export const listWills = () => api.get('/wills').then((r) => r.data);
export const getWill = (id: string) => api.get(`/wills/${id}`).then((r) => r.data);

// ── Interview ──────────────────────────────────────────────────────────────
export const startInterview = (willId: string) =>
  api.post(`/wills/${willId}/interview/start`).then((r) => r.data);

export const sendMessage = (willId: string, message: string) =>
  api.post(`/wills/${willId}/interview/message`, { message }).then((r) => r.data);

/**
 * Part 8 — Streaming via SSE.
 * Opens an EventSource GET connection and calls onChunk for each text chunk.
 * The message is sent as a query param (EventSource doesn't support bodies).
 */
export const streamMessage = (
  willId: string,
  message: string,
  onChunk: (text: string) => void,
  onDone: () => void,
) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  const url = `${BASE}/api/wills/${willId}/interview/stream?message=${encodeURIComponent(message)}&token=${token}`;
  const es = new EventSource(url);

  es.onmessage = (event) => {
    if (event.data === '[DONE]') {
      es.close();
      onDone();
      return;
    }
    try {
      const parsed = JSON.parse(event.data);
      if (parsed.text) onChunk(parsed.text);
    } catch (_) {}
  };

  es.onerror = () => { es.close(); onDone(); };
  return es;
};

// ── Validity ───────────────────────────────────────────────────────────────
export const checkValidity = (willId: string) =>
  api.get(`/wills/${willId}/validity`).then((r) => r.data);

// ── Document ───────────────────────────────────────────────────────────────
export const downloadDocument = (willId: string) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  window.open(`${BASE}/api/wills/${willId}/document/download?token=${token}`, '_blank');
};
