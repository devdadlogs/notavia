import api from './api';

export type TopicStatus = 'idea' | 'preparing' | 'writing' | 'ready' | 'published' | 'archived';
export type Platform = 'zhihu' | 'xiaohongshu' | 'short_video';

export interface Material {
  id: string; title: string; contentText: string; transcript?: string;
  transcriptSummary?: string; sourceType?: string; sourceUrl?: string; sourceHtml?: string;
  audioUrl?: string; creatorNotes?: string; materialStatus?: 'inbox' | 'distilled' | 'used' | 'later';
  insights?: MaterialInsight[]; ideas?: MaterialIdea[]; updatedAt: string;
}

export interface MaterialIdea {
  id: string; noteId: string; sourceTitle?: string; content: string; sourceExcerpt?: string;
  createdAt: string; updatedAt: string; topicLinks?: Array<{ topicId: string; title: string }>;
}

export interface MaterialInsight {
  id?: string;
  type: 'summary' | 'relevance' | 'viewpoint' | 'case' | 'experience' | 'fact' | 'verify' | 'angle';
  content: string;
}

export interface MaterialInsightStatus {
  status: 'idle' | 'processing' | 'ready' | 'error';
  items?: MaterialInsight[];
  error?: string;
}

export interface Citation {
  id: string; noteId?: string; marker: string; sourceTitle: string;
  sourceExcerpt: string; sourceAvailable: boolean;
}

export interface Work {
  id: string; topicId: string; parentId?: string; platform: Platform;
  title: string; content: string; contentJson?: string; status: string; citations?: Citation[];
  publications?: Publication[]; updatedAt: string;
}

export interface Topic {
  id: string; title: string; coreQuestion: string; targetAudience: string;
  conclusion: string; desiredAction: string; status: TopicStatus;
  materials?: Array<{ noteId: string; note?: Material }>;
  ideas?: Array<{ ideaId: string; idea?: MaterialIdea }>;
  works?: Work[]; createdAt: string; updatedAt: string;
}

export interface TopicBriefSuggestion {
  title: string; coreQuestion: string; targetAudience: string;
  conclusion: string; desiredAction: string; reason: string;
}

export interface TopicCoverageItem {
  noteId: string;
  title: string;
  content: string;
}

export interface TopicCoverageGap {
  key: string;
  label: string;
  message: string;
  required: boolean;
}

export interface TopicCoverage {
  materialCount: number;
  viewpointCount: number;
  factCount: number;
  verificationItems: TopicCoverageItem[];
  gaps: TopicCoverageGap[];
  readyForDraft: boolean;
}

export interface Publication {
  id: string; workId: string; platform: string; url: string; publishedAt: string;
  views: number; likes: number; favorites: number; comments: number; notes: string;
}

export interface StyleIssue {
  type: 'clarity' | 'repetition' | 'cliche' | 'banned_phrase' | 'invented_experience' | 'anxiety' | 'unsourced_fact' | 'tone';
  severity: 'high' | 'medium' | 'low'; quote?: string; message: string;
  suggestion?: string; replacement?: string;
}

export const creatorService = {
  listTopics: async () => (await api.get<Topic[]>('/topics')).data,
  getTopic: async (id: string) => (await api.get<Topic>(`/topics/${id}`)).data,
  createTopic: async (payload: Partial<Topic>) => (await api.post<Topic>('/topics', payload)).data,
  updateTopic: async (id: string, payload: Partial<Topic>) => (await api.put<Topic>(`/topics/${id}`, payload)).data,
  addMaterial: async (topicId: string, noteId: string) => (await api.post(`/topics/${topicId}/materials`, { noteId })).data,
  removeMaterial: async (topicId: string, noteId: string) => api.delete(`/topics/${topicId}/materials/${noteId}`),
  listIdeas: async (noteId: string) => (await api.get<MaterialIdea[]>(`/materials/${noteId}/ideas`)).data,
  listAllIdeas: async (limit?: number) => (
    await api.get<MaterialIdea[]>('/materials/ideas', { params: limit ? { limit } : undefined })
  ).data,
  createIdea: async (noteId: string, payload: Pick<MaterialIdea, 'content' | 'sourceExcerpt'>) => (await api.post<MaterialIdea>(`/materials/${noteId}/ideas`, payload)).data,
  updateIdea: async (noteId: string, ideaId: string, payload: Pick<MaterialIdea, 'content' | 'sourceExcerpt'>) => (await api.put<MaterialIdea>(`/materials/${noteId}/ideas/${ideaId}`, payload)).data,
  deleteIdea: async (noteId: string, ideaId: string) => api.delete(`/materials/${noteId}/ideas/${ideaId}`),
  addIdea: async (topicId: string, ideaId: string) => (await api.post(`/topics/${topicId}/ideas`, { ideaId })).data,
  removeIdea: async (topicId: string, ideaId: string) => api.delete(`/topics/${topicId}/ideas/${ideaId}`),
  listMaterials: async (query = '') => (await api.get<Material[]>('/materials', { params: { q: query } })).data,
  retrieve: async (query: string) => (await api.post('/creator-ai/retrieve', { query, limit: 12 })).data.results,
  extractInsights: async (noteId: string) => (await api.post<MaterialInsightStatus>('/creator-ai/insights', { noteId })).data,
  getInsightStatus: async (noteId: string) => (await api.get<MaterialInsightStatus>(`/creator-ai/insights/${noteId}/status`)).data,
  getTopicCoverage: async (topicId: string) => (await api.get<TopicCoverage>(`/topics/${topicId}/coverage`)).data,
  suggestTopicBrief: async (topicId: string) => (await api.post<TopicBriefSuggestion>('/creator-ai/topic-brief', { topicId })).data,
  generateDraft: async (topicId: string, materialIds: string[]) => (await api.post('/creator-ai/draft', { topicId, materialIds })).data,
  reviewStyle: async (workId: string) => (await api.post<{ issues: StyleIssue[] }>('/creator-ai/style-review', { workId })).data,
  transform: async (workId: string, platform: Platform) => (await api.post('/creator-ai/transform', { workId, platform })).data,
  updateWork: async (id: string, payload: Partial<Work> & Record<string, unknown>) => (await api.put<Work>(`/works/${id}`, payload)).data,
  createPublication: async (payload: Partial<Publication>) => (await api.post<Publication>('/publications', payload)).data,
  metrics: async () => (await api.get('/metrics/validation')).data,
  getStyleProfile: async () => (await api.get('/style-profile')).data,
  updateStyleProfile: async (payload: Record<string, unknown>) => (await api.put('/style-profile', payload)).data,
};
