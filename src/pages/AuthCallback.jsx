import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Обробка callback після входу
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Успішний вхід - перенаправляємо на головну
        navigate('/dashboard');
      } else {
        // Помилка - перенаправляємо на логін
        navigate('/login');
      }
    });
  }, [navigate]);

  return <div>Завершення входу...</div>;
}
