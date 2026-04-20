import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import VerifyResetOTPScreen from '../screens/VerifyResetOTPScreen';
import VerifyEmailOTPScreen from '../screens/VerifyEmailOTPScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import { AuthStackParamList } from './types';
import { Colors } from '../theme/colors';
import { BackButton } from '../components/ui/BackButton';

const Stack = createNativeStackNavigator<AuthStackParamList>();

const AuthHeaderLeft = () => <BackButton />;

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
        headerLeft: AuthHeaderLeft,
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
      <Stack.Screen 
        name="ForgotPassword" 
        component={ForgotPasswordScreen} 
        options={{ 
          title: 'Forgot Password'
        }} 
      />
      <Stack.Screen 
        name="VerifyEmailOTP" 
        component={VerifyEmailOTPScreen} 
        options={{ 
          title: 'Verify Email'
        }} 
      />
      <Stack.Screen 
        name="VerifyResetOTP" 
        component={VerifyResetOTPScreen} 
        options={{ 
          title: 'Verify Code'
        }} 
      />
      <Stack.Screen 
        name="ResetPassword" 
        component={ResetPasswordScreen} 
        options={{ 
          title: 'New Password'
        }} 
      />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
