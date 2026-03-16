import React, { createContext, useContext, useState, useCallback } from 'react';
import { User, UserPreferences } from '@/types/game';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  register: (data: RegisterData) => boolean;
  logout: () => void;
  updateProfile: (updates: Partial<User>) => void;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  birthday: string;
  country: string;
  countryCode: string;
  avatar: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

const defaultPrefs: UserPreferences = {
  boardTheme: 'classic',
  checkerColor: 'white',
  soundEnabled: true,
  animationsEnabled: true,
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('checkers_user');
    return stored ? JSON.parse(stored) : null;
  });

  const getUsers = (): (User & { password: string })[] => {
    const stored = localStorage.getItem('checkers_users');
    return stored ? JSON.parse(stored) : [];
  };

  const saveUsers = (users: (User & { password: string })[]) => {
    localStorage.setItem('checkers_users', JSON.stringify(users));
  };

  const login = useCallback((username: string, password: string): boolean => {
    const users = getUsers();
    const found = users.find(u => u.username === username && u.password === password);
    if (found) {
      const { password: _, ...userData } = found;
      setUser(userData);
      localStorage.setItem('checkers_user', JSON.stringify(userData));
      return true;
    }
    return false;
  }, []);

  const register = useCallback((data: RegisterData): boolean => {
    const users = getUsers();
    if (users.some(u => u.username === data.username)) return false;
    const newUser: User & { password: string } = {
      id: crypto.randomUUID(),
      username: data.username,
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      birthday: data.birthday,
      avatar: data.avatar,
      country: data.country,
      countryCode: data.countryCode,
      isOnline: true,
      stats: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
      preferences: defaultPrefs,
    };
    saveUsers([...users, newUser]);
    const { password: _, ...userData } = newUser;
    setUser(userData);
    localStorage.setItem('checkers_user', JSON.stringify(userData));
    return true;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('checkers_user');
  }, []);

  const updateProfile = useCallback((updates: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      localStorage.setItem('checkers_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
