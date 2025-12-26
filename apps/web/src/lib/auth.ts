export interface User {
  id: string;
  username: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

// Simple auth state (localStorage-based)
const authState: { user: User | null; token: string | null } = {
  user: null,
  token: null,
};

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('token', token);
  authState.token = token;
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  authState.token = null;
  authState.user = null;
}

export function getUser(): User | null {
  if (typeof window === 'undefined') return null;
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr) as User;
  } catch {
    return null;
  }
}

export function setUser(user: User): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('user', JSON.stringify(user));
  authState.user = user;
}

export function isAuthenticated(): boolean {
  return !!getAuthToken() && !!getUser();
}

export function login(user: User, token: string): void {
  setAuthToken(token);
  setUser(user);
}

export function logout(): void {
  clearAuthToken();
  window.location.href = '/';
}
