import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://szflrpyvxfowfmskamge.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6ZmxycHl2eGZvd2Ztc2thbWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NjY0MDAsImV4cCI6MjA5MDU0MjQwMH0.OcznkZjQBca7wihH8LCMvYwlDmLvcqRITcn8uSFuLKU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);