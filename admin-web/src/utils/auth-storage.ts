const TOKEN_KEY = 'admin_access_token';
const ADMIN_KEY = 'admin_profile';

export type StoredAdmin = {
  id: string;
  username: string;
  displayName: string | null;
};

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getStoredAdmin(): StoredAdmin | null {
  const raw = localStorage.getItem(ADMIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAdmin;
  } catch {
    return null;
  }
}

export function setStoredAdmin(admin: StoredAdmin): void {
  localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
}

export function clearStoredAdmin(): void {
  localStorage.removeItem(ADMIN_KEY);
}

export function clearAuthStorage(): void {
  clearAccessToken();
  clearStoredAdmin();
}
