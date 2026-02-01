import http from 'http';

export const extractToken = (req: http.IncomingMessage): string | null => {
  const cookies = req.headers.cookie || '';
  const match = cookies.match(/session=([^;]+)/);
  return match ? match[1] : null;
};
