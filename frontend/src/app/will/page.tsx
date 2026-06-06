'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isLoggedIn, getUser, logout } from '@/lib/auth';
import { createWill, listWills, startInterview, sendMessage, getWill, checkValidity, downloadDocument } from '@/lib/api';
import type { Will, ChatMessage, ValidationResult } from '@/types';
import { WillPreview } from '@/components/WillPreview/WillPreview';
import { ChatPanel } from '@/components/Chat/ChatPanel';

export default function WillPage() {
  const router = useRouter();
  const [will, setWill] = useState<Will | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const user = getUser();

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn()) router.replace('/auth/login');
  }, [router]);

  // ── Init: load or create will ─────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        let wills = await listWills();
        let currentWill: Will;

        if (wills.length === 0) {
          currentWill = await createWill();
          wills = [currentWill];
        } else {
          currentWill = wills[0]; // Use most recent
        }

        const [fullWill, valid] = await Promise.all([
          getWill(currentWill.id),
          checkValidity(currentWill.id),
        ]);

        setWill(fullWill);
        setValidation(valid);

        // Start interview if no messages yet
        const result = await startInterview(currentWill.id);
        setMessages([{ role: 'assistant', content: result.reply }]);
      } catch (err) {
        console.error('Init failed:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  async function handleSendMessage(text: string) {
    if (!will || sending) return;
    setSending(true);

    // Optimistic user message
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    // Streaming placeholder
    setStreamingText('');
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      // Use streaming (Part 8) — word-by-word SSE
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const url = `${BASE}/api/wills/${will.id}/interview/stream?message=${encodeURIComponent(text)}&token=${token}`;

      let accumulated = '';

      await new Promise<void>((resolve, reject) => {
        const es = new EventSource(url);
        es.onmessage = (event) => {
          if (event.data === '[DONE]') {
            es.close();
            resolve();
            return;
          }
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.text) {
              accumulated += parsed.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: accumulated };
                return updated;
              });
            }
          } catch (_) {}
        };
        es.onerror = () => { es.close(); resolve(); };
      });

      // Refresh will data + validity after each turn
      const [freshWill, freshValid] = await Promise.all([
        getWill(will.id),
        checkValidity(will.id),
      ]);
      setWill(freshWill);
      setValidation(freshValid);
    } catch (err) {
      // Fallback to non-streaming if SSE fails
      try {
        const result = await sendMessage(will.id, text);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: result.reply };
          return updated;
        });
        const [freshWill, freshValid] = await Promise.all([
          getWill(will.id),
          checkValidity(will.id),
        ]);
        setWill(freshWill);
        setValidation(freshValid);
      } catch (e2) {
        console.error('Message send failed:', e2);
      }
    } finally {
      setSending(false);
    }
  }

  function handleLogout() {
    logout();
    router.push('/auth/login');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500 text-sm">Setting up your will…</div>
      </div>
    );
  }

  const canDownload =
    validation?.status === 'valid' || validation?.status === 'warning';

  return (
    <div className="flex flex-col h-screen">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-900">Lawyered</span>
          <span className="text-gray-400 text-sm hidden sm:inline">AI Will Maker</span>
        </div>
        <div className="flex items-center gap-4">
          {validation && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="h-1.5 w-32 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${(validation.completionScore / validation.completionMax) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">
                {Math.round((validation.completionScore / validation.completionMax) * 100)}% complete
              </span>
            </div>
          )}
          {canDownload && (
            <button
              onClick={() => will && downloadDocument(will.id)}
              className="bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-700 transition-colors"
            >
              Download Will
            </button>
          )}
          <button
            onClick={handleLogout}
            className="text-gray-500 text-sm hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Warnings banner */}
      {(validation?.warnings?.length ?? 0) > 0 && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2">
          {validation!.warnings.map((w, i) => (
            <p key={i} className="text-yellow-800 text-xs">{w}</p>
          ))}
        </div>
      )}

      {/* Errors banner */}
      {(validation?.errors?.length ?? 0) > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2">
          {validation!.errors.map((e, i) => (
            <p key={i} className="text-red-700 text-xs">{e}</p>
          ))}
        </div>
      )}

      {/* Split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Chat */}
        <div className="flex-1 flex flex-col border-r border-gray-200">
          <ChatPanel
            messages={messages}
            onSend={handleSendMessage}
            disabled={sending}
          />
        </div>

        {/* Right: Live Will Preview */}
        <div className="w-2/5 overflow-y-auto bg-white">
          {will ? (
            <WillPreview will={will} validation={validation} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Your will preview will appear here
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
