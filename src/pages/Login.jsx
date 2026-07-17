import React, { useState } from "react";
import { Link } from "react-router-dom";

// Імпортуємо правильний клієнт Supabase
import { supabase } from "../api/supabaseClient";

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
    if (e) e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (authError) throw authError;

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
      const redirectTo = window.Capacitor
        ? 'com.imilab.app://auth/callback'
        : window.location.origin + '/auth/callback';

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
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

        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {!loading ? (
            "Увійти"
          ) : (
            <div className="flex items-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Вхід...
            </div>
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
