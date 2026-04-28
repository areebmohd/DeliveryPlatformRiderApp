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
  StatusBar,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useCustomAlert } from '../context/CustomAlertContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../navigation/types';
import { Colors, BorderRadius, UI, Typography } from '../theme/colors';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const LoginScreen = ({ navigation }: Props) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showAlert } = useCustomAlert();

  async function signInWithEmail() {
    if (!email || !password) {
      showAlert('Error', 'Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: password,
      });

      if (authError) {
        if (authError.message.toLowerCase().includes('email not confirmed')) {
          // Send OTP and navigate to verification
          try {
            await supabase.auth.resend({
              type: 'signup',
              email: email.toLowerCase().trim(),
            });
            showAlert('Verification Required', 'Your email is not verified. A new code has been sent.');
            navigation.navigate('VerifyEmailOTP', { email: email.toLowerCase().trim() });
          } catch (resendError: any) {
            showAlert('Login failed', resendError.message || authError.message);
          }
        } else {
          showAlert('Login failed', authError.message);
        }
        setLoading(false);
        return;
      }

      if (authData.user) {
        // Verify role
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          // If profile doesn't exist, it might be a brand new user, let them through to setup
        } else if (profile && profile.role && profile.role !== 'rider') {
          // Block access for non-rider roles
          const roleLabel = profile.role === 'store' ? 'Business' : profile.role.charAt(0).toUpperCase() + profile.role.slice(1);
          await supabase.auth.signOut();
          showAlert(
            'Access Denied',
            `This account is registered as a ${roleLabel}. One email can only be used for one account type. Please use a different email or log in to the appropriate app.`
          );
          setLoading(false);
          return;
        }
      }

    } catch {
      showAlert('Login Error', 'An unexpected error occurred');
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar backgroundColor={Colors.background} barStyle="dark-content" />
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.logoText}>Zoro Rider App</Text>
          <Text style={styles.subtitle}>Welcome back, login to start delivery</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. rider@example.com"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.eyeIconText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={signInWithEmail}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('SignUp')}
          >
            <Text style={styles.linkText}>
              Don't have an account?{' '}
              <Text style={styles.linkHighlight}>Create</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotBtn}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            <Text style={styles.forgotBtnText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  inner: {
    flex: 1,
    padding: UI.screenPadding,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 40,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
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
  input: {
    height: UI.inputHeight,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.input,
    paddingHorizontal: 16,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  passwordInput: {
    height: UI.inputHeight,
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    borderWidth: 0,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.input,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingRight: 12,
  },
  eyeIcon: {
    padding: 8,
  },
  eyeIconText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
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
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  linkHighlight: {
    color: Colors.primary,
    fontWeight: '700',
  },
  forgotBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  forgotBtnText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
});

export default LoginScreen;
