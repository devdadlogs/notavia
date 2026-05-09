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

export default api;
