import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabaseClient';
import { useCustomAlert } from '../context/CustomAlertContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../navigation/types';
import { Colors, BorderRadius, UI, Typography } from '../theme/colors';

type Props = NativeStackScreenProps<AuthStackParamList, 'ProfileSetup'>;

const ProfileSetupScreen = ({ navigation, route }: Props) => {
  const isEditing = route.params?.isEditing || false;
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const { showAlert } = useCustomAlert();
  const [phone, setPhone] = useState('');
  const [upiId, setUpiId] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [pincode, setPincode] = useState('');
  const [sectorArea, setSectorArea] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');

  useEffect(() => {
    fetchCurrentProfile();
  }, []);

  async function fetchCurrentProfile() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setUpiId(profile.upi_id || '');
    }

    const { data: riderProfile } = await supabase
      .from('rider_profiles')
      .select('*')
      .eq('profile_id', user.id)
      .single();

    if (riderProfile) {
      setVehicleType(riderProfile.vehicle_type || '');
      setVehicleNumber(riderProfile.vehicle_number || '');
    }

    const { data: address } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single();

    if (address) {
      setAddressLine(address.address_line || '');
      setPincode(address.pincode || '');
      setSectorArea(address.sector_area || '');
      setCity(address.city || '');
      setState(address.state || '');
    }
    setLoading(false);
  }

  async function handleSave() {
    if (
      !fullName ||
      !phone ||
      !upiId ||
      !addressLine ||
      !pincode ||
      !city ||
      !state ||
      !vehicleType ||
      !vehicleNumber
    ) {
      showAlert(
        'Error',
        'Please fill all mandatory fields (including vehicle details)',
      );
      return;
    }

    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Update Profile
    const trimmedFullName = fullName.trim();
    const trimmedPhone = phone.trim();
    const trimmedUpiId = upiId.trim();

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: trimmedFullName,
        phone: trimmedPhone,
        upi_id: trimmedUpiId,
        role: 'rider', // Ensure role is rider
      })
      .eq('id', user.id);

    if (profileError) {
      showAlert('Error updating profile', profileError.message);
      setLoading(false);
      return;
    }

    // 2. Update/Create Address
    const { data: existingAddress } = await supabase
      .from('addresses')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    const addressData = {
      user_id: user.id,
      address_line: addressLine.trim(),
      pincode: pincode.trim(),
      sector_area: sectorArea.trim(),
      city: city.trim(),
      state: state.trim(),
      is_default: true,
      receiver_name: trimmedFullName,
      receiver_phone: trimmedPhone,
    };

    if (existingAddress && existingAddress.length > 0) {
      const { error: addressError } = await supabase
        .from('addresses')
        .update(addressData)
        .eq('id', existingAddress[0].id);
      if (addressError)
        showAlert('Error updating address', addressError.message);
    } else {
      const { error: addressError } = await supabase
        .from('addresses')
        .insert([addressData]);
      if (addressError) showAlert('Error saving address', addressError.message);
    }

    // 3. Update/Create Rider Profile
    const { data: existingRiderProfile } = await supabase
      .from('rider_profiles')
      .select('id')
      .eq('profile_id', user.id)
      .limit(1);

    const riderProfileData = {
      profile_id: user.id,
      upi_id: trimmedUpiId,
      vehicle_type: vehicleType.trim(),
      vehicle_number: vehicleNumber.trim(),
    };

    if (!existingRiderProfile || existingRiderProfile.length === 0) {
      await supabase.from('rider_profiles').insert([riderProfileData]);
    } else {
      await supabase
        .from('rider_profiles')
        .update(riderProfileData)
        .eq('profile_id', user.id);
    }

    setLoading(false);
    if (!isEditing) {
      showAlert(
        'Success',
        'Profile setup complete! Please wait a moment while we set things up.',
        [
          {
            text: 'OK',
            onPress: () => {
              // No explicit navigation needed as App.tsx's interval will catch it,
              // but we can try to pop to top to trigger a re-render if possible.
              // However, popping might fail if we're not in a stack.
              // The interval is at 2 seconds, which is fast enough.
            },
          },
        ],
      );
    } else {
      showAlert('Success', 'Profile updated!');
      navigation.goBack();
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={isEditing ? ['bottom'] : ['top', 'bottom']}>
      <StatusBar backgroundColor="#f8f9fa" barStyle="dark-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>Rider Information</Text>
          <Text style={styles.subheading}>
            It is mandatory to fill all the fields.
          </Text>
        </View>
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Personal Details</Text>
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#999"
            value={fullName}
            onChangeText={setFullName}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone Number"
            placeholderTextColor="#999"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="UPI ID (for payments)"
            placeholderTextColor="#999"
            value={upiId}
            onChangeText={setUpiId}
            autoCapitalize="none"
          />

          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
            Address Details
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Address Line 1"
            placeholderTextColor="#999"
            value={addressLine}
            onChangeText={setAddressLine}
          />
          <TextInput
            style={styles.input}
            placeholder="Sector / Area"
            placeholderTextColor="#999"
            value={sectorArea}
            onChangeText={setSectorArea}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: 10 }]}
              placeholder="Pincode"
              placeholderTextColor="#999"
              value={pincode}
              onChangeText={setPincode}
              keyboardType="number-pad"
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="City"
              placeholderTextColor="#999"
              value={city}
              onChangeText={setCity}
            />
          </View>
          <TextInput
            style={styles.input}
            placeholder="State"
            placeholderTextColor="#999"
            value={state}
            onChangeText={setState}
          />

          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
            Vehicle Details
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Vehicle Type (e.g. Honda Activa)"
            placeholderTextColor="#999"
            value={vehicleType}
            onChangeText={setVehicleType}
          />
          <TextInput
            style={styles.input}
            placeholder="Vehicle Number (e.g. DL 1S AB 1234)"
            placeholderTextColor="#999"
            value={vehicleNumber}
            onChangeText={setVehicleNumber}
            autoCapitalize="characters"
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isEditing ? 'Update Profile' : 'Complete Setup'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: UI.screenPadding, paddingBottom: 40 },
  header: { marginBottom: 28 },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.primary,
  },
  subheading: {
    fontSize: 13,
    color: Colors.danger,
    fontWeight: '500',
  },
  form: { width: '100%' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 14,
  },
  input: {
    height: UI.inputHeight,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.input,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  row: { flexDirection: 'row', marginBottom: 0 },
  button: {
    height: UI.buttonHeight,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.button,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: { color: Colors.white, ...Typography.button },
});

export default ProfileSetupScreen;
