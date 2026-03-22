import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import { AuthStackParamList } from './types';
import { Colors } from '../theme/colors';
import { BackButton } from '../components/ui/BackButton';

const Stack = createNativeStackNavigator<AuthStackParamList>();

const AuthNavigator = () => {
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
        name="Login" 
        component={LoginScreen} 
        options={{ 
          headerShown: false 
        }} 
      />
      <Stack.Screen 
        name="SignUp" 
        component={SignUpScreen} 
        options={{ 
          title: 'Join Us'
        }} 
      />
      <Stack.Screen 
        name="ProfileSetup" 
        component={ProfileSetupScreen} 
        options={{ 
          title: 'Profile Setup'
        }} 
      />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
