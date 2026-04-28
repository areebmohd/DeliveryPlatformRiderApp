import React, { createContext, useContext, useEffect } from 'react';
import messaging from '@react-native-firebase/messaging';
import { supabase } from '../lib/supabaseClient';
import { notificationService } from '../lib/notificationService';

const NotificationContext = createContext({});

export const NotificationProvider = ({ children, userId }: { children: React.ReactNode, userId?: string }) => {
  useEffect(() => {
    // 1. Initialize Service (Permissions + Channels)
    notificationService.init(userId);

    // 2. Handle foreground messages
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      if (remoteMessage.notification) {
        await notificationService.displayLocalNotification(
          remoteMessage.notification.title || 'New Notification',
          remoteMessage.notification.body || '',
          remoteMessage.data
        );
      }
    });

    // 3. Setup real-time listener for database fallback
    // This catches notifications inserted directly into DB (e.g. from handle_order_notifications)
    const channel = supabase
      .channel('rider_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: undefined,
        },
        async (payload) => {
          const { user_id, target_group } = payload.new;

          if (target_group !== 'rider') return;

          // If the notification targets a specific user, FCM will deliver it.
          // Only show a local notification for true broadcasts (user_id is null).
          if (user_id) return;

          await notificationService.displayLocalNotification(
            payload.new.title,
            payload.new.body,
            payload.new.data
          );
        }
      )
      .subscribe();

    return () => {
      unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <NotificationContext.Provider value={{}}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
