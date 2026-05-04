
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function searchRiders() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, full_name')
    .eq('role', 'rider');
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Rider profiles found:', data);
}

searchRiders();
