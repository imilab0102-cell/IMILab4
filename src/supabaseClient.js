import { createClient } from '@supabase/supabase-js'

// Твоє посилання на проект (Project URL)
const supabaseUrl = 'https://kimlvrticnmyckzjpgpx.supabase.co'

// Твій повний публічний ключ, який ти щойно скинув
const supabaseAnonKey = 'sb_publishable_HU2FbNagE_UBIAsSOTgCmQ_jvRqfEU3'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)