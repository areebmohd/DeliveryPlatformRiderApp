import { useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { supabase } from '../lib/supabaseClient';
import { useCustomAlert } from '../context/CustomAlertContext';

export const useRiderLocation = (userId: string | undefined) => {
  const watchId = useRef<number | null>(null);
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    if (!userId) return;

    const requestPermission = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'Rider App needs access to your location to assign deliveries.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          showAlert('Permission Denied', 'Location permission is required for deliveries.');
          return;
        }
      }

      startTracking();
    };

    const startTracking = () => {

      watchId.current = Geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          console.log('Rider Location Update:', latitude, longitude);
          
          // Update location in Supabase rider_profiles
          const { error } = await supabase
            .from('rider_profiles')
            .update({
              current_location: `POINT(${longitude} ${latitude})`,
              updated_at: new Date().toISOString(),
            })
            .eq('profile_id', userId);

          if (error) {
            console.error('Error updating rider location:', error);
          }
        },
        (error) => {
          console.error('Geolocation Watch Error:', error);
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 10, // Update every 10 meters
          interval: 10000,    // Or every 10 seconds
          fastestInterval: 5000,
        }
      );
    };

    requestPermission();

    return () => {
      if (watchId.current !== null) {
        Geolocation.clearWatch(watchId.current);
      }
    };
  }, [userId, showAlert]);
};
