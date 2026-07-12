// src/pages/AuthCallback.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient'; // ← ШЛЯХ ДО КОРЕНЕВОГО ФАЙЛУ

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase автоматично підхоплює токени з URL (хешу або query)
      // Але в мобільному додатку нам потрібно дати йому мить, щоб обробити нову адресу
      try {
        console.log('AuthCallback: checking session...');

        // Спочатку спробуємо отримати сесію напряму
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Помилка отримання сесії:', error);
          navigate('/login');
          return;
        }

        if (session) {
          console.log('Session found, navigating to dashboard');
          navigate('/', { replace: true });
        } else {
          // Якщо сесії немає, можливо токени ще в URL
          // Supabase auth слухає зміни в URL автоматично,
          // тому ми просто почекаємо трохи і спробуємо ще раз
          console.log('No session yet, waiting for tokens...');
          setTimeout(async () => {
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            if (retrySession) {
              navigate('/', { replace: true });
            } else {
              console.warn('Still no session after timeout');
              navigate('/login');
            }
          }, 1000);
        }
      } catch (err) {
        console.error('Неочікувана помилка:', err);
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
