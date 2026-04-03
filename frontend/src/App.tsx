import DarkModeToggle from './components/DarkModeToggle';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import UploadSection, { UploadItem } from './components/UploadSection';
import Leaderboard from './components/Leaderboard';
import ChatPanel from './components/ChatPanel';
import { CandidateResult, ChatRequestHistoryTurn, ChatUiMessage } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function App() {
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [screening, setScreening] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatUiMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const isAiErrorResult = useCallback((r: CandidateResult) => {
    // Backend returns error messages in `summary` when AI/JSON parsing fails.
    return r.summary.trim().toLowerCase().startsWith('error:');
  }, []);

  const historyForRequest: ChatRequestHistoryTurn[] = useMemo(() => {
    return chatMessages.map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));
  }, [chatMessages]);

  const updateUploadItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setUploadItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const removeUploadItem = useCallback((id: string) => {
    setUploadItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const handleSelectFiles = useCallback((files: File[]) => {
    // Reset results and chat when changing the candidate set.
    setCandidates([]);
    setChatMessages([]);
    setUploadItems(
      files.map((file) => ({
        id: makeId(),
        file,
        progress: 0,
        status: 'queued',
      }))
    );
  }, []);

  const uploadScreenOne = useCallback(
    (file: File, jobDescription: string, onProgress: (progress: number) => void) => {
      return new Promise<CandidateResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/screen_one`);

        xhr.upload.onprogress = (e: ProgressEvent<EventTarget>) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(Math.max(0, Math.min(100, pct)));
          }
        };

        xhr.onload = () => {
          try {
            if (xhr.status >= 200 && xhr.status < 300) {
              const payload = xhr.responseText ? JSON.parse(xhr.responseText) : xhr.response;
              resolve(payload as CandidateResult);
            } else {
              const body = (xhr.responseText || '').toString();
              const snippet = body.length > 220 ? body.slice(0, 220) + '…' : body;
              reject(new Error(snippet || `Upload failed (${xhr.status})`));
            }
          } catch (err) {
            reject(err);
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload.'));

        const formData = new FormData();
        formData.append('job_description', jobDescription);
        formData.append('file', file);
        xhr.send(formData);
      });
    },
    []
  );

  const handleStartScreening = useCallback(
    async (jobDescription: string) => {
      setScreening(true);
      setCandidates([]);
      try {
        for (const item of uploadItems) {
          updateUploadItem(item.id, { status: 'uploading', progress: 0, error: undefined });
          try {
            const result = await uploadScreenOne(item.file, jobDescription, (p) => {
              // When upload reaches 100%, backend is now processing (LLM) while the request completes.
              if (p >= 100) {
                updateUploadItem(item.id, { status: 'processing', progress: 100 });
              } else {
                updateUploadItem(item.id, { status: 'uploading', progress: p });
              }
            });

            if (isAiErrorResult(result)) {
              updateUploadItem(item.id, {
                status: 'error',
                progress: 100,
                error: result.summary,
              });
            } else {
              updateUploadItem(item.id, { status: 'done', progress: 100 });
              setCandidates((prev) => [...prev, result]);
            }
          } catch (e: unknown) {
            updateUploadItem(item.id, {
              status: 'error',
              progress: 100,
              error: e instanceof Error ? e.message : 'Failed to screen this file.',
            });
          }
        }
      } finally {
        setScreening(false);
      }
    },
    [uploadItems, updateUploadItem, uploadScreenOne, isAiErrorResult]
  );

  const handleChatSend = useCallback(
    async (message: string) => {
      if (!candidates.length) {
        setChatMessages((prev) => [
          ...prev,
          { id: makeId(), sender: 'user', text: message },
          { id: makeId(), sender: 'ai', text: 'Please screen resumes first, then ask questions.' },
        ]);
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userId = makeId();
      const aiId = makeId();

      // History excludes the current `message` (backend adds it as the last user turn).
      const history: ChatRequestHistoryTurn[] = historyForRequest;

      setChatMessages((prev) => [
        ...prev,
        { id: userId, sender: 'user', text: message },
        { id: aiId, sender: 'ai', text: '' },
      ]);

      setChatLoading(true);
      try {
        const res = await fetch(`${API_URL}/chat_stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            candidates,
            history,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Chat failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');

        let acc = '';
        let lastFlush = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          acc += chunk;
          const now = Date.now();
          if (now - lastFlush > 50) {
            lastFlush = now;
            setChatMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: acc } : m)));
          }
        }
        setChatMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: acc } : m)));
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          setChatMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: 'Cancelled.' } : m)));
          return;
        }
        const msg = e instanceof Error ? e.message : 'Error: Could not get AI response.';
        setChatMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: msg } : m)));
      } finally {
        setChatLoading(false);
      }
    },
    [candidates, historyForRequest]
  );

  const handleChatStop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setChatLoading(false);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-gray-100 flex flex-col items-center py-10 relative">
      <DarkModeToggle />

      <header className="w-full max-w-3xl px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600/10 text-blue-700 dark:text-blue-300 border border-blue-600/15 mb-4">
          <span className="font-semibold">AI Resume Screener</span>
          <span className="text-sm">Recruiter workflow</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-3">Screen resumes with structured AI results</h1>
        <p className="text-gray-600 dark:text-gray-300 text-lg mb-8">
          Upload PDFs, rank candidates automatically, then chat with the recruiter assistant using the screened context.
        </p>
      </header>

      <UploadSection
        uploadItems={uploadItems}
        onSelectFiles={handleSelectFiles}
        onRemoveFile={removeUploadItem}
        onStart={handleStartScreening}
        loading={screening}
      />

      <Leaderboard candidates={candidates} loading={screening} />
      <div className="w-full" />
      <ChatPanel onSend={handleChatSend} onStop={handleChatStop} messages={chatMessages} loading={chatLoading} />
    </div>
  );
}

export default App;
