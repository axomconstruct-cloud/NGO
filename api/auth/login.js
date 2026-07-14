import { createClient } from '@supabase/supabase-js';
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  if (
      !process.env.SUPABASE_URL ||
        !process.env.SUPABASE_ANON_KEY ||
          !process.env.SUPABASE_SERVICE_ROLE_KEY
          ) {
            return res.status(500).json({
                error: 'Supabase server environment variables are missing.'
                  });
                  }

  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required.'
      });
    }

    const authClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const adminClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: authData, error: authError } =
      await authClient.auth.signInWithPassword({
        email: email.trim(),
        password
      });

    if (authError || !authData.user || !authData.session) {
      return res.status(401).json({
        error: authError?.message || 'Invalid login credentials.'
      });
    }

    const { data: admin, error: adminError } = await adminClient
      .from('admin_users')
      .select('user_id, name, email')
      .eq('user_id', authData.user.id)
      .single();

    if (adminError || !admin) {
      return res.status(403).json({
        error: 'This account does not have administrator access.'
      });
    }

    return res.status(200).json({
      success: true,
      token: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      user: admin
    });
  } catch (error) {
      console.error(error);

        return res.status(500).json({
            error: error.message,
                stack: error.stack
                  });
                  }
  }
