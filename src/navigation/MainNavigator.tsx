import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BottomTabNavigator from './BottomTabNavigator';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import DeliveryMapScreen from '../screens/DeliveryMapScreen';
import { AuthStackParamList } from './types';
import { useRiderLocation } from '../hooks/useRiderLocation';

const Stack = createNativeStackNavigator<AuthStackParamList>();

const MainNavigator = ({ userId }: { userId?: string }) => {
  // Start location tracking when rider is in the main navigator
  useRiderLocation(userId);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
      <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="DeliveryMap" component={DeliveryMapScreen} />
    </Stack.Navigator>
  );
};

export default MainNavigator;
