import { requireAdmin, sendError } from '../_lib/admin.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const { adminClient } = await requireAdmin(req);

    const [
      donationsResult,
      volunteersResult,
      contactsResult,
      subscribersResult,
      causesResult,
      eventsResult,
      newsResult,
      recentResult
    ] = await Promise.all([
      adminClient
        .from('donations')
        .select('amount')
        .eq('status', 'Paid'),

      adminClient
        .from('volunteers')
        .select('*', { count: 'exact', head: true }),

      adminClient
        .from('contacts')
        .select('*', { count: 'exact', head: true }),

      adminClient
        .from('subscribers')
        .select('*', { count: 'exact', head: true }),

      adminClient
        .from('causes')
        .select('*', { count: 'exact', head: true }),

      adminClient
        .from('events')
        .select('*', { count: 'exact', head: true }),

      adminClient
        .from('news')
        .select('*', { count: 'exact', head: true }),

      adminClient
        .from('donations')
        .select(
          'id, donation_id, donor_name, email, amount, status, paid_at, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    const results = [
      donationsResult,
      volunteersResult,
      contactsResult,
      subscribersResult,
      causesResult,
      eventsResult,
      newsResult,
      recentResult
    ];

    const failure = results.find((result) => result.error);

    if (failure?.error) {
      throw new Error(failure.error.message);
    }

    const donationTotal = (donationsResult.data || []).reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    );

    return res.status(200).json({
      totals: {
        donations: donationTotal,
        volunteers: volunteersResult.count || 0,
        contacts: contactsResult.count || 0,
        subscribers: subscribersResult.count || 0,
        causes: causesResult.count || 0,
        events: eventsResult.count || 0,
        news: newsResult.count || 0
      },
      recent: recentResult.data || []
    });
  } catch (error) {
    return sendError(res, error);
  }
}
