"use server";

import { createClient } from "@supabase/supabase-js";
import { containsProfanity } from "@/utils/moderation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function submitPostServer(payload: any, customBannedWords: string[] = []) {
  if (containsProfanity(payload.title, customBannedWords) || containsProfanity(payload.body, customBannedWords)) {
    return { error: "Profanity detected by server" };
  }
  const { data, error } = await supabase.from('posts').insert([payload]).select('id').single();
  if (error) return { error: error.message };
  return { data };
}

export async function submitCommentServer(payload: any, customBannedWords: string[] = []) {
  if (containsProfanity(payload.text, customBannedWords)) {
    return { error: "Profanity detected by server" };
  }
  const { data, error } = await supabase.from('comments').insert([payload]);
  if (error) return { error: error.message };
  return { data };
}
