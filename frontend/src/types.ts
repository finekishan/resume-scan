export interface CandidateResult {
  name: string;
  score: number;
  strengths: string[];
  gaps: string[];
  summary: string;
}

export type ChatUiMessage = {
  id: string;
  sender: 'user' | 'ai';
  text: string;
};

export type ChatRequestHistoryTurn = {
  role: 'user' | 'assistant';
  content: string;
};
