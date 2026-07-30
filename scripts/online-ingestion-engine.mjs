import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MILAN_DISTRICTS = ['Lambrate','Città Studi','Piola','Loreto','Isola','Bicocca','Navigli','Porta Romana','NoLo','Bovisa','De Angeli','San Siro','Romolo','Famagosta','Porta Venezia','Brera','Duomo','Garibaldi','Porta Nuova','Ticinese','Bande Nere','Giambellino','Lorenteggio','Affori','Dergano','Niguarda','Turro','Gorla','Precotto','Corvetto','Rogoredo'];
const clean = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const asNumber = v => { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/€/g,'').replace(/\./g,'').replace(',', '.').replace(/[^0-9.]/g,'')); return Number.isFinite(n) ? n : null; };
function detectDistrict(text=''){ const lower = clean(text).toLowerCase(); return MILAN_DISTRICTS.find(d => lower.includes(d.toLowerCase())) || null; }
function detectType(text=''){ const lower = clean(text).toLowerCase(); return (lower.includes('stanza') || lower.includes('camera singola') || lower.includes('posto letto') || lower.includes('room')) ? 'room' : 'apartment'; }
function extractPrice(text=''){ const m = clean(text).match(/(?:€|EUR)\s?([0-9\.]{3,7})|([0-9\.]{3,7})\s?(?:€|euro)/i); return m ? asNumber(m[1] || m[2]) : null; }
function extractSize(text=''){ const m = clean(text).match(/([0-9]{2,4})\s?(mq|m²|metri|sqm)/i); return m ? asNumber(m[1]) : null; }
function normalizeItem(sourceKey,item){
  const title = clean(item.title || item.name || item.summary || item.propertyType || 'Annuncio');
  const description = clean(item.description || item.text || item.raw_text || item.subtitle || '');
  const address = clean(item.address || item.location || item.neighborhood || item.district || item.zone || '');
  const text = clean([title,description,address].join(' '));
  const url = item.url || item.link || item.permalink || item.deepLink || item.shareUrl || item.propertyUrl || '';
  const externalId = String(item.id || item.propertyCode || item.propertyId || item.external_id || item.code || url || `${sourceKey}-${title}`).slice(0,300);
  return {
    sourceKey,
    externalId,
    url,
    title,
    text,
    listingType: item.listing_type || item.listingType || item.type || detectType(text),
    districtName: item.district_name || item.district || item.neighborhood || item.zone || detectDistrict(text),
    price: asNumber(item.price || item.rent || item.monthlyPrice || item.amount) || extractPrice(text),
    sizeMq: asNumber(item.size || item.size_mq || item.surface || item.area || item.sqm) || extractSize(text),
    roomType: /singola|single/i.test(text) ? 'single' : /doppia|double/i.test(text) ? 'double' : null,
    expensesIncluded: /spese incluse|incluse|expenses included/i.test(text)
  };
}
async function saveListing(n){
  if (!n.price || !n.districtName) return false;
  const { error } = await supabase.rpc('submit_listing_from_text', {
    p_source_key:n.sourceKey, p_external_id:n.externalId, p_url:n.url, p_title:n.title, p_text:n.text,
    p_listing_type:n.listingType === 'room' ? 'room' : 'apartment', p_district_name:n.districtName,
    p_price:n.price, p_size_mq:n.sizeMq, p_room_type:n.roomType, p_expenses_included:n.expensesIncluded
  });
  if(error){ console.error('saveListing error', n.sourceKey, n.externalId, error.message); return false; }
  return true;
}
async function ingestGenericFeeds(){
  const feeds = JSON.parse(process.env.LISTING_FEEDS_JSON || '[]');
  let found=0,saved=0;
  for(const feed of feeds){
    if(!feed.enabled || !feed.feed_url) continue;
    const res = await fetch(feed.feed_url,{headers:feed.headers || {}});
    if(!res.ok){ console.error('feed failed',feed.source_key,res.status); continue; }
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || data.listings || data.results || data.data || []);
    found += items.length;
    for(const item of items) if(await saveListing(normalizeItem(feed.source_key || 'generic_feed', item))) saved++;
  }
  return {found,saved};
}
async function ingestIdealistaParse(){
  const apiKey = process.env.IDEALISTA_PARSE_API_KEY;
  if(!apiKey) return {found:0,saved:0};
  const pages = Number(process.env.IDEALISTA_PAGES || 1);
  const minPrice = process.env.IDEALISTA_MIN_PRICE || 0;
  const maxPrice = process.env.IDEALISTA_MAX_PRICE || 3000;
  let found=0,saved=0;
  for(let page=1; page<=pages; page++){
    const url = `https://api.parse.bot/scraper/355fc7d9-12b3-4d7e-9a57-fcd5514d1f6f/search_properties_for_rent?page=${page}&location=milano-milano&max_price=${maxPrice}&min_price=${minPrice}`;
    const res = await fetch(url,{headers:{'X-API-Key':apiKey}});
    if(!res.ok){ console.error('idealista parse failed',res.status); continue; }
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || data.results || data.properties || data.listings || []);
    found += items.length;
    for(const item of items) if(await saveListing(normalizeItem('idealista_parse', item))) saved++;
  }
  return {found,saved};
}
async function main(){
  const result = { generic_feeds: await ingestGenericFeeds(), idealista_parse: await ingestIdealistaParse() };
  console.log(result);
}
main().catch(e=>{console.error(e); process.exit(1);});
