'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';
import { Send, BookOpen, Loader2 } from 'lucide-react';
import type { Citation } from '@/lib/types';

interface ChatInterfaceProps {
  onCitationClick: (citation: Citation) => void;
  onSourcesReceived: (sources: Citation[]) => void;
}

export default function ChatInterface({
  onCitationClick,
  onSourcesReceived,
}: ChatInterfaceProps) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, data } =
    useChat({ api: '/api/chat' });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Extract sources from data stream
  useEffect(() => {
    if (!data || data.length === 0) return;
    const sourcesEntry = data.find(
      (d: unknown) =>
        d && typeof d === 'object' && (d as Record<string, unknown>).type === 'data-sources'
    ) as { type: string; data: Citation[] } | undefined;
    if (sourcesEntry) {
      onSourcesReceived(sourcesEntry.data);
    }
  }, [data, onSourcesReceived]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mb-4 opacity-50" />
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Ready to help you study
            </h2>
            <p className="text-sm max-w-md">
              Ask a question about your uploaded course materials and I&apos;ll
              find the answer with citations from your documents.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {message.parts?.map((part, i) => {
                if (part.type === 'text') {
                  return <span key={i}>{part.text}</span>;
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching your study materials...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-white px-6 py-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask a question about your study materials..."
            className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input?.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
