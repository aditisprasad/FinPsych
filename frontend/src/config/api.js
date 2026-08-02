const resolvedApiUrl = import.meta.env.VITE_API_URL?.trim() || 'https://finpsych.onrender.com';

export const API_URL = resolvedApiUrl;

export function buildApiUrl(path, email = '') {
  if (!path) {
    return API_URL;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!email) {
    return `${API_URL}${normalizedPath}`;
  }

  const separator = normalizedPath.includes('?') ? '&' : '?';
  return `${API_URL}${normalizedPath}${separator}email=${encodeURIComponent(email)}`;
}
