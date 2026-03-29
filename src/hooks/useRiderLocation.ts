import { useEffect, useRef, useCallback } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { supabase } from '../lib/supabaseClient';
import { useCustomAlert } from '../context/CustomAlertContext';

export const useRiderLocation = (userId: string | undefined) => {
  const watchId = useRef<number | null>(null);
  const { showAlert } = useCustomAlert();
  // Stabilize showAlert reference so it doesn't re-trigger the effect
  const showAlertRef = useRef(showAlert);
  useEffect(() => { showAlertRef.current = showAlert; }, [showAlert]);

  const startTracking = useCallback(() => {
    watchId.current = Geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        await supabase
          .from('rider_profiles')
          .update({
            current_location: `POINT(${longitude} ${latitude})`,
            updated_at: new Date().toISOString(),
          })
          .eq('profile_id', userId);
      },
      (error) => {
        console.error('Geolocation Watch Error:', error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 10,   // Update every 10 meters
        interval: 10000,       // Or every 10 seconds
        fastestInterval: 5000,
      }
    );
  }, [userId]);

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
          showAlertRef.current('Permission Denied', 'Location permission is required for deliveries.');
          return;
        }
      }
      startTracking();
    };

    requestPermission();

    return () => {
      if (watchId.current !== null) {
        Geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [userId, startTracking]);
};
