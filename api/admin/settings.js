import { requireAdmin, sendError } from '../_lib/admin.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'PUT') {
        return res.status(405).json({
              error: 'Method not allowed.'
                  });
                    }

                      try {
                          const { adminClient } = await requireAdmin(req);
                              const settings = req.body || {};

                                  const rows = Object.entries(settings).map(([key, value]) => ({
                                        key,
                                              value: value == null ? '' : String(value)
                                                  }));

                                                      if (!rows.length) {
                                                            return res.status(400).json({
                                                                    error: 'No settings were provided.'
                                                                          });
                                                                              }

                                                                                  const { error } = await adminClient
                                                                                        .from('settings')
                                                                                              .upsert(rows, {
                                                                                                      onConflict: 'key'
                                                                                                            });

                                                                                                                if (error) {
                                                                                                                      throw new Error(error.message);
                                                                                                                          }

                                                                                                                              return res.status(200).json({
                                                                                                                                    success: true,
                                                                                                                                          message: 'Settings saved successfully.'
                                                                                                                                              });
                                                                                                                                                } catch (error) {
                                                                                                                                                    return sendError(res, error);
                                                                                                                                                      }
                                                                                                                                                      }