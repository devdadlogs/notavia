type ErrorResponse = {
  response?: {
    data?: {
      error?: unknown;
    };
  };
  message?: unknown;
};

export function errorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const candidate = error as ErrorResponse;
  if (typeof candidate.response?.data?.error === 'string' && candidate.response.data.error.trim()) {
    return candidate.response.data.error;
  }
  if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message;
  return fallback;
}
