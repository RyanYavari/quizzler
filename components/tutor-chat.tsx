'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Citation } from '@/lib/types';

interface TutorChatProps {
  sessionId: string;
  userAnswers: Record<string, number>;
  score: number;
  total: number;
}

interface ParsedMessage {
  text: string;
  citations: Citation[];
}

// Parse message content to extract text and citations
function parseMessageContent(content: string): ParsedMessage {
  const citationMatch = content.match(/<citations>([\s\S]*?)<\/citations>/);
  if (!citationMatch) {
    return { text: content, citations: [] };
  }

  const text = content.replace(/<citations>[\s\S]*?<\/citations>/, '').trim();
  try {
    const citations = JSON.parse(citationMatch[1]) as Citation[];
    return { text, citations };
  } catch {
    return { text: content, citations: [] };
  }
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
  const [openCitationId, setOpenCitationId] = useState<string | null>(null);
  const [messageCitations, setMessageCitations] = useState<Map<number, Citation[]>>(new Map());
  const pendingCitationsRef = useRef<Citation[] | null>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/tutor',
      body: { sessionId, userAnswers, score, total },
    }),
    onData: (data) => {
      console.log('[TutorChat] onData fired:', data);
      const d = data as unknown as { type?: string; data?: Citation[] };
      console.log('[TutorChat] Parsed data:', { type: d.type, hasData: Array.isArray(d.data), length: d.data?.length });
      if (d.type === 'data-sources' && Array.isArray(d.data)) {
        // Store citations temporarily until the message appears
        console.log('[TutorChat] Received citations:', d.data.length);
        pendingCitationsRef.current = d.data;
      } else {
        console.log('[TutorChat] Data event not matching expected format');
      }
    },
  });

  // Associate pending citations with the latest assistant message
  useEffect(() => {
    if (pendingCitationsRef.current && messages.length > 0) {
      const lastIndex = messages.length - 1;
      const lastMessage = messages[lastIndex];

      if (lastMessage && lastMessage.role === 'assistant') {
        // Capture citations before clearing the ref
        const citations = pendingCitationsRef.current;
        pendingCitationsRef.current = null;

        console.log('[TutorChat] Associating citations with message index:', lastIndex, 'count:', citations.length);
        setMessageCitations(prev => {
          const next = new Map(prev);
          next.set(lastIndex, citations);
          console.log('[TutorChat] Map after update - size:', next.size, 'keys:', Array.from(next.keys()), 'value at', lastIndex, ':', next.get(lastIndex)?.length);
          return next;
        });
      }
    }
  }, [messages]);

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
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
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
          .map((message, index) => {
            // Extract full text content from parts
            const fullContent = message.parts
              ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join('') || '';

            // Get citations from Map using original index (before filter)
            const originalIndex = messages.findIndex(m => m.id === message.id);
            const citations = messageCitations.get(originalIndex) || [];
            if (message.role === 'assistant') {
              console.log('[TutorChat] Rendering assistant message:', message.id, 'index:', originalIndex, 'citations:', citations.length, 'mapSize:', messageCitations.size, 'mapHasIndex:', messageCitations.has(originalIndex));
            }

            return (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div className="max-w-[90%] space-y-2">
                  <div
                    className={`rounded-xl px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {message.role === 'user' ? (
                      // User messages: simple text, no markdown
                      <span className="whitespace-pre-wrap">{fullContent}</span>
                    ) : (
                      // Assistant messages: render markdown
                      <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:mt-2 prose-headings:mb-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {fullContent}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {/* Citation pills for assistant messages */}
                  {message.role === 'assistant' && citations.length > 0 && (
                    <div className="space-y-2">
                      {/* Numbered pills */}
                      <div className="flex flex-wrap gap-1.5 px-1">
                        {citations.map((citation, idx) => {
                          const citationId = `${originalIndex}-${idx}`;
                          const isOpen = openCitationId === citationId;

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('[Citation] Clicked pill', idx + 1, 'Current:', openCitationId, 'Setting:', isOpen ? null : citationId);
                                setOpenCitationId(isOpen ? null : citationId);
                              }}
                              className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 text-xs font-medium rounded-md bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 hover:border-indigo-400/50 transition-all cursor-pointer"
                            >
                              [{idx + 1}]
                            </button>
                          );
                        })}
                      </div>

                      {/* Expanded citation card */}
                      {citations.map((citation, idx) => {
                        const citationId = `${originalIndex}-${idx}`;
                        const isOpen = openCitationId === citationId;

                        if (!isOpen) return null;

                        return (
                          <div
                            key={idx}
                            className="rounded-lg bg-card border-l-4 border-indigo-500 p-3 space-y-2 animate-in slide-in-from-top-2 duration-200"
                          >
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-semibold text-sm text-foreground">
                                Source: {citation.source}
                                {citation.page && `, Page ${citation.page}`}
                              </div>
                              <div className="shrink-0 px-2 py-0.5 rounded-md bg-indigo-600/20 text-indigo-300 text-xs font-medium border border-indigo-500/30">
                                Score: {(citation.relevanceScore * 100).toFixed(0)}%
                              </div>
                            </div>

                            {/* Content */}
                            <blockquote className="pl-3 border-l-2 border-indigo-500/40 text-sm text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap">
                              {citation.content}
                            </blockquote>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 border-t border-border bg-card shrink-0"
      >
        <div className="flex gap-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about your study material..."
            disabled={isLoading}
            className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="rounded-lg bg-primary text-primary-foreground p-2 hover:bg-primary/90 shadow-md shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
