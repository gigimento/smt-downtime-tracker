import React, { useState, useEffect, useCallback } from 'react';
import type { User } from '../types';
import { authApi } from '../services/api';
import { AuthContext } from './auth-context';

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (badgeCode: string, pinCode?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('access_token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const response = await authApi.me();
      setUser(response.data);
      localStorage.setItem('user', JSON.stringify(response.data));
    } catch {
      logout();
    }
  }, [logout, token]);

  const login = useCallback(async (badgeCode: string, pinCode?: string) => {
    const response = await authApi.login({ badge_code: badgeCode, pin_code: pinCode });
    const { access_token } = response.data;
    
    setToken(access_token);
    localStorage.setItem('access_token', access_token);
    
    // Fetch user info
    const userResponse = await authApi.me();
    setUser(userResponse.data);
    localStorage.setItem('user', JSON.stringify(userResponse.data));
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
