
import React, { useEffect, useRef } from 'react';
import { TranscriptionEntry } from '../types';

interface TranscriptionViewProps {
  entries: TranscriptionEntry[];
  currentInput: string;
  currentOutput: string;
}

export const TranscriptionView: React.FC<TranscriptionViewProps> = ({ 
  entries, 
  currentInput, 
  currentOutput 
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, currentInput, currentOutput]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900 rounded-xl border border-slate-800 shadow-inner" ref={scrollRef}>
      {entries.length === 0 && !currentInput && !currentOutput && (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
          <svg className="w-12 h-12 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <p className="text-sm font-medium">Ready to listen... Press the mic to start.</p>
        </div>
      )}

      {entries.map((entry) => (
        <div 
          key={entry.id} 
          className={`flex flex-col ${entry.sender === 'user' ? 'items-end' : 'items-start'}`}
        >
          <div className={`max-w-[85%] px-4 py-2 rounded-2xl ${
            entry.sender === 'user' 
              ? 'bg-blue-600 text-white rounded-tr-none' 
              : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
          }`}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{entry.text}</p>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold px-2">
            {entry.sender === 'user' ? 'You' : 'Gemini'}
          </span>
        </div>
      ))}

      {/* Streaming User Input */}
      {currentInput && (
        <div className="flex flex-col items-end">
          <div className="max-w-[85%] px-4 py-2 rounded-2xl bg-blue-600/50 text-white/80 rounded-tr-none animate-pulse">
            <p className="text-sm leading-relaxed italic">{currentInput}...</p>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold px-2">
            Transcribing...
          </span>
        </div>
      )}

      {/* Streaming Model Output */}
      {currentOutput && (
        <div className="flex flex-col items-start">
          <div className="max-w-[85%] px-4 py-2 rounded-2xl bg-slate-800/50 text-slate-300 rounded-tl-none border border-slate-700/50 animate-pulse">
            <p className="text-sm leading-relaxed italic">{currentOutput}...</p>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold px-2">
            Gemini is responding...
          </span>
        </div>
      )}
    </div>
  );
};
