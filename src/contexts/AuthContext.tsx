import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getAdminMe, adminLogin, adminLogout } from '@/lib/api-client';
import type { AdminUser } from '@/lib/api-types';

interface AuthContextType {
  user: AdminUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const checkAuth = useCallback(async () => {
    try {
      const { user } = await getAdminMe();
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);
  
  const login = async (emailOrUsername: string, password: string) => {
    const { user } = await adminLogin(emailOrUsername, password);
    setUser(user);
  };
  
  const logout = async () => {
    await adminLogout();
    setUser(null);
  };
  
  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
