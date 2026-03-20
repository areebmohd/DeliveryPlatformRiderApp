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

      // Rider profile is complete if they have name, phone, role is rider, and upi_id is present
      // We check for truthy values to ensure they are not empty strings or null
      const isComplete = !!(
        profile?.full_name?.trim() && 
        profile?.phone?.trim() && 
        profile?.role === 'rider' && 
        profile?.upi_id?.trim()
      );
      
      console.log('Profile isComplete:', isComplete);
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
      <NavigationContainer>
        {session && session.user ? (
          profileComplete ? (
            <MainNavigator />
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
    </SafeAreaProvider>
  );
}

export default App;
