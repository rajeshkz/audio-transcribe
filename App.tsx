
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { TranscriptionEntry, LiveSessionState } from './types';
import { decode, decodeAudioData, createBlob } from './services/audioUtils';
import { TranscriptionView } from './components/TranscriptionView';

const App: React.FC = () => {
  const [entries, setEntries] = useState<TranscriptionEntry[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');
  const [sessionState, setSessionState] = useState<LiveSessionState>({
    isActive: false,
    isConnecting: false,
    error: null,
  });

  const nextStartTimeRef = useRef(0);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  const addEntry = (sender: 'user' | 'model', text: string) => {
    if (!text.trim()) return;
    setEntries(prev => [...prev, {
      id: crypto.randomUUID(),
      sender,
      text,
      timestamp: Date.now()
    }]);
  };

  const cleanupSession = useCallback(async () => {
    if (sessionPromiseRef.current) {
      const session = await sessionPromiseRef.current;
      session.close();
      sessionPromiseRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextsRef.current) {
      await audioContextsRef.current.input.close();
      await audioContextsRef.current.output.close();
      audioContextsRef.current = null;
    }

    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    
    setSessionState({ isActive: false, isConnecting: false, error: null });
    setCurrentInput('');
    setCurrentOutput('');
  }, []);

  const startSession = async () => {
    try {
      setSessionState(prev => ({ ...prev, isConnecting: true, error: null }));

      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key not found");

      const ai = new GoogleGenAI({ apiKey });

      // Initialize audio contexts
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextsRef.current = { input: inputCtx, output: outputCtx };

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setSessionState({ isActive: true, isConnecting: false, error: null });
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromiseRef.current?.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Transcription
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              setCurrentInput(prev => prev + text);
            } else if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              setCurrentOutput(prev => prev + text);
            }

            if (message.serverContent?.turnComplete) {
              setCurrentInput(text => {
                if (text) addEntry('user', text);
                return '';
              });
              setCurrentOutput(text => {
                if (text) addEntry('model', text);
                return '';
              });
            }

            // Handle Audio Playback
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextsRef.current) {
              const { output: outputCtx } = audioContextsRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Session error:', e);
            setSessionState(prev => ({ ...prev, error: 'Connection failed. Please try again.' }));
            cleanupSession();
          },
          onclose: () => {
            cleanupSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: "You are a helpful assistant that transcribes conversations accurately. Keep your responses concise as they will also be transcribed.",
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
        }
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err: any) {
      console.error('Failed to start session:', err);
      setSessionState({ isActive: false, isConnecting: false, error: err.message || 'Error starting session' });
      cleanupSession();
    }
  };

  const toggleSession = () => {
    if (sessionState.isActive || sessionState.isConnecting) {
      cleanupSession();
    } else {
      startSession();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/20">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Gemini Live</h1>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Real-time Transcriber</p>
          </div>
        </div>
        
        {sessionState.error && (
          <div className="hidden md:flex bg-red-900/20 border border-red-500/50 px-3 py-1 rounded text-red-400 text-xs items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {sessionState.error}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-4 md:p-8 max-w-4xl mx-auto w-full overflow-hidden">
        <TranscriptionView 
          entries={entries} 
          currentInput={currentInput}
          currentOutput={currentOutput}
        />
        
        {/* Controls Overlay Footer */}
        <div className="mt-6 flex flex-col items-center gap-4">
          {sessionState.error && (
            <div className="md:hidden bg-red-900/20 border border-red-500/50 px-3 py-1 rounded text-red-400 text-xs items-center gap-2">
               {sessionState.error}
            </div>
          )}

          <button
            onClick={toggleSession}
            disabled={sessionState.isConnecting}
            className={`group relative flex items-center justify-center p-6 rounded-full transition-all duration-300 transform active:scale-95 ${
              sessionState.isActive 
                ? 'bg-red-500 hover:bg-red-600 shadow-xl shadow-red-900/40' 
                : 'bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-900/40'
            } ${sessionState.isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {/* Pulsing indicator when active */}
            {sessionState.isActive && (
              <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-25" />
            )}
            
            <div className="relative z-10 text-white">
              {sessionState.isConnecting ? (
                <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : sessionState.isActive ? (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H10a1 1 0 01-1-1v-4z" />
                </svg>
              ) : (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </div>
          </button>
          
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-300">
              {sessionState.isConnecting ? 'Establishing connection...' : sessionState.isActive ? 'Recording in progress' : 'Start Recording'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Gemini 2.5 Pro Live • Raw PCM Transcription
            </p>
          </div>
        </div>
      </main>

      {/* Decorative Waveform Mockup */}
      {sessionState.isActive && (
        <div className="fixed bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-pulse opacity-50 shadow-lg shadow-blue-500/50" />
      )}
    </div>
  );
};

export default App;
