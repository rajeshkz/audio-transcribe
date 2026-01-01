
export interface TranscriptionEntry {
  id: string;
  sender: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface LiveSessionState {
  isActive: boolean;
  isConnecting: boolean;
  error: string | null;
}
