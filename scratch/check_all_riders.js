
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkAllRiderProfiles() {
  const { data, error } = await supabase
    .from('rider_profiles')
    .select('*');
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('All entries in rider_profiles:', data);
}

checkAllRiderProfiles();
