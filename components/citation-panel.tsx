'use client';

import { X, FileText } from 'lucide-react';
import type { Citation } from '@/lib/types';

interface CitationPanelProps {
  open: boolean;
  onClose: () => void;
  citation: Citation | null;
  allSources: Citation[];
}

export default function CitationPanel({
  open,
  onClose,
  citation,
  allSources,
}: CitationPanelProps) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white border-l border-border shadow-lg z-50 transform transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              Retrieved from your study materials
            </h2>
            <button
              onClick={onClose}
              className="rounded-md p-1 hover:bg-muted text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Active citation detail */}
            {citation && (
              <div className="rounded-lg border border-border bg-accent/30 p-4">
                <div className="flex items-start gap-3 mb-3">
                  <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {citation.source}
                    </p>
                    {citation.page && (
                      <p className="text-xs text-muted-foreground">
                        Page {citation.page}
                      </p>
                    )}
                    {citation.section && (
                      <p className="text-xs text-muted-foreground">
                        {citation.section}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-sm text-foreground leading-relaxed">
                  {citation.content}
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Rank #{citation.rank}</span>
                  <span>&middot;</span>
                  <span>
                    Relevance: {(citation.relevanceScore * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )}

            {/* All sources list */}
            {allSources.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  All Sources ({allSources.length})
                </h3>
                <div className="space-y-2">
                  {allSources.map((source, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        // Trigger parent to show this citation
                        const event = new CustomEvent('citation-click', {
                          detail: source,
                        });
                        window.dispatchEvent(event);
                      }}
                      className={`w-full text-left rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50 ${
                        citation?.rank === source.rank
                          ? 'border-primary bg-accent/20'
                          : 'border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground truncate">
                          {source.source}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">
                          #{source.rank}
                        </span>
                      </div>
                      {source.page && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Page {source.page}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {source.content}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {allSources.length === 0 && !citation && (
              <div className="text-center text-sm text-muted-foreground py-8">
                Citations from your study materials will appear here when you ask
                a question.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
