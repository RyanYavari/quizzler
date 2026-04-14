'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Citation } from '@/lib/types';

interface CitationBlockProps {
  citation: Citation;
}

export default function CitationBlock({ citation }: CitationBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const label = `[Source: ${citation.source}${citation.page ? `, Page ${citation.page}` : ''}]`;

  return (
    <div className="my-2 rounded-lg border border-border bg-accent/30 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-accent/50 transition-colors rounded-lg"
      >
        <span className="text-primary font-medium">{label}</span>
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-2 text-muted-foreground border-t border-border pt-2 fade-in">
          {citation.content}
        </div>
      )}
    </div>
  );
}
