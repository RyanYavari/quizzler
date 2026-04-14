'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Send, Loader2 } from 'lucide-react';
import type { Citation } from '@/lib/types';
import CitationBlock from './citation-block';

interface TutorChatProps {
  sessionId: string;
  userAnswers: Record<string, number>;
  score: number;
  total: number;
}

export default function TutorChat({
  sessionId,
  userAnswers,
  score,
  total,
}: TutorChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasSentInitial = useRef(false);
  const [inputValue, setInputValue] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/tutor',
      body: { sessionId, userAnswers, score, total },
    }),
    onData: (data) => {
      const d = data as unknown as { type?: string; data?: Citation[] };
      if (d.type === 'data-sources' && Array.isArray(d.data)) {
        setCitations(d.data);
      }
    },
  });

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Send proactive first message
  useEffect(() => {
    if (hasSentInitial.current) return;
    hasSentInitial.current = true;

    sendMessage({
      text: 'I just finished the quiz. Can you help me review my results? Focus on the questions I got wrong and help me understand the correct answers.',
    });
  }, [sendMessage]);

  const isLoading = status === 'streaming' || status === 'submitted';

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || isLoading) return;
      sendMessage({ text: inputValue.trim() });
      setInputValue('');
    },
    [inputValue, isLoading, sendMessage]
  );

  return (
    <div className="flex flex-col h-full border-l border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-white shrink-0">
        <h3 className="font-semibold text-sm text-foreground">Study Tutor</h3>
        <p className="text-xs text-muted-foreground">
          Ask about anything from your study material
        </p>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages
          .filter((m) => m.role !== 'system')
          .map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                {message.parts?.map((part, i) => {
                  if (part.type === 'text') {
                    return (
                      <span key={i} className="whitespace-pre-wrap">
                        {part.text}
                      </span>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        {/* Show citations after assistant messages */}
        {citations.length > 0 &&
          messages[messages.length - 1]?.role === 'assistant' && (
            <div className="space-y-1">
              {citations.map((c, i) => (
                <CitationBlock key={i} citation={c} />
              ))}
            </div>
          )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 border-t border-border bg-white shrink-0"
      >
        <div className="flex gap-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about your study material..."
            disabled={isLoading}
            className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="rounded-lg bg-primary text-primary-foreground p-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
