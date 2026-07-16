// src/pages/AuthCallback.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient'; // ← ШЛЯХ ДО КОРЕНЕВОГО ФАЙЛУ

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log('AuthCallback: checking for tokens in URL...');

        // В Capacitor хеш може бути частиною URL
        const hash = window.location.hash || '';
        const params = new URLSearchParams(hash.replace('#', '?'));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          console.log('AuthCallback: tokens found in hash, setting session...');
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (error) throw error;
        }

        // Тепер перевіряємо чи є сесія
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Помилка отримання сесії:', sessionError);
          navigate('/login');
          return;
        }

        if (session) {
          console.log('Session established, navigating home');
          navigate('/', { replace: true });
        } else {
          // Якщо все ще немає, почекаємо ще трохи
          setTimeout(async () => {
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            if (retrySession) {
              navigate('/', { replace: true });
            } else {
              console.warn('Authentication failed: no session after tokens check');
              navigate('/login');
            }
          }, 1500);
        }
      } catch (err) {
        console.error('Неочікувана помилка при обробці входу:', err);
        navigate('/login');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto"></div>
        <p className="text-sm text-muted-foreground mt-3">Завершення входу...</p>
      </div>
    </div>
  );
}
