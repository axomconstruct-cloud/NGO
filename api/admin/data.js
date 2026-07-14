import { requireAdmin, sendError } from '../_lib/admin.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const { adminClient } = await requireAdmin(req);

    const [
      causes,
      stories,
      events,
      news,
      donations,
      volunteers,
      contacts,
      subscribers,
      settings
    ] = await Promise.all([
      adminClient.from('causes').select('*').order('created_at', {
        ascending: false
      }),

      adminClient.from('stories').select('*').order('created_at', {
        ascending: false
      }),

      adminClient.from('events').select('*').order('event_date', {
        ascending: true
      }),

      adminClient.from('news').select('*').order('published_at', {
        ascending: false
      }),

      adminClient.from('donations').select('*').order('created_at', {
        ascending: false
      }),

      adminClient.from('volunteers').select('*').order('created_at', {
        ascending: false
      }),

      adminClient.from('contacts').select('*').order('created_at', {
        ascending: false
      }),

      adminClient.from('subscribers').select('*').order('created_at', {
        ascending: false
      }),

      adminClient.from('settings').select('key, value')
    ]);

    const results = {
      causes,
      stories,
      events,
      news,
      donations,
      volunteers,
      contacts,
      subscribers,
      settings
    };

    for (const result of Object.values(results)) {
      if (result.error) {
        throw new Error(result.error.message);
      }
    }

    const settingsObject = Object.fromEntries(
      (settings.data || []).map((row) => [row.key, row.value])
    );

    return res.status(200).json({
      causes: causes.data || [],
      stories: stories.data || [],
      events: events.data || [],
      news: news.data || [],
      donations: donations.data || [],
      volunteers: volunteers.data || [],
      contacts: contacts.data || [],
      subscribers: subscribers.data || [],
      settings: settingsObject
    });
  } catch (error) {
    return sendError(res, error);
  }
}
