
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load .env from the root directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function findUser() {
  const email = 'aashu9105628720@gmail.com';
  console.log(`Searching for email: ${email}`);
  
  // Note: We can't query auth.users directly with anon key easily, 
  // but we can query the public 'profiles' table which should have the email if it's mirrored or searchable.
  // Wait, does 'profiles' have email? Let's check the schema logic.
  
  // Actually, usually profiles doesn't have email for security, it has 'id'.
  // But let's check if there's any table that maps email to id.
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(10);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Profiles sample:', data);
}

findUser();
