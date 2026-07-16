import { create } from 'zustand';
import api from '../services/api';

interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  llmProvider?: string;
  openAiBaseUrl?: string;
  openAiKey?: string;
  openAiModel?: string;
  termsVersion?: string;
  privacyVersion?: string;
  onboardingCompletedAt?: string | null;
  cloudAiConsentVersion?: string;
  cloudAiConsentAt?: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  checkAuth: async () => {
    try {
      set({ isLoading: true });
      const { data } = await api.get('/auth/me');
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },

  updateUser: (data) => set((state) => ({
    user: state.user ? { ...state.user, ...data } : null
  }))
}));
