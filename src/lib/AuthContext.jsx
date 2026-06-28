// src/lib/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// 🔒 СПИСОК ДОЗВОЛЕНИХ EMAIL
const ALLOWED_EMAILS = [
  'imilab0102@gmail.com',
  'admin@example.com',
  'user@company.com',
  // Додайте сюди всі email, яким ви хочете дозволити доступ
];

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Перевірка, чи email дозволений
  const isEmailAllowed = (email) => {
    if (!email) return false;
    return ALLOWED_EMAILS.includes(email.toLowerCase());
  };

  const checkAppState = async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);

      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;

      if (session && session.user) {
        const userEmail = session.user.email;
        
        // Перевіряємо, чи email дозволений
        if (isEmailAllowed(userEmail)) {
          setIsAuthenticated(true);
          setUser(session.user);
          setIsAuthorized(true);
        } else {
          // Користувач не в списку дозволених
          setIsAuthenticated(false);
          setUser(null);
          setIsAuthorized(false);
          setAuthError({
            type: 'unauthorized',
            message: 'Ваш email не має доступу до цього додатку'
          });
          
          // Виходимо з системи
          await supabase.auth.signOut();
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setIsAuthorized(false);
      }
    } catch (error) {
      console.error('App state check failed:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'Failed to load app state'
      });
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    checkAppState();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setIsLoadingAuth(true);
      
      if (session && session.user) {
        const userEmail = session.user.email;
        
        if (isEmailAllowed(userEmail)) {
          setIsAuthenticated(true);
          setUser(session.user);
          setIsAuthorized(true);
          setAuthError(null);
        } else {
          setIsAuthenticated(false);
          setUser(null);
          setIsAuthorized(false);
          setAuthError({
            type: 'unauthorized',
            message: 'Ваш email не має доступу до цього додатку'
          });
          await supabase.auth.signOut();
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setIsAuthorized(false);
      }
      setIsLoadingAuth(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    try {
      setIsLoadingAuth(true);
      await supabase.auth.signOut();
      setUser(null);
      setIsAuthenticated(false);
      setIsAuthorized(false);
    } catch (err) {
      console.error('Помилка виходу:', err);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const navigateToLogin = () => {
    console.log("Навігація на логін...");
  };

  return (
    <AuthContext.Provider value={{ 
      user,
      isAuthenticated,
      isAuthorized,
      isLoadingAuth,
      authError,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
