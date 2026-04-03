import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChatUiMessage } from '../types';

interface ChatPanelProps {
  onSend: (message: string) => Promise<void>;
  onStop: () => void;
  messages: ChatUiMessage[];
  loading: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ onSend, onStop, messages, loading }: ChatPanelProps) => {
  const [input, setInput] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const aiTyping = loading;

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    await onSend(trimmed);
  };

  const rendered = useMemo(() => messages, [messages]);

  return (
    <section className="w-full max-w-3xl mx-auto mt-10 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Recruiter Chat</h2>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {rendered.length === 0 ? 'Ask questions after screening.' : 'Streaming responses enabled.'}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="h-72 overflow-y-auto mb-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900"
      >
        {rendered.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Try: <span className="font-medium">“Who has the strongest Python background?”</span>
          </div>
        ) : (
          <div className="space-y-3">
            {rendered.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {aiTyping && (
              <div className="flex justify-start">
                <div className="rounded-xl px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                  AI is typing…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 p-3 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={input}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Ask about the candidates (e.g., “Compare candidate 1 and 3”)"
          disabled={loading}
        />
        {loading ? (
          <button
            className="px-5 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            onClick={onStop}
          >
            Stop
          </button>
        ) : (
          <button
            className="px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            onClick={() => void handleSend()}
            disabled={!input.trim()}
          >
            Send
          </button>
        )}
      </div>
    </section>
  );
};

export default ChatPanel;
