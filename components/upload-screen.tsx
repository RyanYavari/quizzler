'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, ClipboardPaste } from 'lucide-react';

interface UploadScreenProps {
  onUpload: (data: FormData | { text: string; questionCount: number }) => void;
}

const QUESTION_COUNTS = [5, 10, 15, 20] as const;
const MAX_PASTE_LENGTH = 10000;

export default function UploadScreen({ onUpload }: UploadScreenProps) {
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.pdf') || file.name.endsWith('.txt'))) {
      setSelectedFile(file);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFile(file);
      }
    },
    []
  );

  const handleSubmit = useCallback(() => {
    if (mode === 'file' && selectedFile) {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('questionCount', String(questionCount));
      onUpload(formData);
    } else if (mode === 'paste' && pastedText.trim()) {
      onUpload({ text: pastedText.trim(), questionCount });
    }
  }, [mode, selectedFile, pastedText, questionCount, onUpload]);

  const canSubmit =
    (mode === 'file' && selectedFile) ||
    (mode === 'paste' && pastedText.trim().length > 0);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-4">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">
            Upload your study material
          </h2>
          <p className="text-muted-foreground">
            Upload a PDF or text file, or paste your notes directly
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg bg-muted p-1">
          <button
            onClick={() => setMode('file')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'file'
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Upload className="h-4 w-4" />
            Upload File
          </button>
          <button
            onClick={() => setMode('paste')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'paste'
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ClipboardPaste className="h-4 w-4" />
            Paste Text
          </button>
        </div>

        {/* File upload area */}
        {mode === 'file' && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-primary bg-accent/50'
                : selectedFile
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-border hover:border-primary/50 hover:bg-accent/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt"
              onChange={handleFileSelect}
              className="hidden"
            />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-10 w-10 text-emerald-400" />
                <p className="font-medium text-emerald-300">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB — Click to change
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium text-foreground">
                  Drop your file here or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports PDF and TXT files
                </p>
              </div>
            )}
          </div>
        )}

        {/* Paste text area */}
        {mode === 'paste' && (
          <div className="space-y-2">
            <textarea
              value={pastedText}
              onChange={(e) =>
                setPastedText(e.target.value.slice(0, MAX_PASTE_LENGTH))
              }
              placeholder="Paste your study notes, lecture text, or any content you want to be quizzed on..."
              className="w-full h-48 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
            <p className="text-xs text-muted-foreground text-right">
              {pastedText.length.toLocaleString()} / {MAX_PASTE_LENGTH.toLocaleString()} characters
            </p>
          </div>
        )}

        {/* Question count */}
        <div className="space-y-2">
          <label
            htmlFor="question-count"
            className="text-sm font-medium text-foreground"
          >
            Number of questions
          </label>
          <select
            id="question-count"
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          >
            {QUESTION_COUNTS.map((count) => (
              <option key={count} value={count}>
                {count} questions
              </option>
            ))}
          </select>
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium text-sm transition-all hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          Generate Quiz
        </button>
      </div>
    </div>
  );
}
