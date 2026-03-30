import { useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomAlert } from '../context/CustomAlertContext';
import { useNavigation } from '@react-navigation/native';

export const useProfileCheck = () => {
  const { showAlert } = useCustomAlert();
  const navigation = useNavigation<any>();

  const checkProfileCompleteness = useCallback(async (userId: string, showAlertIfIncomplete: boolean = true) => {
    try {
      const [profileRes, addressRes, riderRes] = await Promise.all([
        supabase.from('profiles').select('full_name, phone, role, upi_id').eq('id', userId).single(),
        supabase.from('addresses').select('address_line, city, state, pincode').eq('user_id', userId).eq('is_default', true).maybeSingle(),
        supabase.from('rider_profiles').select('vehicle_type, vehicle_number').eq('profile_id', userId).maybeSingle(),
      ]);

      const p = profileRes.data;
      const a = addressRes.data;
      const r = riderRes.data;

      const isProfileComplete =
        !!p?.full_name?.trim() && !!p?.phone?.trim() && !!p?.upi_id?.trim() && p?.role === 'rider' &&
        !!a?.address_line?.trim() && !!a?.city?.trim() && !!a?.state?.trim() && !!a?.pincode?.trim() &&
        !!r?.vehicle_type?.trim() && !!r?.vehicle_number?.trim();

      if (!isProfileComplete && showAlertIfIncomplete) {
        showAlert(
          'Profile Incomplete',
          'Please Fill your complete information in Profile screen to accept delivery.',
          [
            {
              text: 'Edit Profile',
              onPress: () => navigation.navigate('ProfileSetup', { isEditing: true }),
            },
            { text: 'Not Now', style: 'cancel' },
          ]
        );
      }

      return isProfileComplete;
    } catch (error) {
      console.error('Error checking profile completeness:', error);
      return false;
    }
  }, [showAlert, navigation]);

  return { checkProfileCompleteness };
};
