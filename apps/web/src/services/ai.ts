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

  // Fetch SSE helper for streaming endpoints
  fetchSSE: async (endpoint: string, payload: any, onChunk: (text: string) => void): Promise<string> => {
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const response = await fetch(`${baseURL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include',
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI error (${response.status}): ${errText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return '';
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (part.includes('event:error') || part.includes('event: error')) {
          const dataLine = part.split('\n').find(l => l.startsWith('data:') || l.startsWith('data: '));
          const errText = dataLine ? dataLine.replace(/^data:\s*/, '') : 'AI Streaming Error';
          throw new Error(errText);
        }
        
        // Accept both "event: message", "event:message", or default empty event (just data)
        if (part.includes('data:') || part.includes('data: ')) {
          const dataLines = part.split('\n').filter(l => l.startsWith('data:') || l.startsWith('data: '));
          if (dataLines.length > 0) {
            const chunk = dataLines.map(l => l.replace(/^data:\s*/, '')).join('\n');
            fullText += chunk;
            onChunk(fullText);
          }
        }
      }
    }
    return fullText;
  },

  // Summarize a note (brief or detailed)
  summarize: async (noteId: string, mode: 'brief' | 'detailed' = 'brief', onChunk?: (text: string) => void): Promise<string> => {
    if (onChunk) return aiService.fetchSSE('/ai/summarize', { noteId, mode }, onChunk);
    const { data } = await api.post<AIResult>('/ai/summarize', { noteId, mode });
    return data.result;
  },

  // Extract key points from a note
  extractKeyPoints: async (noteId: string, onChunk?: (text: string) => void): Promise<string> => {
    if (onChunk) return aiService.fetchSSE('/ai/extract', { noteId }, onChunk);
    const { data } = await api.post<AIResult>('/ai/extract', { noteId });
    return data.result;
  },

  // Continue writing from content
  continueWriting: async (content: string, onChunk?: (text: string) => void): Promise<string> => {
    if (onChunk) return aiService.fetchSSE('/ai/continue', { content }, onChunk);
    const { data } = await api.post<AIResult>('/ai/continue', { content });
    return data.result;
  },

  // Rewrite content in a style
  rewrite: async (content: string, style: 'formal' | 'casual' | 'concise' = 'formal', onChunk?: (text: string) => void): Promise<string> => {
    if (onChunk) return aiService.fetchSSE('/ai/rewrite', { content, style }, onChunk);
    const { data } = await api.post<AIResult>('/ai/rewrite', { content, style });
    return data.result;
  },

  // Suggest tags for a note
  suggestTags: async (noteId: string, onChunk?: (text: string) => void): Promise<string> => {
    if (onChunk) return aiService.fetchSSE('/ai/suggest-tags', { noteId }, onChunk);
    const { data } = await api.post<AIResult>('/ai/suggest-tags', { noteId });
    return data.result;
  },

  // Sprout: Find related notes using semantic search
  sprout: async (noteId: string, content: string): Promise<any[]> => {
    const { data } = await api.post<{ results: any[] }>('/ai/sprout', { noteId, content });
    return data.results || [];
  },

  // Direct generic chat
  chat: async (prompt: string): Promise<{ text: string }> => {
    // If backend doesn't have a direct /ai/chat, we can proxy it through /ai/chat-with-notes but bypassing vector if possible
    // Or we just use a generic endpoint if it exists. 
    // Wait, let's see if the backend has /ai/chat. If not, I'll add it to the backend too.
    const { data } = await api.post<{ reply: string }>('/ai/chat', { prompt });
    return { text: data.reply };
  },
};
