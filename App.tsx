import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkProfile(session.user.id);
      } else {
        setProfileComplete(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkProfile(userId: string) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, phone')
      .eq('id', userId)
      .single();

    const isComplete = !!(profile?.full_name && profile?.phone);
    setProfileComplete(isComplete);
  }

  // To allow manual refresh after profile setup
  useEffect(() => {
    if (session && profileComplete === false) {
      const interval = setInterval(() => checkProfile(session.user.id), 3000);
      return () => clearInterval(interval);
    }
  }, [session, profileComplete]);

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
