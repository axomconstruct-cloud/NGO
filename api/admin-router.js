import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLES = new Set([
  'causes',
  'stories',
  'events',
  'news',
  'gallery',
  'team_members',
  'partners'
]);

const STATUS_TABLES = new Set([
  'volunteers',
  'contacts'
]);

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function getPath(req) {
  const value = req.query.path;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) return value.split('/').filter(Boolean);
  return [];
}

function getClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Supabase server environment variables are missing.');
  }

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function authenticateAdmin(req, supabase) {
  const token = String(req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();

  if (!token) {
    return {
      error: 'Administrator authentication required.',
      status: 401
    };
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return {
      error: 'Invalid or expired administrator session.',
      status: 401
    };
  }

  const { data: admin, error: adminError } = await supabase
    .from('admin_users')
    .select('user_id,name,email')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError) throw adminError;

  if (!admin) {
    return {
      error: 'This account does not have administrator access.',
      status: 403
    };
  }

  return { admin, user };
}

function normalizePayload(table, payload = {}) {
  const value = { ...payload };

  // Never allow the browser to replace a primary key or timestamps.
  delete value.id;
  delete value.created_at;
  delete value.updated_at;

  for (const key of ['raised', 'goal', 'capacity', 'sort_order']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      value[key] = Number(value[key] || 0);
    }
  }

  for (const key of ['published', 'featured']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      value[key] =
        value[key] === true ||
        value[key] === 'true' ||
        value[key] === '1' ||
        value[key] === 'on';
    }
  }

  // Empty optional fields should be stored as empty strings.
  for (const key of ['link', 'website', 'email', 'caption', 'bio', 'content']) {
    if (Object.prototype.hasOwnProperty.call(value, key) && value[key] == null) {
      value[key] = '';
    }
  }

  return value;
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const supabase = getClient();
    const auth = await authenticateAdmin(req, supabase);

    if (auth.error) {
      return json(res, auth.status, { error: auth.error });
    }

    const parts = getPath(req);
    const [resource, id, action] = parts;

    // /api/admin/<resource>
    // /api/admin/<resource>/<id>
    if (TABLES.has(resource)) {
      if (req.method === 'GET' && !id) {
        const { data, error } = await supabase
          .from(resource)
          .select('*')
          .order('id', { ascending: false });

        if (error) throw error;
        return json(res, 200, { rows: data || [] });
      }

      if (req.method === 'POST' && !id) {
        const payload = normalizePayload(resource, req.body || {});

        const { data, error } = await supabase
          .from(resource)
          .insert(payload)
          .select('*')
          .single();

        if (error) throw error;
        return json(res, 201, { success: true, item: data });
      }

      if (req.method === 'PUT' && id) {
        if (!/^\d+$/.test(String(id))) {
          return json(res, 400, { error: 'Invalid record ID.' });
        }

        const payload = normalizePayload(resource, req.body || {});

        if (!Object.keys(payload).length) {
          return json(res, 400, { error: 'No update fields were provided.' });
        }

        const { data, error } = await supabase
          .from(resource)
          .update(payload)
          .eq('id', id)
          .select('*')
          .maybeSingle();

        if (error) throw error;
        if (!data) return json(res, 404, { error: 'Record not found.' });

        return json(res, 200, { success: true, item: data });
      }

      if (req.method === 'DELETE' && id) {
        if (!/^\d+$/.test(String(id))) {
          return json(res, 400, { error: 'Invalid record ID.' });
        }

        const { data, error } = await supabase
          .from(resource)
          .delete()
          .eq('id', id)
          .select('id')
          .maybeSingle();

        if (error) throw error;
        if (!data) return json(res, 404, { error: 'Record not found.' });

        return json(res, 200, { success: true, deleted_id: data.id });
      }
    }

    // /api/admin/volunteers/<id>/status
    // /api/admin/contacts/<id>/status
    if (
      STATUS_TABLES.has(resource) &&
      id &&
      action === 'status' &&
      req.method === 'PUT'
    ) {
      if (!/^\d+$/.test(String(id))) {
        return json(res, 400, { error: 'Invalid record ID.' });
      }

      const status = String(req.body?.status || '').trim();

      if (!status) {
        return json(res, 400, { error: 'Status is required.' });
      }

      const { data, error } = await supabase
        .from(resource)
        .update({ status })
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (!data) return json(res, 404, { error: 'Record not found.' });

      return json(res, 200, { success: true, item: data });
    }

    return json(res, 404, {
      error: `Admin API route not found: /api/admin/${parts.join('/')}`
    });
  } catch (error) {
    console.error('Admin CRUD API error:', error);
    return json(res, 500, {
      error: error?.message || 'The server could not complete this request.'
    });
  }
}
