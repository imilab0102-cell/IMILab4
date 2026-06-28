import React, { useState } from "react";
import { Link } from "react-router-dom";

// Імпортуємо правильний клієнт Supabase
import { supabase } from "../supabaseClient"; 

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      // Використовуємо стандартний метод Supabase для входу
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (authError) throw authError;

      // Успішний вхід — перенаправляємо на головну
      window.location.href = "/";
    } catch (err) {
      setError(err.message || "Невірний email або password");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    try {
      // Використовуємо метод Supabase для OAuth (Google)
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: 'https://imi-lab4.vercel.app/auth/callback', // Повертає користувача на твій поточний сайт (наприклад, localhost:5174)
        },
      });

      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err.message || "Помилка входу через Google");
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Вхід"
      subtitle="Увійдіть у свій акаунт"
      footer={
        <>
          Ще не маєте акаунту?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Зареєструватися
          </Link>
        </>
      }
    >
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleGoogle}
        type="button"
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Увійти через Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">або</span>
        </div>
      </div>

      {/* Безпечний контейнер помилки */}
      <div 
        className={`transition-all duration-200 mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm ${
          error ? "block" : "hidden"
        }`}
      >
        {error}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Електронна пошта</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Пароль</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Забули пароль?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>

        {/* Безпечна кнопка входу без динамічного видалення DOM-вузлів */}
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          <span className={`items-center justify-center ${loading ? "hidden" : "flex"}`}>
            Увійти
          </span>
          <span className={`items-center justify-center ${loading ? "flex" : "hidden"}`}>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Вхід...
          </span>
        </Button>
      </form>
    </AuthLayout>
  );
}
