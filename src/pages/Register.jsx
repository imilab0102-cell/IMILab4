import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Lock, UserPlus, Loader2 } from "lucide-react";

// Імпортуємо клієнт Supabase
import { supabase } from "../supabaseClient";

// Імпортуємо як default (без фігурних дужок)
import AuthLayout from "../components/AuthLayout";

// Компоненти UI
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Паролі не збігаються!");
      return;
    }

    setLoading(true);

    try {
      // 1. Реєструємо користувача в Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      if (authError) throw authError;

      // 2. Тестовий запис у таблицю профілів
      const { error: profileError } = await supabase
        .from('users_profiles')
        .insert([
          { 
            username: email.split('@')[0], 
            phone_number: '+380000000000' 
          }
        ]);

      if (profileError) {
        console.warn("Профіль не створився, але реєстрація успішна:", profileError.message);
      }

      setIsSuccess(true);

    } catch (err) {
      setError(err.message || "Помилка при реєстрації");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <AuthLayout icon={Mail} title="Лист надіслано!" subtitle={`Ми відправили посилання для підтвердження на ${email}`}>
        <div className="p-4 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl text-center mb-6">
          Акаунт успішно створено! Перевірте свою пошту для активації профілю.
        </div>
        <Link to="/login" className="w-full">
          <Button className="w-full h-12 font-medium">Перейти до входу</Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Створення акаунту"
      subtitle="Зареєструйтеся в системі IMILab через Supabase"
      footer={
        <>
          Вже маєте акаунт?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Увійти
          </Link>
        </>
      }
    >
      {/* Контейнер помилки завжди зафіксований у DOM */}
      <div 
        key="auth-error-block"
        className={`transition-all duration-200 mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20 ${
          error ? "block opacity-100" : "hidden opacity-0"
        }`}
      >
        {error}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Електронна пошта</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Пароль</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Підтвердіть пароль</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>

        {/* БЕЗПЕЧНА КНОПКА: Іконка і тексти присутні завжди. 
          Ми перемикаємо лише видимість через класи. Це гарантує, 
          що React не спробує видалити вузли (removeChild) при зміні стану loading.
        */}
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          <span className={`flex items-center justify-center ${loading ? "hidden" : "flex"}`}>
            Зареєструватися
          </span>
          <span className={`items-center justify-center ${loading ? "flex" : "hidden"}`}>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Реєстрація...
          </span>
        </Button>
      </form>
    </AuthLayout>
  );
}
