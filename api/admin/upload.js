import crypto from 'node:crypto';
import { requireAdmin, sendError } from '../_lib/admin.js';

export const config = {
  api: {
      bodyParser: {
            sizeLimit: '6mb'
                }
                  }
                  };

                  export default async function handler(req, res) {
                    res.setHeader('Content-Type', 'application/json');

                      if (req.method !== 'POST') {
                          return res.status(405).json({
                                error: 'Method not allowed.'
                                    });
                                      }

                                        try {
                                            const { adminClient } = await requireAdmin(req);

                                                const {
                                                      file_name: fileName,
                                                            content_type: contentType,
                                                                  base64
                                                                      } = req.body || {};

                                                                          if (!fileName || !contentType || !base64) {
                                                                                return res.status(400).json({
                                                                                        error: 'Image file data is required.'
                                                                                              });
                                                                                                  }

                                                                                                      if (!String(contentType).startsWith('image/')) {
                                                                                                            return res.status(400).json({
                                                                                                                    error: 'Only image files are allowed.'
                                                                                                                          });
                                                                                                                              }

                                                                                                                                  const rawBase64 = String(base64).replace(
                                                                                                                                        /^data:[^;]+;base64,/,
                                                                                                                                              ''
                                                                                                                                                  );

                                                                                                                                                      const imageBuffer = Buffer.from(rawBase64, 'base64');

                                                                                                                                                          if (!imageBuffer.length) {
                                                                                                                                                                return res.status(400).json({
                                                                                                                                                                        error: 'The selected image is empty or invalid.'
                                                                                                                                                                              });
                                                                                                                                                                                  }

                                                                                                                                                                                      if (imageBuffer.length > 4 * 1024 * 1024) {
                                                                                                                                                                                            return res.status(400).json({
                                                                                                                                                                                                    error: 'The image must be smaller than 4 MB.'
                                                                                                                                                                                                          });
                                                                                                                                                                                                              }

                                                                                                                                                                                                                  const safeName = String(fileName)
                                                                                                                                                                                                                        .toLowerCase()
                                                                                                                                                                                                                              .replace(/[^a-z0-9._-]+/g, '-')
                                                                                                                                                                                                                                    .replace(/^-+|-+$/g, '');

                                                                                                                                                                                                                                        const storagePath =
                                                                                                                                                                                                                                              `uploads/${Date.now()}-` +
                                                                                                                                                                                                                                                    `${crypto.randomBytes(4).toString('hex')}-` +
                                                                                                                                                                                                                                                          `${safeName}`;

                                                                                                                                                                                                                                                              const { error: uploadError } = await adminClient.storage
                                                                                                                                                                                                                                                                    .from('site-media')
                                                                                                                                                                                                                                                                          .upload(storagePath, imageBuffer, {
                                                                                                                                                                                                                                                                                  contentType,
                                                                                                                                                                                                                                                                                          cacheControl: '3600',
                                                                                                                                                                                                                                                                                                  upsert: false
                                                                                                                                                                                                                                                                                                        });

                                                                                                                                                                                                                                                                                                            if (uploadError) {
                                                                                                                                                                                                                                                                                                                  throw new Error(uploadError.message);
                                                                                                                                                                                                                                                                                                                      }

                                                                                                                                                                                                                                                                                                                          const { data } = adminClient.storage
                                                                                                                                                                                                                                                                                                                                .from('site-media')
                                                                                                                                                                                                                                                                                                                                      .getPublicUrl(storagePath);

                                                                                                                                                                                                                                                                                                                                          if (!data?.publicUrl) {
                                                                                                                                                                                                                                                                                                                                                throw new Error('The uploaded image URL could not be generated.');
                                                                                                                                                                                                                                                                                                                                                    }

                                                                                                                                                                                                                                                                                                                                                        return res.status(201).json({
                                                                                                                                                                                                                                                                                                                                                              success: true,
                                                                                                                                                                                                                                                                                                                                                                    url: data.publicUrl,
                                                                                                                                                                                                                                                                                                                                                                          path: storagePath
                                                                                                                                                                                                                                                                                                                                                                              });
                                                                                                                                                                                                                                                                                                                                                                                } catch (error) {
                                                                                                                                                                                                                                                                                                                                                                                    return sendError(res, error);
                                                                                                                                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                                                                                                                                      }