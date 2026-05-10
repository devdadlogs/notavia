import api from './api';

export interface AIResult {
  result: string;
}

export interface AIHealthStatus {
  status: 'online' | 'offline';
  models?: string[];
  error?: string;
}

export const aiService = {
  // Check if local AI engine is available
  checkHealth: async (): Promise<AIHealthStatus> => {
    const { data } = await api.get('/ai/health');
    return data;
  },

  // Summarize a note (brief or detailed)
  summarize: async (noteId: string, mode: 'brief' | 'detailed' = 'brief'): Promise<string> => {
    const { data } = await api.post<AIResult>('/ai/summarize', { noteId, mode });
    return data.result;
  },

  // Extract key points from a note
  extractKeyPoints: async (noteId: string): Promise<string> => {
    const { data } = await api.post<AIResult>('/ai/extract', { noteId });
    return data.result;
  },

  // Continue writing from content
  continueWriting: async (content: string): Promise<string> => {
    const { data } = await api.post<AIResult>('/ai/continue', { content });
    return data.result;
  },

  // Rewrite content in a style
  rewrite: async (content: string, style: 'formal' | 'casual' | 'concise' = 'formal'): Promise<string> => {
    const { data } = await api.post<AIResult>('/ai/rewrite', { content, style });
    return data.result;
  },

  // Suggest tags for a note
  suggestTags: async (noteId: string): Promise<string> => {
    const { data } = await api.post<AIResult>('/ai/suggest-tags', { noteId });
    return data.result;
  },

  // Sprout: Find related notes using semantic search
  sprout: async (noteId: string, content: string): Promise<any[]> => {
    const { data } = await api.post<{ results: any[] }>('/ai/sprout', { noteId, content });
    return data.results || [];
  },
};
