import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

export async function getDistricts() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from('districts').select('name').order('name');
  if (error) return [];
  return (data || []).map(d => d.name).filter(Boolean);
}

export async function fetchSearchResults({ listingType = 'room', district = '', maxBudget = '', query = '' } = {}) {
  const params = new URLSearchParams({
    query: query || `${listingType} ${district} ${maxBudget}`,
    listingType,
    district,
    maxBudget: String(maxBudget || '')
  });
  const response = await fetch(`/api/nesty-search?${params.toString()}`);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Ricerca momentaneamente non disponibile');
  return json.results || [];
}

export async function submitListing(form) {
  if (!isSupabaseConfigured) throw new Error('Supabase non configurato');
  const payload = {
    p_source_key: form.sourceKey || 'user_submitted',
    p_external_id: form.externalId || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    p_url: form.url || null,
    p_title: form.title || 'Annuncio Nesty',
    p_text: form.text || '',
    p_listing_type: form.listingType || 'room',
    p_district_name: form.districtName || null,
    p_price: form.price ? Number(form.price) : null,
    p_size_mq: form.sizeMq ? Number(form.sizeMq) : null,
    p_room_type: form.roomType || null,
    p_expenses_included: Boolean(form.expensesIncluded)
  };
  const { data, error } = await supabase.rpc('submit_listing_from_text', payload);
  if (error) throw error;
  return data;
}
