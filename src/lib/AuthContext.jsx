import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../supabaseClient'; 

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [myTechnician, setMyTechnician] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  
  // Публічні налаштування додатку (активуємо всі можливості)
  const [appPublicSettings, setAppPublicSettings] = useState({
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

  // Функція створення профілю адміністратора безпосередньо з сесії Supabase
  const buildAdminProfile = (supabaseUser) => {
    if (!supabaseUser) return null;

    // Створюємо об'єкт з найвищими правами, ігноруючи відсутні таблиці
    const adminProfile = {
      id: 1,
      user_id: supabaseUser.id,
      email: supabaseUser.email,
      username: "IMI Lab Власник",
      full_name: "IMI Lab Власник",
      phone_number: "",
      
      // Набори ролей та дозволів для всіх можливих перевірок у додатку
      role: "admin", 
      user_role: "admin",
      type: "owner", 
      is_admin: true,
      isAdmin: true,
      is_owner: true,
      permissions: ["*"],
      access_level: "superadmin"
    };

    console.log("Автономний адмін-профіль успішно згенеровано:", adminProfile);
    return adminProfile;
  };

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setIsLoadingAuth(true);
      setAuthError(null);

      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (session && session.user) {
        setIsAuthenticated(true);
        const profile = buildAdminProfile(session.user);
        setUser(profile);
        setMyTechnician(profile);
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
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const checkUserAuth = async () => {
    await checkAppState();
  };

  useEffect(() => {
    checkAppState();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setIsLoadingAuth(true);
      if (session && session.user) {
        setIsAuthenticated(true);
        const profile = buildAdminProfile(session.user);
        setUser(profile);
        setMyTechnician(profile);
      } else {
        setUser(null);
        setMyTechnician(null);
        setIsAuthenticated(false);
      }
      setIsLoadingAuth(false);
      setAuthChecked(true);
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
      setMyTechnician(null);
      setIsAuthenticated(false);
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
      checkUserAuth,
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