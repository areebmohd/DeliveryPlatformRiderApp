import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabaseClient';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainNavigator from './src/navigation/MainNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import ProfileSetupScreen from './src/screens/ProfileSetupScreen';
import { AuthStackParamList } from './src/navigation/types';
import { CustomAlertProvider } from './src/context/CustomAlertContext';



const Stack = createNativeStackNavigator<AuthStackParamList>();

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkProfile(session.user.id);
      } else {
        setInitialLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkProfile(session.user.id);
      } else {
        setProfileComplete(null);
        setInitialLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkProfile(userId: string) {
    try {
      console.log('Checking profile for user:', userId);
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('full_name, phone, role, upi_id')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('No profile record found for user');
        } else {
          console.error('Error fetching profile:', error);
        }
        setProfileComplete(false);
        setInitialLoading(false);
        return;
      }

      console.log('Profile found:', profile);

      // Check basic profile fields
      const hasName = !!profile?.full_name && profile.full_name.trim().length > 0;
      const hasPhone = !!profile?.phone && profile.phone.trim().length > 0;
      const hasUpi = !!profile?.upi_id && profile.upi_id.trim().length > 0;
      const isRider = profile?.role === 'rider';

      // Check address fields
      const { data: address } = await supabase
        .from('addresses')
        .select('address_line, city, state, pincode')
        .eq('user_id', userId)
        .eq('is_default', true)
        .maybeSingle();

      const hasAddress = !!address?.address_line && address.address_line.trim().length > 0;
      const hasCity = !!address?.city && address.city.trim().length > 0;
      const hasState = !!address?.state && address.state.trim().length > 0;
      const hasPincode = !!address?.pincode && address.pincode.trim().length > 0;

      // Check rider profile fields
      const { data: riderProfile } = await supabase
        .from('rider_profiles')
        .select('vehicle_type, vehicle_number')
        .eq('profile_id', userId)
        .maybeSingle();

      const hasVehicleType = !!riderProfile?.vehicle_type && riderProfile.vehicle_type.trim().length > 0;
      const hasVehicleNumber = !!riderProfile?.vehicle_number && riderProfile.vehicle_number.trim().length > 0;

      const isComplete =
        hasName && hasPhone && hasUpi && isRider &&
        hasAddress && hasCity && hasState && hasPincode &&
        hasVehicleType && hasVehicleNumber;

      console.log('Profile Status:', {
        hasName, hasPhone, hasUpi, isRider,
        hasAddress, hasCity, hasState, hasPincode,
        hasVehicleType, hasVehicleNumber,
        isComplete,
      });
      setProfileComplete(isComplete);
    } catch (err) {
      console.error('Unexpected error in checkProfile:', err);
      setProfileComplete(false);
    } finally {
      setInitialLoading(false);
    }
  }

  // To allow manual refresh after profile setup
  useEffect(() => {
    if (session && profileComplete === false) {
      const interval = setInterval(() => checkProfile(session.user.id), 2000);
      return () => clearInterval(interval);
    }
  }, [session, profileComplete]);

  if (initialLoading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
          <ActivityIndicator size="large" color="#007bff" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <CustomAlertProvider>
        <NavigationContainer>
          {session && session.user ? (
            profileComplete ? (
              <MainNavigator userId={session?.user?.id} />
            ) : (
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen 
                  name="ProfileSetup" 
                  component={ProfileSetupScreen} 
                  initialParams={{ isEditing: false }} 
                />
              </Stack.Navigator>
            )
          ) : (
            <AuthNavigator />
          )}
        </NavigationContainer>
      </CustomAlertProvider>
    </SafeAreaProvider>
  );
}

export default App;
