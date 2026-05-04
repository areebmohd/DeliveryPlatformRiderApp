
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function testRpc() {
  const email = 'aashu9105628720@gmail.com';
  console.log(`Testing RPC for email: ${email}`);
  
  const { data, error } = await supabase.rpc('check_email_exists', {
    email_to_check: email
  });
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Result:', data);
}

testRpc();
