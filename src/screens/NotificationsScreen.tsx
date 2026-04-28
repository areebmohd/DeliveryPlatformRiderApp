import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  SectionList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { Colors, BorderRadius } from '../theme/colors';

const NotificationsScreen = ({ }: any) => {
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      fetchNotifications(user.id);
    } else {
      setLoading(false);
    }
  };

  const fetchNotifications = async (currentUserId?: string) => {
    try {
      const uid = currentUserId || userId;
      if (!uid) return;

      if (!refreshing) setLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .or(`user_id.eq.${uid},and(user_id.is.null,target_group.eq.rider)`)
        .order('created_at', { ascending: false });

      if (error) throw error;


      // Group by date
      const grouped: { [key: string]: any[] } = {};
      data?.forEach(notif => {
        const date = new Date(notif.created_at);
        const dateStr = date.toDateString();

        let label = dateStr;
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        if (dateStr === today) label = 'Today';
        else if (dateStr === yesterday) label = 'Yesterday';

        if (!grouped[label]) grouped[label] = [];
        grouped[label].push(notif);
      });

      const sectionData = Object.keys(grouped).map(key => ({
        title: key,
        data: grouped[key],
      }));

      setSections(sectionData);
    } catch (e) {
      console.error('Error fetching notifications:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };


  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.notificationCard}>
      <View style={styles.iconContainer}>
        <Icon name="message-alert-outline" size={22} color={Colors.primary} />
      </View>
      <View style={styles.textContainer}>
        <View style={styles.cardHeader}>
          <Text style={styles.notifTitle}>{item.title}</Text>
          <Text style={styles.notifTime}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <Text style={styles.notifDesc}>{item.description}</Text>
      </View>
    </View>
  );

  const renderSectionHeader = ({ section: { title } }: any) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar backgroundColor={Colors.background} barStyle="dark-content" />
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="bell-off-outline" size={80} color={Colors.border} />
              <Text style={styles.emptyTitle}>No Notifications</Text>
              <Text style={styles.emptySubtitle}>
                Administrative updates for riders will appear here.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingVertical: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: BorderRadius.card,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  notifTime: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  notifDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default NotificationsScreen;
