// AEHRAN <-> Shadowfax adapter. Token lives ONLY in the server environment.
// Run:  SHADOWFAX_PRODUCTION_TOKEN=xxxx SHADOWFAX_BASE_URL=https://<from-shadowfax-docs> node server.js
// Serve it under the same domain so admin.html can call /api/delivery/shadowfax/shipments
const express = require('express');
const app = express();
app.use(express.json({ limit: '1mb' }));

const TOKEN = process.env.SHADOWFAX_PRODUCTION_TOKEN;
const BASE = (process.env.SHADOWFAX_BASE_URL || '').replace(/\/+$/, '');
const ALLOW = process.env.ALLOWED_ORIGIN || 'https://aehran.in';
const ADMIN_KEY = process.env.ADMIN_API_KEY || ''; // optional extra protection

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', ALLOW);
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (ADMIN_KEY && req.get('X-Admin-Key') !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

async function sf(path, opts = {}) {
  if (!TOKEN || !BASE) throw new Error('Server missing SHADOWFAX_PRODUCTION_TOKEN or SHADOWFAX_BASE_URL');
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: 'Token ' + TOKEN, ...(opts.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || data.error || 'Shadowfax HTTP ' + r.status);
  return data;
}

// TODO(verify with Shadowfax docs / account manager): exact field names + endpoint paths
// differ by Shadowfax product (Marketplace vs Flash). Adjust ONLY these two mappers.
function toShadowfaxOrder({ order, pickup, returnAddress }) {
  return {
    client_order_id: order.id,
    customer_name: order.name,
    customer_phone: order.phone,
    customer_address: [order.address, order.addressArea, order.city, order.state].filter(Boolean).join(', '),
    customer_pincode: order.pincode,
    cod_amount: order.isCod ? order.codAmount : 0,
    order_value: order.total,
    pickup_details: pickup,
    return_details: returnAddress,
    items: order.items,
  };
}
function fromShadowfax(d) {
  return {
    awb: d.awb_number || d.awb || '',
    trackingId: d.tracking_id || d.order_id || d.id || '',
    trackingUrl: d.tracking_url || '',
    status: d.status || 'Created',
    courier: 'Shadowfax',
  };
}

app.post('/api/delivery/shadowfax/shipments', async (req, res) => {
  try {
    const out = await sf(process.env.SHADOWFAX_CREATE_PATH || '/orders', { method: 'POST', body: JSON.stringify(toShadowfaxOrder(req.body)) });
    res.json(fromShadowfax(out));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/delivery/shadowfax/shipments/:id', async (req, res) => {
  try {
    const out = await sf((process.env.SHADOWFAX_TRACK_PATH || '/orders') + '/' + encodeURIComponent(req.params.id));
    res.json(fromShadowfax(out));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000, () => console.log('Shadowfax adapter running'));
