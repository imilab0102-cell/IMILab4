// Сервіс для отримання курсів валют з декількох джерел

const FALLBACK_RATES = { USD: 41.5, EUR: 44.5 };

export const fetchExchangeRates = async () => {
  // 1. Спробуємо Monobank
  try {
    const response = await fetch('https://api.monobank.ua/bank/currency');
    if (response.ok) {
      const data = await response.json();
      const usdRate = data.find(r => r.currencyCodeA === 840 && r.currencyCodeB === 980);
      const eurRate = data.find(r => r.currencyCodeA === 978 && r.currencyCodeB === 980);
      if (usdRate && eurRate) {
        return {
          USD: usdRate.rateSell || usdRate.rateCross,
          EUR: eurRate.rateSell || eurRate.rateCross,
          source: 'Monobank'
        };
      }
    }
  } catch (e) {
    console.warn('Monobank API failed, trying NBU...');
  }

  // 2. Спробуємо НБУ (якщо Monobank впав або CORS)
  try {
    const response = await fetch('https://bank.gov.ua/NBUStatService/v1/statistichny/exchange?json');
    if (response.ok) {
      const data = await response.json();
      const usd = data.find(r => r.cc === 'USD');
      const eur = data.find(r => r.cc === 'EUR');
      if (usd && eur) {
        return {
          USD: usd.rate,
          EUR: eur.rate,
          source: 'NBU'
        };
      }
    }
  } catch (e) {
    console.warn('NBU API failed, trying cached or fallback...');
  }

  // 3. Спробуємо кеш
  const cached = localStorage.getItem('exchangeRates');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return { ...parsed, source: 'Cached' };
    } catch (e) {}
  }

  // 4. Фінальний варіант
  return { ...FALLBACK_RATES, source: 'Static Fallback' };
};
