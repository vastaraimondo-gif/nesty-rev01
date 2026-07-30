import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MILAN_DISTRICTS = [
  'Adriano','Affori','Baggio','Bande Nere','Barona','Bicocca','Bovisa','Bovisasca','Brera','Bruzzano','Buenos Aires','Centrale','Chiaravalle','Città Studi','Comasina','Corsica','De Angeli','Dergano','Duomo','Farini','Figino','Forze Armate','Gallaratese','Garibaldi','Ghisolfa','Giambellino','Gratosoglio','Greco','Guastalla','Isola','Lambrate','Lodi','Corvetto','Lorenteggio','Loreto','Maciachini','Maggiolina','Magenta','Mecenate','Muggiano','Navigli','Niguarda','Ortica','Padova','Pagano','Parco Lambro','Ponte Lambro','Porta Nuova','Porta Romana','Portello','QT8','Quarto Cagnino','Quarto Oggiaro','Quinto Romano','Quintosole','Ripamonti','Rogoredo','Ronchetto sul Naviglio','San Cristoforo','San Siro','Sarpi','Chinatown','Scalo Romana','Stadera','Tibaldi','Ticinese','Tortona','Tre Torri','Turro','Crescenzago','Gorla','Precotto','Villa San Giovanni','Porta Venezia','Arco della Pace','CityLife','NoLo','Famagosta','Romolo','Santa Giulia'
];

const clean = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const asNumber = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/€/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
};
function detectDistrict(text = '') {
  const lower = clean(text).toLowerCase();
  return MILAN_DISTRICTS.find((d) => lower.includes(d.toLowerCase())) || null;
}
function detectType(text = '') {
  const lower = clean(text).toLowerCase();
  if (lower.includes('stanza') || lower.includes('camera singola') || lower.includes('posto letto') || lower.includes('room')) return 'room';
  return 'apartment';
}
function extractPrice(text = '') {
  const m = clean(text).match(/(?:€|EUR)\s?([0-9\.]{3,7})|([0-9\.]{3,7})\s?(?:€|euro)/i);
  return m ? asNumber(m[1] || m[2]) : null;
}
function extractSize(text = '') {
  const m = clean(text).match(/([0-9]{2,4})\s?(mq|m²|metri|sqm)/i);
  return m ? asNumber(m[1]) : null;
}
function normalizeItem(sourceKey, item, fallbackDistrict, fallbackType) {
  const title = clean(item.title || item.name || item.summary || item.propertyType || 'Annuncio');
  const description = clean(item.description || item.text || item.raw_text || item.subtitle || '');
  const address = clean(item.address || item.location || item.neighborhood || item.district || item.zone || '');
  const text = clean([title, description, address, fallbackDistrict].join(' '));
  const url = item.url || item.link || item.permalink || item.deepLink || item.shareUrl || item.propertyUrl || '';
  const externalId = String(item.id || item.propertyCode || item.propertyId || item.external_id || item.code || url || `${sourceKey}-${title}`).slice(0, 300);
  return {
    sourceKey,
    externalId,
    url,
    title,
    text,
    listingType: item.listing_type || item.listingType || item.type || fallbackType || detectType(text),
    districtName: item.district_name || item.district || item.neighborhood || item.zone || detectDistrict(text) || fallbackDistrict,
    price: asNumber(item.price || item.rent || item.monthlyPrice || item.amount) || extractPrice(text),
    sizeMq: asNumber(item.size || item.size_mq || item.surface || item.area || item.sqm) || extractSize(text),
    roomType: /singola|single/i.test(text) ? 'single' : /doppia|double/i.test(text) ? 'double' : null,
    expensesIncluded: /spese incluse|incluse|expenses included/i.test(text)
  };
}
async function saveListing(supabase, normalized) {
  if (!normalized.price || !normalized.districtName) return false;
  const { error } = await supabase.rpc('submit_listing_from_text', {
    p_source_key: normalized.sourceKey,
    p_external_id: normalized.externalId,
    p_url: normalized.url,
    p_title: normalized.title,
    p_text: normalized.text,
    p_listing_type: normalized.listingType === 'room' ? 'room' : 'apartment',
    p_district_name: normalized.districtName,
    p_price: normalized.price,
    p_size_mq: normalized.sizeMq,
    p_room_type: normalized.roomType,
    p_expenses_included: normalized.expensesIncluded
  });
  return !error;
}
async function ingestGenericFeeds(supabase, params) {
  const feeds = JSON.parse(process.env.LISTING_FEEDS_JSON || '[]');
  let found = 0, saved = 0;
  for (const feed of feeds) {
    if (!feed.enabled || !feed.feed_url) continue;
    const url = feed.feed_url
      .replace('{{district}}', encodeURIComponent(params.district || 'Milano'))
      .replace('{{type}}', encodeURIComponent(params.listingType || 'room'))
      .replace('{{maxBudget}}', encodeURIComponent(params.maxBudget || ''));
    const res = await fetch(url, { headers: feed.headers || {} });
    if (!res.ok) continue;
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || data.listings || data.results || data.data || []);
    found += items.length;
    for (const item of items) {
      if (await saveListing(supabase, normalizeItem(feed.source_key || 'generic_feed', item, params.district, params.listingType))) saved++;
    }
  }
  return { found, saved };
}
async function ingestIdealistaParse(supabase, params) {
  const apiKey = process.env.IDEALISTA_PARSE_API_KEY;
  if (!apiKey) return { found: 0, saved: 0 };
  const pages = Number(process.env.IDEALISTA_PAGES || 1);
  const minPrice = process.env.IDEALISTA_MIN_PRICE || 0;
  const maxPrice = params.maxBudget || process.env.IDEALISTA_MAX_PRICE || 3000;
  let found = 0, saved = 0;
  for (let page = 1; page <= pages; page++) {
    const url = `https://api.parse.bot/scraper/355fc7d9-12b3-4d7e-9a57-fcd5514d1f6f/search_properties_for_rent?page=${page}&location=milano-milano&max_price=${maxPrice}&min_price=${minPrice}`;
    const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) continue;
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || data.results || data.properties || data.listings || []);
    found += items.length;
    for (const item of items) {
      if (await saveListing(supabase, normalizeItem('idealista_parse', item, params.district, params.listingType))) saved++;
    }
  }
  return { found, saved };
}
async function queryResults(supabase, params) {
  let q = supabase
    .from('search_results_view')
    .select('*')
    .order('opportunity_score', { ascending: false, nullsFirst: false })
    .order('detected_at', { ascending: false });
  if (params.listingType && params.listingType !== 'any') q = q.eq('listing_type', params.listingType);
  if (params.district) q = q.ilike('district_name', `%${params.district}%`);
  if (params.maxBudget) q = q.lte('price', Number(params.maxBudget));
  const { data, error } = await q.limit(100);
  if (error) throw error;
  return data || [];
}
export default async function handler(req, res) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Missing Supabase server env vars' });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const params = {
      listingType: String(req.query.listingType || 'room'),
      district: String(req.query.district || ''),
      maxBudget: req.query.maxBudget ? String(req.query.maxBudget) : ''
    };
    const generic = await ingestGenericFeeds(supabase, params);
    const idealista = await ingestIdealistaParse(supabase, params);
    const results = await queryResults(supabase, params);
    return res.status(200).json({ imported: { generic, idealista }, results });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
