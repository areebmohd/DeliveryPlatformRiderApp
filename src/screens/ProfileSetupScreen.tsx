import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ProfileSetup'>;

const ProfileSetupScreen = ({ navigation, route }: Props) => {
  const isEditing = route.params?.isEditing || false;
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [upiId, setUpiId] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [pincode, setPincode] = useState('');
  const [sectorArea, setSectorArea] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  useEffect(() => {
    fetchCurrentProfile();
  }, []);

  async function fetchCurrentProfile() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
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
    if (!fullName || !phone || !upiId || !addressLine || !pincode || !city || !state) {
      Alert.alert('Error', 'Please fill all mandatory fields');
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
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
      Alert.alert('Error updating profile', profileError.message);
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
      if (addressError) Alert.alert('Error updating address', addressError.message);
    } else {
      const { error: addressError } = await supabase
        .from('addresses')
        .insert([addressData]);
      if (addressError) Alert.alert('Error saving address', addressError.message);
    }

    // 3. Update/Create Rider Profile
    const { data: existingRiderProfile } = await supabase
      .from('rider_profiles')
      .select('id')
      .eq('profile_id', user.id)
      .limit(1);

    if (!existingRiderProfile || existingRiderProfile.length === 0) {
      await supabase.from('rider_profiles').insert([{ profile_id: user.id, upi_id: trimmedUpiId }]);
    } else {
      await supabase.from('rider_profiles').update({ upi_id: trimmedUpiId }).eq('profile_id', user.id);
    }

    setLoading(false);
    if (!isEditing) {
      Alert.alert(
        'Success', 
        'Profile setup complete! You will be redirected to the dashboard in a moment.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert('Success', 'Profile updated!');
      navigation.goBack();
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>{isEditing ? 'Edit Profile' : 'Rider Information'}</Text>
        <Text style={styles.subtitle}>Please provide your details to continue</Text>
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

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Address Details</Text>
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

        <TouchableOpacity style={styles.button} onPress={handleSave} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{isEditing ? 'Update Profile' : 'Complete Setup'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { padding: 24, paddingBottom: 40 },
  header: { marginBottom: 30, marginTop: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#212529', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#6c757d' },
  form: { width: '100%' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#007bff', marginBottom: 15 },
  input: {
    height: 52,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#212529',
    borderWidth: 1,
    borderColor: '#dee2e6',
    marginBottom: 15,
  },
  row: { flexDirection: 'row', marginBottom: 0 },
  button: {
    height: 56,
    backgroundColor: '#007bff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});

export default ProfileSetupScreen;
