
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkRiderProfile() {
  const userId = 'e8eb3558-74bd-45d1-9373-93e5d28f7b05';
  
  const { data, error } = await supabase
    .from('rider_profiles')
    .select('*')
    .eq('profile_id', userId);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Rider Profiles found:', data);
}

checkRiderProfile();
