import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      // Глобальний фільтр усіх даних, що приходять у додаток
      select: (data) => {
        // Якщо бекенд повернув об'єкт помилки замість даних
        if (data && (data.error || data.message || typeof data === 'string')) {
          console.warn("Глобальний захист: перехоплено помилку SDK/бази", data);
          // Повертаємо пустий масив, щоб не ламати .filter() / .map() у компонентах
          return []; 
        }
        return data;
      },
    },
  },
});