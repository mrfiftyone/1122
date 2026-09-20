import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vulngzfutcalxgbsdypr.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_e9jy5AC9STz0_rURl45mEg_QL98ndo5";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
