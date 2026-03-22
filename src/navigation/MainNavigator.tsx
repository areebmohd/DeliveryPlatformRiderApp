import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BottomTabNavigator from './BottomTabNavigator';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import DeliveryMapScreen from '../screens/DeliveryMapScreen';
import { AuthStackParamList } from './types';
import { useRiderLocation } from '../hooks/useRiderLocation';
import { Colors } from '../theme/colors';
import { BackButton } from '../components/ui/BackButton';

const Stack = createNativeStackNavigator<AuthStackParamList>();

const MainNavigator = ({ userId }: { userId?: string }) => {
  // Start location tracking when rider is in the main navigator
  useRiderLocation(userId);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: Colors.background,
        },
        headerShadowVisible: false,
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 20,
          color: Colors.text,
        },
        headerTitleAlign: 'center',
        headerLeft: () => <BackButton />,
      }}
    >
      <Stack.Screen 
        name="MainTabs" 
        component={BottomTabNavigator} 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="ProfileSetup" 
        component={ProfileSetupScreen} 
        options={{ title: 'Profile Setup' }} 
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={{ title: 'Notifications' }} 
      />
      <Stack.Screen 
        name="DeliveryMap" 
        component={DeliveryMapScreen} 
        options={{ title: 'Delivery Map' }} 
      />
    </Stack.Navigator>
  );
};

export default MainNavigator;
