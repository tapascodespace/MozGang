import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://bznswadiiqulyzpkajqp.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bnN3YWRpaXF1bHl6cGthanFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NjQzMjQsImV4cCI6MjA3NzM0MDMyNH0.AkVhwJUNM1NKGjR4b5qjEjAfNkszVpqE4TYK7qwxmVM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
