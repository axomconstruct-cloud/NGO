import { createClient } from '@supabase/supabase-js';
import Razorpay from 'razorpay';
import crypto from 'node:crypto';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const db = () => createClient(url, serviceKey, { auth: { persistSession: false } });
const authClient = () => createClient(url, anonKey, { auth: { persistSession: false } });
const out = (res, status, data) => res.status(status).json(data);
const routePath = req => '/' + (Array.isArray(req.query.path) ? req.query.path.join('/') : (req.query.path || ''));

async function requireAdmin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const supabase = db();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const { data: admin } = await supabase.from('admin_users').select('user_id,name,email').eq('user_id', user.id).maybeSingle();
  return admin ? { ...admin, user } : null;
}

async function getSettings(supabase) {
  const { data, error } = await supabase.from('settings').select('key,value');
  if (error) throw error;
  return Object.fromEntries(data.map(x => [x.key, x.value]));
}

export default async function handler(req, res) {
  if (!url || !serviceKey || !anonKey) return out(res, 500, { error: 'Supabase environment variables are not configured.' });
  const p = routePath(req), method = req.method;
  const supabase = db();
  try {
    if (p === '/public' && method === 'GET') {
      const [settings, causes, stories, events, news, gallery, team, partners, paidDonations] = await Promise.all([
        getSettings(supabase),
        supabase.from('causes').select('*').eq('status', 'Active').order('id', { ascending: false }),
        supabase.from('stories').select('*').eq('published', true).order('id', { ascending: false }),
        supabase.from('events').select('*').eq('published', true).order('event_date', { ascending: true }),
        supabase.from('news').select('*').eq('published', true).order('published_at', { ascending: false }),
        supabase.from('gallery').select('*').eq('published', true).order('sort_order', { ascending: true }),
        supabase.from('team_members').select('*').eq('published', true).order('sort_order', { ascending: true }),
        supabase.from('partners').select('*').eq('published', true).order('sort_order', { ascending: true }),
        supabase.from('donations').select('id,amount,cause_id,donor_name,anonymous,paid_at,created_at').eq('status','Successful').order('paid_at',{ascending:false})
      ]);
      for (const r of [causes, stories, events, news, gallery, team, partners, paidDonations]) if (r.error) throw r.error;
      const donationRows = paidDonations.data || [];
      const donorCounts = donationRows.reduce((acc,row)=>{if(row.cause_id)acc[row.cause_id]=(acc[row.cause_id]||0)+1;return acc},{});
      const causeRows = (causes.data || []).map(c=>({...c,donor_count:donorCounts[c.id]||0}));
      const causeNames = Object.fromEntries(causeRows.map(c=>[c.id,c.title]));
      const recentDonations = donationRows.slice(0,6).map(d=>({
        id:d.id, amount:d.amount, paid_at:d.paid_at, created_at:d.created_at,
        donor:d.anonymous?'Anonymous donor':(String(d.donor_name||'Supporter').split(' ')[0]),
        cause_title:d.cause_id?causeNames[d.cause_id]:'General Fund'
      }));
      const campaignSummary = causeRows.reduce((a,c)=>({raised:a.raised+Number(c.raised||0),goal:a.goal+Number(c.goal||0),donors:a.donors+Number(c.donor_count||0)}),{raised:0,goal:0,donors:0});
      return out(res, 200, { settings, causes: causeRows, stories: stories.data, events: events.data, news: news.data, gallery:gallery.data||[], team_members:team.data||[], partners:partners.data||[], recentDonations, campaignSummary });
    }

    if (p === '/auth/login' && method === 'POST') {
      const { email, password } = req.body || {};
      const { data, error } = await authClient().auth.signInWithPassword({ email, password });
      if (error) return out(res, 401, { error: 'Invalid email or password.' });
      const { data: admin } = await supabase.from('admin_users').select('name,email').eq('user_id', data.user.id).maybeSingle();
      if (!admin) return out(res, 403, { error: 'This account does not have administrator access.' });
      return out(res, 200, { token: data.session.access_token, user: admin });
    }

    if (p === '/volunteers' && method === 'POST') {
      const x = req.body || {};
      if (!x.name || !x.email || !x.phone || !x.interest) return out(res, 400, { error: 'Please complete all required fields.' });
      const { error } = await supabase.from('volunteers').insert({ name:x.name, email:x.email, phone:x.phone, interest:x.interest, message:x.message || '' });
      if (error) throw error;
      return out(res, 201, { success: true });
    }
    if (p === '/contacts' && method === 'POST') {
      const x = req.body || {};
      if (!x.name || !x.email || !x.subject || !x.message) return out(res, 400, { error: 'Please complete all required fields.' });
      const { error } = await supabase.from('contacts').insert({ name:x.name, email:x.email, phone:x.phone || '', subject:x.subject, message:x.message });
      if (error) throw error;
      return out(res, 201, { success: true });
    }
    if (p === '/subscribers' && method === 'POST') {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return out(res, 400, { error: 'Enter a valid email address.' });
      const { error } = await supabase.from('subscribers').insert({ email });
      if (error?.code === '23505') return out(res, 409, { error: 'This email is already subscribed.' });
      if (error) throw error;
      return out(res, 201, { success: true });
    }

    if (p === '/donations' && method === 'POST') {
      if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return out(res, 503, { error: 'Online payment is not configured yet.' });
      const x = req.body || {}, amount = Number(x.amount);
      if (!x.donor_name || !/^\S+@\S+\.\S+$/.test(x.email || '') || amount < 100) return out(res, 400, { error: 'Enter valid donor information and a minimum donation of ₹100.' });
      const receipt = `HH-${Date.now()}`;
      const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
      const order = await razorpay.orders.create({ amount: Math.round(amount * 100), currency: 'INR', receipt, notes: { cause_id: String(x.cause_id || ''), donor_email: x.email } });
      const { data, error } = await supabase.from('donations').insert({ donation_id:receipt, donor_name:x.donor_name, email:x.email, amount, frequency:'One-time', cause_id:x.cause_id || null, anonymous:!!x.anonymous, status:'Pending', razorpay_order_id:order.id }).select('id').single();
      if (error) throw error;
      return out(res, 201, { success:true, record_id:data.id, donation_id:receipt, order_id:order.id, key_id:process.env.RAZORPAY_KEY_ID, amount:order.amount, currency:order.currency });
    }
    if (p === '/donations/verify' && method === 'POST') {
      const x = req.body || {};
      const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${x.razorpay_order_id}|${x.razorpay_payment_id}`).digest('hex');
      if (!x.razorpay_signature || signature !== x.razorpay_signature) return out(res, 400, { error: 'Payment verification failed.' });
      const { data: donation, error: findError } = await supabase.from('donations').select('*').eq('razorpay_order_id', x.razorpay_order_id).single();
      if (findError) throw findError;
      if (donation.status === 'Successful') return out(res, 200, { success:true, donation_id:donation.donation_id, already_verified:true });
      const { data: updated, error } = await supabase.from('donations').update({ status:'Successful', razorpay_payment_id:x.razorpay_payment_id, paid_at:new Date().toISOString() }).eq('id', donation.id).eq('status','Pending').select('id').maybeSingle();
      if (error) throw error;
      if (updated && donation.cause_id) await supabase.rpc('increment_cause_raised', { cause_row_id: donation.cause_id, increment_amount: donation.amount });
      return out(res, 200, { success:true, donation_id:donation.donation_id });
    }

    if (p.startsWith('/receipts/') && method === 'GET') {
      const receipt = decodeURIComponent(p.split('/').pop() || '');
      const { data: donation, error } = await supabase.from('donations').select('donation_id,donor_name,email,amount,status,paid_at,anonymous,cause_id').eq('donation_id', receipt).eq('status','Successful').maybeSingle();
      if (error) throw error;
      if (!donation) return out(res,404,{error:'Receipt not found.'});
      let cause = 'General Fund';
      if (donation.cause_id) { const {data:c}=await supabase.from('causes').select('title').eq('id',donation.cause_id).maybeSingle(); if(c?.title)cause=c.title; }
      return out(res,200,{...donation,donor_name:donation.anonymous?'Anonymous donor':donation.donor_name,cause});
    }

    const admin = await requireAdmin(req);
    if (!admin) return out(res, 401, { error: 'Administrator authentication required.' });

    if (p === '/admin/overview' && method === 'GET') {
      const [donations, donors, volunteers, causes, contacts, subscribers, recent] = await Promise.all([
        supabase.from('donations').select('amount').eq('status','Successful'),
        supabase.from('donations').select('email').eq('status','Successful'),
        supabase.from('volunteers').select('*',{count:'exact',head:true}),
        supabase.from('causes').select('*',{count:'exact',head:true}),
        supabase.from('contacts').select('*',{count:'exact',head:true}).eq('status','New'),
        supabase.from('subscribers').select('*',{count:'exact',head:true}),
        supabase.from('donations').select('*').order('id',{ascending:false}).limit(6)
      ]);
      const total = (donations.data || []).reduce((a,b)=>a+Number(b.amount),0);
      const uniqueDonors = new Set((donors.data || []).map(x=>x.email)).size;
      return out(res,200,{ totals:{ donations:total, donors:uniqueDonors, volunteers:volunteers.count||0, causes:causes.count||0, contacts:contacts.count||0, subscribers:subscribers.count||0 }, recent:recent.data||[] });
    }
    if (p === '/admin/data' && method === 'GET') {
      const names=['causes','stories','events','news','gallery','team_members','partners','donations','volunteers','contacts','subscribers'];
      const results=await Promise.all(names.map(n=>supabase.from(n).select('*').order('id',{ascending:false})));
      results.forEach(r=>{if(r.error)throw r.error});
      const settings=await getSettings(supabase);
      return out(res,200,Object.fromEntries([...names.map((n,i)=>[n,results[i].data]),['settings',settings]]));
    }

    if (p === '/admin/upload' && method === 'POST') {
      const { file_name, content_type, base64 } = req.body || {};
      if (!file_name || !content_type || !base64) return out(res,400,{error:'File data is required.'});
      if (!String(content_type).startsWith('image/')) return out(res,400,{error:'Only image uploads are allowed.'});
      const raw = String(base64).replace(/^data:[^;]+;base64,/, '');
      const bytes = Buffer.from(raw, 'base64');
      if (bytes.length > 5 * 1024 * 1024) return out(res,400,{error:'Image must be smaller than 5 MB.'});
      const safe = String(file_name).toLowerCase().replace(/[^a-z0-9._-]+/g,'-');
      const path = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`;
      const { error } = await supabase.storage.from('site-media').upload(path, bytes, { contentType: content_type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('site-media').getPublicUrl(path);
      return out(res,201,{success:true,url:data.publicUrl,path});
    }

    if (p === '/admin/settings' && method === 'PUT') {
      const rows=Object.entries(req.body||{}).map(([key,value])=>({key,value:String(value)}));
      const {error}=await supabase.from('settings').upsert(rows,{onConflict:'key'}); if(error)throw error;
      return out(res,200,{success:true});
    }
    const content=p.match(/^\/admin\/(causes|stories|events|news|gallery|team_members|partners)(?:\/(\d+))?$/);
    if(content){const table=content[1],id=content[2];
      if(method==='POST'){const {error}=await supabase.from(table).insert(req.body);if(error)throw error;return out(res,201,{success:true});}
      if(method==='PUT'&&id){const {error}=await supabase.from(table).update(req.body).eq('id',id);if(error)throw error;return out(res,200,{success:true});}
      if(method==='DELETE'&&id){const {error}=await supabase.from(table).delete().eq('id',id);if(error)throw error;return out(res,200,{success:true});}
    }
    const status=p.match(/^\/admin\/(volunteers|contacts)\/(\d+)\/status$/);
    if(status&&method==='PUT'){const {error}=await supabase.from(status[1]).update({status:req.body.status}).eq('id',status[2]);if(error)throw error;return out(res,200,{success:true});}
    return out(res,404,{error:'Not found.'});
  } catch (error) {
      console.error('API error:', error);

        return out(res, 500, {
            error: error?.message || 'The server could not complete this request.'
              });
              }
  }
