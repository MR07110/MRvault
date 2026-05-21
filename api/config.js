/**
 * Vercel Serverless Function — /api/config
 *
 * Env varlarni client ga xavfsiz yetkazadi.
 * Vercel Dashboard > Settings > Environment Variables da qo'shing:
 *
 *   FB_API_KEY, FB_AUTH_DOMAIN, FB_PROJECT_ID,
 *   FB_STORAGE_BUCKET, FB_MESSAGING_SENDER_ID, FB_APP_ID,
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 */
export default function handler(req, res) {
  // Faqat GET so'rovlarga javob berish
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    FB_API_KEY,
    FB_AUTH_DOMAIN,
    FB_PROJECT_ID,
    FB_STORAGE_BUCKET,
    FB_MESSAGING_SENDER_ID,
    FB_APP_ID,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  } = process.env;

  // Majburiy kalitlar tekshiruvi
  const missing = [
    'FB_API_KEY','FB_AUTH_DOMAIN','FB_PROJECT_ID',
    'FB_STORAGE_BUCKET','FB_MESSAGING_SENDER_ID','FB_APP_ID',
    'SUPABASE_URL','SUPABASE_ANON_KEY',
  ].filter(k => !process.env[k]);

  if (missing.length) {
    console.error('Yetishmayotgan env varlar:', missing);
    return res.status(500).json({ error: 'Server konfiguratsiyasi to\'liq emas' });
  }

  // Cache-Control: 1 soat (kalitlar kamdan-kam o'zgaradi)
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  res.status(200).json({
    firebase: {
      apiKey:            FB_API_KEY,
      authDomain:        FB_AUTH_DOMAIN,
      projectId:         FB_PROJECT_ID,
      storageBucket:     FB_STORAGE_BUCKET,
      messagingSenderId: FB_MESSAGING_SENDER_ID,
      appId:             FB_APP_ID,
    },
    supabase: {
      url:     SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
    },
  });
}
