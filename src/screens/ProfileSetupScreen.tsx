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
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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
    if (!user) {
      setLoading(false);
      return;
    }

    const [profileRes, riderProfileRes, addressRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('rider_profiles').select('*').eq('profile_id', user.id).maybeSingle(),
      supabase.from('addresses').select('*').eq('user_id', user.id).eq('is_default', true).maybeSingle(),
    ]);

    const profile = profileRes.data;
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setUpiId(profile.upi_id || '');
    }

    const riderProfile = riderProfileRes.data;
    if (riderProfile) {
      // Standardize to lowercase bike/truck
      const vt = (riderProfile.vehicle_type || '').toLowerCase();
      setVehicleType(vt === 'truck' ? 'truck' : (vt === 'bike' ? 'bike' : ''));
      setVehicleNumber(riderProfile.vehicle_number || '');
    }

    const address = addressRes.data;
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
    // Identify each missing field by name
    const missingFields: string[] = [];
    if (!fullName.trim())      missingFields.push('Full Name');
    if (!phone.trim())         missingFields.push('Phone Number');
    if (!upiId.trim())         missingFields.push('UPI ID');
    if (!addressLine.trim())   missingFields.push('Address Line');
    if (!sectorArea.trim())    missingFields.push('Sector / Area');
    if (!pincode.trim())       missingFields.push('Pincode');
    if (!city.trim())          missingFields.push('City');
    if (!state.trim())         missingFields.push('State');
    if (!vehicleType.trim())   missingFields.push('Vehicle Type');
    if (!vehicleNumber.trim()) missingFields.push('Vehicle Number');

    if (missingFields.length > 0) {
      showAlert(
        '⚠️ Missing Information',
        `Please fill in the mandatory fields:\n\n• ${missingFields.join('\n• ')}`,
      );
      return;
    }

    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Update Profile (Only if role is null or already rider)
    const { data: currentProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    
    if (currentProfile?.role && currentProfile.role !== 'rider') {
      showAlert('Error', `This account is already registered as a ${currentProfile.role}. You cannot change it to a rider account.`);
      setLoading(false);
      return;
    }

    const trimmedFullName = fullName.trim();
    const trimmedPhone = phone.trim();
    const trimmedUpiId = upiId.trim();

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: trimmedFullName,
        phone: trimmedPhone,
        upi_id: trimmedUpiId,
        role: 'rider',
      })
      .eq('id', user.id);

    if (profileError) {
      showAlert('Error updating profile', profileError.message);
      setLoading(false);
      return;
    }

    // 2. Prepare Address and Rider Profile data
    const addressData = {
      user_id: user.id,
      address_line: addressLine.trim(),
      pincode: pincode.trim(),
      sector_area: sectorArea.trim(),
      city: city.trim(),
      state: state.trim(),
      is_default: true,
    };

    const riderProfileData = {
      profile_id: user.id,
      upi_id: trimmedUpiId,
      vehicle_type: vehicleType.trim(),
      vehicle_number: vehicleNumber.trim(),
    };

    // Run existing checks concurrently
    const [existingAddressRes, existingRiderRes] = await Promise.all([
      supabase.from('addresses').select('id').eq('user_id', user.id).limit(1),
      supabase.from('rider_profiles').select('id').eq('profile_id', user.id).limit(1),
    ]);

    const existingAddress = existingAddressRes.data;
    const existingRiderProfile = existingRiderRes.data;

    // Run insert/update mutations concurrently
    const mutations = [];

    if (existingAddress && existingAddress.length > 0) {
      mutations.push(supabase.from('addresses').update(addressData).eq('id', existingAddress[0].id));
    } else {
      mutations.push(supabase.from('addresses').insert([addressData]));
    }

    if (existingRiderProfile && existingRiderProfile.length > 0) {
      mutations.push(supabase.from('rider_profiles').update(riderProfileData).eq('profile_id', user.id));
    } else {
      mutations.push(supabase.from('rider_profiles').insert([riderProfileData]));
    }

    const mutationResults = await Promise.all(mutations);

    // Check for errors in concurrent mutations
    for (const res of mutationResults) {
      if (res.error) {
        showAlert('Error saving profile data', res.error.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    showAlert(
      'Profile Saved ✓',
      isEditing ? 'Your profile has been updated.' : 'Profile setup complete! You\'re all set.',
      [
        {
          text: 'OK',
          onPress: () => {
            if (isEditing) {
              navigation.goBack();
            }
          },
        },
      ],
    );
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
        contentContainerStyle={[styles.scrollContent, isEditing && styles.scrollContentEditing]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!isEditing && (
          <View style={styles.header}>
            <Text style={styles.heading}>Rider Information</Text>
            <Text style={styles.subheading}>
              It is mandatory to fill all the fields.
            </Text>
          </View>
        )}
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
          
          <View style={styles.vehicleSelector}>
            <TouchableOpacity 
              style={[
                styles.vehicleCard, 
                vehicleType === 'bike' && styles.vehicleCardSelected
              ]} 
              onPress={() => setVehicleType('bike')}
              activeOpacity={0.7}
            >
              <View style={[styles.vehicleIconCircle, vehicleType === 'bike' && styles.vehicleIconCircleSelected]}>
                <Icon name="moped" size={28} color={vehicleType === 'bike' ? Colors.white : Colors.primary} />
              </View>
              <Text style={[styles.vehicleLabel, vehicleType === 'bike' && styles.vehicleLabelSelected]}>Bike</Text>
              <Text style={styles.vehicleDesc}>Quick & efficient</Text>
              {vehicleType === 'bike' && (
                <View style={styles.checkBadge}>
                  <Icon name="check" size={12} color={Colors.white} />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.vehicleCard, 
                vehicleType === 'truck' && styles.vehicleCardSelected
              ]} 
              onPress={() => setVehicleType('truck')}
              activeOpacity={0.7}
            >
              <View style={[styles.vehicleIconCircle, vehicleType === 'truck' && styles.vehicleIconCircleSelected]}>
                <Icon name="truck-delivery" size={28} color={vehicleType === 'truck' ? Colors.white : Colors.primary} />
              </View>
              <Text style={[styles.vehicleLabel, vehicleType === 'truck' && styles.vehicleLabelSelected]}>Truck</Text>
              <Text style={styles.vehicleDesc}>Large & bulky</Text>
              {vehicleType === 'truck' && (
                <View style={styles.checkBadge}>
                  <Icon name="check" size={12} color={Colors.white} />
                </View>
              )}
            </TouchableOpacity>
          </View>

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
  scrollContentEditing: { paddingTop: 12 },
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
  vehicleSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  vehicleCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    position: 'relative',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  vehicleCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
    borderWidth: 2,
  },
  vehicleIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  vehicleIconCircleSelected: {
    backgroundColor: Colors.primary,
  },
  vehicleLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  vehicleLabelSelected: {
    color: Colors.primary,
  },
  vehicleDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ProfileSetupScreen;
