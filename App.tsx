import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabaseClient';
import { NavigationContainer } from '@react-navigation/native';
import MainNavigator from './src/navigation/MainNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import { CustomAlertProvider } from './src/context/CustomAlertContext';
import { Colors } from './src/theme/colors';

import { NotificationProvider } from './src/context/NotificationContext';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on mount — no need for getSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setInitialLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (initialLoading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.white }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <CustomAlertProvider>
        <NotificationProvider userId={session?.user?.id}>
          <NavigationContainer>
            {session?.user ? (
              <MainNavigator userId={session.user.id} />
            ) : (
              <AuthNavigator />
            )}
          </NavigationContainer>
        </NotificationProvider>
      </CustomAlertProvider>
    </SafeAreaProvider>
  );
}

export default App;
