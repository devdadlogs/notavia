import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  withCredentials: true, // Important for sending cookies automatically
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle global errors, e.g., redirect to login on 401
    if (error.response?.status === 401) {
      // Trigger a store action or event to logout
      console.warn('Unauthorized, redirecting to login...');
    }
    return Promise.reject(error);
  }
);
export const uploadFile = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  // URL returned is usually like "/uploads/filename.jpg"
  // If the backend runs on a different port, prepend the API base URL domain
  const baseURL = api.defaults.baseURL?.replace('/api', '') || 'http://localhost:3001';
  return baseURL + response.data.url;
};

export default api;
