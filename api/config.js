/**
 * MRtube — /api/config  (Vercel Serverless Function)
 *
 * Reads Firebase + Supabase credentials from Vercel Environment Variables
 * and returns them as JSON. Never expose this endpoint without CORS guards
 * in production — add an Origin check if needed.
 */

export default function handler(req, res) {
  // Only allow GET
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

  // Validate that all required vars are present
  const missing = [
    'FB_API_KEY', 'FB_AUTH_DOMAIN', 'FB_PROJECT_ID',
    'FB_STORAGE_BUCKET', 'FB_MESSAGING_SENDER_ID', 'FB_APP_ID',
    'SUPABASE_URL', 'SUPABASE_ANON_KEY',
  ].filter(k => !process.env[k]);

  if (missing.length) {
    console.error('Missing env vars:', missing);
    return res.status(500).json({ error: 'Server misconfigured', missing });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
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
