import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../navigation/types';
import { Colors, BorderRadius, UI, Typography } from '../theme/colors';
import { useCustomAlert } from '../context/CustomAlertContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmailOTP'>;

const VerifyEmailOTPScreen = ({ navigation, route }: Props) => {
  const { email } = route.params;
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const { showAlert } = useCustomAlert();

  const handleVerifyOTP = async () => {
    if (otp.length < 6) {
      showAlert('Error', 'Please enter the verification code');
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.toLowerCase().trim();
      
      // Try with 'signup' type first as it's the most common for new accounts
      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: otp,
        type: 'signup',
      });

      if (error) {
        // Fallback to 'email' type if 'signup' fails (sometimes used for existing users)
        console.log('Verification with type signup failed, trying email:', error.message);
        const { data: retryData, error: retryError } = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token: otp,
          type: 'email',
        });
        
        if (retryError) throw retryError;
        
        showAlert('Success', 'Email verified successfully! You can now log in.');
        navigation.navigate('Login');
      } else {
        showAlert('Success', 'Email verified successfully! You can now log in.');
        navigation.navigate('Login');
      }
      
    } catch (error: any) {
      showAlert('Error', error.message || 'Invalid or expired code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        email: email,
        type: 'signup',
      });
      if (error) throw error;
      showAlert('Success', 'A new verification code has been sent.');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar backgroundColor={Colors.background} barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Confirm Email</Text>
          <Text style={styles.subtitle}>
            Enter the verification code sent to {email} to verify your account.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Verification Code</Text>
            <TextInput
              style={styles.otpInput}
              placeholder="00000000"
              placeholderTextColor="#999"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={8}
              autoFocus
            />
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={handleVerifyOTP}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>Verify & Log In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resendBtn}
            onPress={handleResendOTP}
            disabled={loading}
          >
            <Text style={styles.resendText}>
              Didn't receive a code?{' '}
              <Text style={styles.resendHighlight}>Resend Email</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: UI.screenPadding,
    paddingTop: 32,
    flexGrow: 1,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    ...Typography.label,
    color: Colors.text,
    marginBottom: 8,
  },
  otpInput: {
    height: 60,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.input,
    paddingHorizontal: 16,
    fontSize: 24,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlign: 'center',
    letterSpacing: 8,
    fontWeight: '700',
  },
  button: {
    height: UI.buttonHeight,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.button,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: Colors.white,
    ...Typography.button,
  },
  resendBtn: {
    marginTop: 30,
    alignItems: 'center',
  },
  resendText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  resendHighlight: {
    color: Colors.primary,
    fontWeight: '700',
  },
});

export default VerifyEmailOTPScreen;
