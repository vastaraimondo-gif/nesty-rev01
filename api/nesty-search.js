import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DISTRICTS = [
  'Adriano','Affori','Baggio','Bande Nere','Barona','Bicocca','Bovisa','Bovisasca','Brera','Bruzzano','Buenos Aires','Centrale','Chiaravalle','Città Studi','Comasina','Corsica','De Angeli','Dergano','Duomo','Farini','Figino','Forze Armate','Gallaratese','Garibaldi','Ghisolfa','Giambellino','Gratosoglio','Greco','Guastalla','Isola','Lambrate','Lodi','Corvetto','Lorenteggio','Loreto','Maciachini','Maggiolina','Magenta','Mecenate','Muggiano','Navigli','Niguarda','Ortica','Padova','Pagano','Parco Lambro','Ponte Lambro','Porta Nuova','Porta Romana','Portello','QT8','Quarto Cagnino','Quarto Oggiaro','Quinto Romano','Quintosole','Ripamonti','Rogoredo','Ronchetto sul Naviglio','San Cristoforo','San Siro','Sarpi','Chinatown','Scalo Romana','Stadera','Tibaldi','Ticinese','Tortona','Tre Torri','Turro','Crescenzago','Gorla','Precotto','Villa San Giovanni','Porta Venezia','Arco della Pace','CityLife','NoLo','Famagosta','Romolo','Santa Giulia'
];

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}
function clean(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/€/g,'').replace(/\./g,'').replace(',', '.').replace(/[^0-9.]/g,''));
  return Number.isFinite(n) ? n : null;
}
function detectDistrict(text = '', fallback = '') {
  const lower = `${clean(text)} ${clean(fallback)}`.toLowerCase();
  return DISTRICTS.find(d => lower.includes(d.toLowerCase())) || fallback || null;
}
function detectType(text = '', fallback = 'room') {
  const lower = clean(text).toLowerCase();
  if (lower.includes('stanza') || lower.includes('camera singola') || lower.includes('posto letto') || lower.includes('room')) return 'room';
  if (lower.includes('appartamento') || lower.includes('bilocale') || lower.includes('monolocale') || lower.includes('trilocale')) return 'apartment';
  return fallback || 'room';
}
function extractPrice(text = '') {
  const m = clean(text).match(/(?:€|EUR)\s?([0-9\.]{3,7})|([0-9\.]{3,7})\s?(?:€|euro)/i);
  return m ? asNumber(m[1] || m[2]) : null;
}
function extractSize(text = '') {
  const m = clean(text).match(/([0-9]{2,4})\s?(mq|m²|metri|sqm)/i);
  return m ? asNumber(m[1]) : null;
}
function normalizeItem(sourceKey, item, params) {
  const title = clean(item.title || item.name || item.summary || item.propertyType || item.snippet || 'Annuncio');
  const description = clean(item.description || item.text || item.raw_text || item.subtitle || item.snippet || '');
  const address = clean(item.address || item.location || item.neighborhood || item.district || item.zone || params.district || '');
  const combined = clean([title, description, address].join(' '));
  const url = item.url || item.link || item.permalink || item.deepLink || item.shareUrl || item.propertyUrl || item.displayed_link || '';
  const externalId = String(item.id || item.propertyCode || item.propertyId || item.external_id || item.code || url || `${sourceKey}-${title}`).slice(0, 300);
  const price = asNumber(item.price || item.rent || item.monthlyPrice || item.amount) || extractPrice(combined);
  const sizeMq = asNumber(item.size || item.size_mq || item.surface || item.area || item.sqm) || extractSize(combined);
  return {
    sourceKey,
    externalId,
    url,
    title,
    text: combined,
    listingType: item.listing_type || item.listingType || item.type || detectType(combined, params.listingType),
    districtName: item.district_name || item.district || item.neighborhood || item.zone || detectDistrict(combined, params.district),
    price,
    sizeMq,
    roomType: /singola|single/i.test(combined) ? 'single' : /doppia|double/i.test(combined) ? 'double' : null,
    expensesIncluded: /spese incluse|incluse|expenses included/i.test(combined)
  };
}
async function saveListing(supabase, listing) {
  if (!listing.price || !listing.districtName || !listing.url) return false;
  const { error } = await supabase.rpc('submit_listing_from_text', {
    p_source_key: listing.sourceKey,
    p_external_id: listing.externalId,
    p_url: listing.url,
    p_title: listing.title,
    p_text: listing.text,
    p_listing_type: listing.listingType === 'room' ? 'room' : 'apartment',
    p_district_name: listing.districtName,
    p_price: listing.price,
    p_size_mq: listing.sizeMq,
    p_room_type: listing.roomType,
    p_expenses_included: listing.expensesIncluded
  });
  return !error;
}
async function sourceGenericFeeds(supabase, params) {
  const feeds = safeJson(process.env.LISTING_FEEDS_JSON, []);
  let found = 0, saved = 0;
  for (const feed of feeds) {
    if (!feed?.enabled || !feed.feed_url) continue;
    const url = feed.feed_url
      .replaceAll('{{query}}', encodeURIComponent(params.query || ''))
      .replaceAll('{{district}}', encodeURIComponent(params.district || 'Milano'))
      .replaceAll('{{type}}', encodeURIComponent(params.listingType || 'room'))
      .replaceAll('{{maxBudget}}', encodeURIComponent(params.maxBudget || ''));
    const res = await fetch(url, { headers: feed.headers || {} });
    if (!res.ok) continue;
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || data.listings || data.results || data.data || []);
    found += items.length;
    for (const item of items) if (await saveListing(supabase, normalizeItem(feed.source_key || 'generic_feed', item, params))) saved++;
  }
  return { found, saved };
}
async function sourceSerpApi(supabase, params) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { found: 0, saved: 0 };
  const sites = params.sites || ['idealista.it', 'immobiliare.it'];
  let found = 0, saved = 0;
  for (const site of sites) {
    const q = `${params.listingType === 'room' ? 'stanza affitto' : 'appartamento affitto'} ${params.district || 'Milano'} Milano max ${params.maxBudget || ''} site:${site}`;
    const url = `https://serpapi.com/search.json?engine=google&hl=it&gl=it&q=${encodeURIComponent(q)}&api_key=${key}`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();
    const items = data.organic_results || [];
    found += items.length;
    for (const item of items) if (await saveListing(supabase, normalizeItem(`serp_${site}`, item, params))) saved++;
  }
  return { found, saved };
}
async function sourceIdealistaParse(supabase, params) {
  const apiKey = process.env.IDEALISTA_PARSE_API_KEY;
  if (!apiKey) return { found: 0, saved: 0 };
  let found = 0, saved = 0;
  const pages = Number(process.env.IDEALISTA_PAGES || 1);
  const minPrice = process.env.IDEALISTA_MIN_PRICE || 0;
  const maxPrice = params.maxBudget || process.env.IDEALISTA_MAX_PRICE || 3000;
  for (let page = 1; page <= pages; page++) {
    const endpoint = `https://api.parse.bot/scraper/355fc7d9-12b3-4d7e-9a57-fcd5514d1f6f/search_properties_for_rent?page=${page}&location=milano-milano&max_price=${maxPrice}&min_price=${minPrice}`;
    const res = await fetch(endpoint, { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) continue;
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || data.results || data.properties || data.listings || []);
    found += items.length;
    for (const item of items) if (await saveListing(supabase, normalizeItem('idealista_parse', item, params))) saved++;
  }
  return { found, saved };
}
async function getCachedResults(supabase, params) {
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
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Supabase server env vars mancanti' });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const params = {
      query: String(req.query.query || ''),
      listingType: String(req.query.listingType || 'room'),
      district: String(req.query.district || ''),
      maxBudget: req.query.maxBudget ? String(req.query.maxBudget) : ''
    };
    const sources = {
      genericFeeds: await sourceGenericFeeds(supabase, params),
      serpApi: await sourceSerpApi(supabase, params),
      idealistaParse: await sourceIdealistaParse(supabase, params)
    };
    const results = await getCachedResults(supabase, params);
    return res.status(200).json({ sources, results });
  } catch (err) {
    return res.status(500).json({ error: 'Ricerca momentaneamente non disponibile', detail: err.message });
  }
}
