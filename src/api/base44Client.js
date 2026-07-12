// Тимчасовий муляж, щоб заспокоїти 23 файли в проєкті
export const base44 = {
  init: () => console.log("Заглушка Base44: init"),
  track: () => {},
  me: async () => ({ data: null }),
  // Додаємо порожні проксі для будь-яких викликів на кшталт base44.entities...
  entities: new Proxy({}, {
    get: () => ({
      get: async () => ({ data: [] }),
      list: async () => ({ data: [] }),
      create: async () => ({ data: {} }),
      update: async () => ({ data: {} }),
      delete: async () => ({ data: {} }),
    })
  })
};

export default base44;