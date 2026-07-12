import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App.jsx';
import '@/index.css';

// Динамічний імпорт Capacitor App, щоб не ламати збірку, якщо плагін не встановлено
const initCapacitor = async () => {
  try {
    const { App: CapacitorApp } = await import('@capacitor/app');
    CapacitorApp.addListener('appUrlOpen', (event) => {
      console.log('App opened with URL:', event.url);

      // Якщо це повернення з OAuth (через схему або через домен)
      if (event.url.includes('com.imilab.app://') || event.url.includes('imi-lab4.vercel.app')) {
        const url = new URL(event.url);

        // Отримуємо параметри з хешу (#) або пошуку (?)
        // Supabase OAuth зазвичай повертає дані в хеші: #access_token=...
        const hash = url.hash;
        const search = url.search;

        // Формуємо внутрішній шлях для React Router
        // Якщо це /auth/callback, ми маємо передати туди всі токени
        if (event.url.includes('/auth/callback')) {
          window.location.href = '/auth/callback' + search + hash;
        } else {
          // Якщо просто відкрили додаток за посиланням
          window.location.href = '/' + search + hash;
        }
      }
    });
  } catch (e) {
    console.log('Capacitor App plugin not found, skipping deep link listener');
  }
};

// Налаштування Push-повідомлень
const initPushNotifications = async () => {
  try {
    const { PushNotifications } = await import(/* @vite-ignore */ '@capacitor/push-notifications');

    // Перевірка дозволів
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('User denied push notifications permissions');
      return;
    }

    // Реєстрація для отримання токена
    await PushNotifications.register();

    // Отримання токена
    PushNotifications.addListener('registration', (token) => {
      console.log('Push registration success, token:', token.value);
      // Тут токен потрібно відправити на ваш бекенд/Supabase
      localStorage.setItem('push_token', token.value);
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Error on registration:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push action performed:', notification);
    });
  } catch (e) {
    console.log('Push Notifications plugin not found, skipping setup');
  }
};

// Налаштування Local Notifications для нагадувань про дедлайни
const initLocalNotifications = async () => {
  try {
    const { LocalNotifications } = await import(/* @vite-ignore */ '@capacitor/local-notifications');

    // Перевірка та запит дозволів
    let permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display === 'prompt') {
      permStatus = await LocalNotifications.requestPermissions();
    }

    if (permStatus.display === 'granted') {
      console.log('Local Notifications permission granted');
    }
  } catch (e) {
    console.log('Local Notifications plugin setup failed');
  }
};

// Ініціалізація Capacitor
initCapacitor();
initPushNotifications();
initLocalNotifications();

if ('serviceWorker' in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);