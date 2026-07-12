// src/lib/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// 🔒 СПИСОК ДОЗВОЛЕНИХ EMAIL
const ALLOWED_EMAILS = [
  'imilab0102@gmail.com', // ← ВАШ EMAIL
  // Додайте сюди інші email, яким хочете дозволити доступ
  // 'admin@example.com',
  // 'user@company.com',
];

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [myTechnician, setMyTechnician] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [appPublicSettings] = useState({
    id: "imilab-app",
    public_settings: {
      features: { 
        finances: true, 
        priceList: true, 
        analytics: true,
        adminPanel: true 
      },
      is_active: true
    }
  });

  // 🔒 ПЕРЕВІРКА, ЧИ EMAIL ДОЗВОЛЕНИЙ
  const isEmailAllowed = (email) => {
    if (!email) return false;
    return ALLOWED_EMAILS.includes(email.toLowerCase());
  };

  // Функція створення профілю адміністратора
  const buildAdminProfile = (supabaseUser) => {
    if (!supabaseUser) return null;

    return {
      id: 1,
      user_id: supabaseUser.id,
      email: supabaseUser.email,
      username: "IMI Lab Власник",
      full_name: "IMI Lab Власник",
      phone_number: "",
      role: "admin", 
      user_role: "admin",
      type: "owner", 
      is_admin: true,
      isAdmin: true,
      is_owner: true,
      permissions: ["*"],
      access_level: "superadmin"
    };
  };

  const checkAppState = async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);

      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;

      if (session && session.user) {
        const userEmail = session.user.email;
        
        // 🔒 ПЕРЕВІРЯЄМО EMAIL
        if (isEmailAllowed(userEmail)) {
          setIsAuthenticated(true);
          const profile = buildAdminProfile(session.user);
          setUser(profile);
          setMyTechnician(profile);
          console.log('✅ Доступ дозволено для:', userEmail);
        } else {
          console.log('❌ Доступ заборонено для:', userEmail);
          setIsAuthenticated(false);
          setUser(null);
          setMyTechnician(null);
          setAuthError({
            type: 'user_not_registered',
            message: 'Ваш email не має доступу до цього додатку'
          });
          await supabase.auth.signOut();
        }
      } else {
        setUser(null);
        setMyTechnician(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('App state check failed:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'Failed to load app state'
      });
    } finally {
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
      setAuthChecked(true);
    }
  };

  // 🚀 ФУНКЦІЯ ВХОДУ ЧЕРЕЗ GOOGLE
  const signInWithGoogle = async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);

      const redirectTo = window.location.origin + '/auth/callback';
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) {
        console.error('❌ Помилка входу через Google:', error);
        setAuthError({
          type: 'google_error',
          message: error.message || 'Помилка входу через Google'
        });
        throw error;
      }

      console.log('✅ Перенаправлення на Google для входу...');
      return data;
    } catch (error) {
      console.error('❌ Помилка:', error);
      throw error;
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
          const profile = buildAdminProfile(session.user);
          setUser(profile);
          setMyTechnician(profile);
          setAuthError(null);
          console.log('✅ Доступ дозволено для:', userEmail);
        } else {
          console.log('❌ Доступ заборонено для:', userEmail);
          setIsAuthenticated(false);
          setUser(null);
          setMyTechnician(null);
          setAuthError({
            type: 'user_not_registered',
            message: 'Ваш email не має доступу до цього додатку'
          });
          await supabase.auth.signOut();
        }
      } else {
        setUser(null);
        setMyTechnician(null);
        setIsAuthenticated(false);
      }
      setIsLoadingAuth(false);
      setAuthChecked(true);
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const logout = async () => {
    try {
      setIsLoadingAuth(true);
      await supabase.auth.signOut();
      setUser(null);
      setMyTechnician(null);
      setIsAuthenticated(false);
    } catch (err) {
      console.error('Помилка виходу:', err);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  const value = {
    user, 
    myTechnician,                   
    appUser: user,                  
    isAuthenticated, 
    isLoadingAuth,
    isLoadingPublicSettings,        
    authError,
    appPublicSettings,              
    authChecked,
    logout,
    navigateToLogin,
    signInWithGoogle,
    checkUserAuth: checkAppState,
    checkAppState
  };

  return (
    <AuthContext.Provider value={value}>
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
