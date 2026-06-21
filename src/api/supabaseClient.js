import { createClient } from '@supabase/supabase-js';

// Дані візьміть із вашого Supabase Dashboard (Project Settings -> API)
const supabaseUrl = 'https://kimlvrticnmyckzjpgpx.supabase.co';
const supabaseAnonKey = 'sb_publishable_HU2FbNagE_UBIAsSOTgCmQ_jvRqfEU3';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);