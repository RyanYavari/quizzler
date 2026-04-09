'use client';

import { useState, useCallback } from 'react';
import { GraduationCap } from 'lucide-react';
import ChatInterface from '@/components/chat-interface';
import CitationPanel from '@/components/citation-panel';
import type { Citation } from '@/lib/types';

export default function Home() {
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sources, setSources] = useState<Citation[]>([]);

  const handleCitationClick = useCallback((citation: Citation) => {
    setActiveCitation(citation);
    setIsSheetOpen(true);
  }, []);

  const handleSourcesReceived = useCallback((newSources: Citation[]) => {
    setSources(newSources);
  }, []);

  const handleSheetClose = useCallback(() => {
    setIsSheetOpen(false);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ---- Header ---- */}
      <header className="border-b border-border bg-white px-6 py-4 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-primary leading-tight">
                Quizzler
              </h1>
              <p className="text-xs text-muted-foreground">
                AI-powered study assistant with cited answers from your course materials
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Online
            </span>
          </div>
        </div>
      </header>

      {/* ---- Chat area ---- */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-5xl mx-auto h-full">
          <ChatInterface
            onCitationClick={handleCitationClick}
            onSourcesReceived={handleSourcesReceived}
          />
        </div>
      </main>

      {/* ---- Citation sidebar ---- */}
      <CitationPanel
        open={isSheetOpen}
        onClose={handleSheetClose}
        citation={activeCitation}
        allSources={sources}
      />
    </div>
  );
}
