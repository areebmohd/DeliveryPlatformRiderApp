import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabaseClient';

class NotificationService {
  async init(userId?: string) {
    // 1. Setup Notifee Channels (Android)
    if (Platform.OS === 'android') {
      await notifee.createChannel({
        id: 'delivery-alerts',
        name: 'Delivery Alerts',
        lights: true,
        vibration: true,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
      });
    }

    // 2. Request Permissions
    await this.requestUserPermission();

    // 3. Setup Token management if user is logged in
    if (userId) {
      await this.saveTokenToSupabase(userId);
    }
  }

  async requestUserPermission() {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('Authorization status:', authStatus);
    }

    // Also request Notifee permission (Android 13+)
    await notifee.requestPermission();
  }

  async saveTokenToSupabase(userId: string) {
    try {
      const token = await messaging().getToken();
      if (token) {
        const { error } = await supabase
          .from('fcm_tokens')
          .upsert(
            { 
              user_id: userId, 
              token: token, 
              target_group: 'rider',
              updated_at: new Date().toISOString()
            },
            { onConflict: 'user_id,token' }
          );

        if (error) console.error('Error saving FCM token:', error);
      }
    } catch (error) {
      console.error('Error getting FCM token:', error);
    }
  }

  async displayLocalNotification(title: string, body: string, data?: any) {
    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId: 'delivery-alerts',
        importance: AndroidImportance.HIGH,
        pressAction: {
          id: 'default',
        },
        smallIcon: 'ic_launcher',
      },
      data,
    });
  }
}

export const notificationService = new NotificationService();
