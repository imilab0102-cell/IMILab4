import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const html = await fetch('https://rulya-bank.com.ua/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }).then(r => r.text());

    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const rates = {};
    const currencies = ['USD', 'EUR', 'GBP', 'CHF'];

    for (const cur of currencies) {
      // Pattern: "USD 43.80 +0.10 04.06 44.60 ..."
      // buy is first price, sell is second price after the date
      const re = new RegExp(cur + '\\s+([\\d.]+)\\s+[+-][\\d.]+\\s+[\\d.:]+\\s+([\\d.]+)');
      const m = text.match(re);
      if (m) {
        rates[cur] = { buy: parseFloat(m[1]), sell: parseFloat(m[2]) };
      }
    }

    return Response.json({ rates, updated: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});