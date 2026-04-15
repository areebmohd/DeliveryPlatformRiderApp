import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BottomTabNavigator from './BottomTabNavigator';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import DeliveryMapScreen from '../screens/DeliveryMapScreen';
import PaymentsScreen from '../screens/PaymentsScreen';
import SupportScreen from '../screens/SupportScreen';
import ProductDetailsScreen from '../screens/ProductDetailsScreen';
import { AuthStackParamList } from './types';
import { useRiderLocation } from '../hooks/useRiderLocation';
import { useProfileCheck } from '../hooks/useProfileCheck';
import { Colors } from '../theme/colors';
import { BackButton } from '../components/ui/BackButton';
import { useEffect } from 'react';

const Stack = createNativeStackNavigator<AuthStackParamList>();

const MainNavigator = ({ userId }: { userId?: string }) => {
  // Start location tracking when rider is in the main navigator
  useRiderLocation(userId);

  const { checkProfileCompleteness } = useProfileCheck();

  useEffect(() => {
    if (userId) {
      checkProfileCompleteness(userId);
    }
  }, [userId, checkProfileCompleteness]);

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
      <Stack.Screen 
        name="Payments" 
        component={PaymentsScreen} 
        options={{ title: 'My Earnings' }} 
      />
      <Stack.Screen 
        name="Support" 
        component={SupportScreen} 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="ProductDetails" 
        component={ProductDetailsScreen} 
        options={{ title: 'Product Details' }} 
      />
    </Stack.Navigator>
  );
};

export default MainNavigator;
