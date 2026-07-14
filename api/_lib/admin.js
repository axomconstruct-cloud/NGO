import { createClient } from '@supabase/supabase-js';

function getSupabaseClients() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    throw new Error('Supabase server environment variables are missing.');
  }

  return {
    authClient: createClient(url, anonKey, {
      auth: { persistSession: false }
    }),
    adminClient: createClient(url, serviceKey, {
      auth: { persistSession: false }
    })
  };
}

export async function requireAdmin(req) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';

  if (!token) {
    const error = new Error('Administrator authentication required.');
    error.status = 401;
    throw error;
  }

  const { authClient, adminClient } = getSupabaseClients();

  const {
    data: { user },
    error: userError
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    const error = new Error('Invalid or expired administrator session.');
    error.status = 401;
    throw error;
  }

  const { data: admin, error: adminError } = await adminClient
    .from('admin_users')
    .select('user_id, name, email')
    .eq('user_id', user.id)
    .single();

  if (adminError || !admin) {
    const error = new Error('This account does not have administrator access.');
    error.status = 403;
    throw error;
  }

  return { adminClient, admin, user };
}

export function sendError(res, error) {
  console.error(error);

  return res.status(error.status || 500).json({
    error: error.message || 'The server could not complete this request.'
  });
}
