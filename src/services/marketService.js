import { fallbackDistricts } from '../data/fallbackDistricts.js';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';
export async function getDistrictEngineData(){
 if(!isSupabaseConfigured) return {data:fallbackDistricts, source:'fallback'};
 const {data,error}=await supabase.from('district_engine_view').select('*').order('name');
 if(error || !data || data.length===0) return {data:fallbackDistricts, source:'fallback'};
 return {data:data.map(r=>({name:r.name, macro_area:r.macro_area, euro_mq_apartment:Number(r.euro_mq_apartment), median_room_price:Number(r.median_room_price), mobility_score:Number(r.mobility_score), urban_quality_index:Number(r.urban_quality_index), services_score:Number(r.services_score), youth_fit_score:Number(r.youth_fit_score), trend_score:Number(r.trend_score), safety_proxy_score:Number(r.safety_proxy_score), green_score:Number(r.green_score), metro:r.metro || 'Da verificare'})), source:'supabase'};
}
