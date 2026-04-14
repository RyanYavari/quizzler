'use client';

interface ResizableDividerProps {
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

export default function ResizableDivider({
  isDragging,
  onMouseDown,
  onDoubleClick,
}: ResizableDividerProps) {
  return (
    <div
      role="separator"
      aria-label="Resize panels"
      aria-orientation="vertical"
      aria-valuemin={30}
      aria-valuemax={80}
      className={`
        relative w-1 cursor-col-resize transition-all duration-200
        border-l border-border/50
        hover:w-1.5 hover:bg-muted/30 hover:animate-divider-pulse
        ${isDragging ? 'ring-2 ring-primary bg-primary/20 w-1.5' : ''}
      `}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      style={{ userSelect: 'none' }}
    >
      {/* Wider invisible hit area for easier grabbing */}
      <div className="absolute inset-y-0 -left-1 -right-1 w-4" />
    </div>
  );
}
