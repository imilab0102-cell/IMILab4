// src/pages/AuthCallback.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase'; // ← ЗМІНІТЬ ШЛЯХ

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Помилка отримання сесії:', error);
        navigate('/login');
        return;
      }

      if (session) {
        navigate('/');
      } else {
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
