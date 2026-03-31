import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  StatusBar, 
  ActivityIndicator, 
  ScrollView, 
  RefreshControl 
} from 'react-native';
import { Colors, Spacing, BorderRadius, Typography } from '../theme/colors';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { useCustomAlert } from '../context/CustomAlertContext';

const PaymentsScreen = ({ navigation }: any) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payouts, setPayouts] = useState<any[]>([]);
  const { showAlert } = useCustomAlert();

  const fetchRiderPayouts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch processed payouts
      const { data: payoutsData, error: payoutsError } = await supabase
        .from('payouts')
        .select('*')
        .eq('recipient_id', user.id)
        .eq('recipient_type', 'rider')
        .order('payment_date', { ascending: false });

      if (payoutsError) throw payoutsError;

      // Fetch today's estimated earnings from dashboard stats
      const { data: stats, error: statsError } = await supabase.rpc('get_rider_dashboard_stats', {
        p_rider_id: user.id,
        days_limit: 1
      });

      let finalPayouts = payoutsData || [];
      const today = new Date().toISOString().split('T')[0];
      
      // Check if we already have a payout record for today
      const hasTodayPayout = finalPayouts.some(p => p.payment_date === today);

      // If no formal payout record exists for today, but there are earnings, inject a virtual entry
      if (!hasTodayPayout && stats && stats.total_earnings > 0) {
        finalPayouts = [
          {
            payment_date: today,
            amount: stats.total_earnings.toString(), // amount is usually a string in the DB
            status: 'pending',
            recipient_id: user.id,
            recipient_type: 'rider'
          },
          ...finalPayouts
        ];
      }

      setPayouts(finalPayouts);
    } catch (e: any) {
      console.error('Error fetching payouts:', e);
      showAlert('Error', 'Could not load your payment history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRiderPayouts();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRiderPayouts();
  };

  const groupByDate = (data: any[]) => {
    const today = new Date().toISOString().split('T')[0];
    const groups: Record<string, any> = {};

    data.forEach(p => {
      // Ensure we only use the date part for grouping
      const date = p.payment_date.split('T')[0].split(' ')[0];
      if (!groups[date]) {
        groups[date] = {
          total: 0,
          status: p.status,
          utr: null,
          isToday: date === today
        };
      }
      groups[date].total += parseFloat(p.amount);
      if (p.upi_transaction_id) groups[date].utr = p.upi_transaction_id;
      
      if (p.status !== 'sent' && groups[date].status === 'sent') {
          groups[date].status = p.status;
      }
    });

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  };

  const sortedGroups = groupByDate(payouts);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {sortedGroups.length > 0 ? (
            sortedGroups.map(([date, data]: any) => (
              <View key={date} style={styles.dateGroup}>
                <Text style={styles.dateGroupTitle}>
                  {data.isToday ? 'TODAY' : new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                
                <View style={[styles.card, data.isToday && styles.todayCard]}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={[styles.statusLabel, { color: data.status === 'sent' ? Colors.success : Colors.textSecondary }]}>
                        {data.status === 'sent' ? 'Paid' : data.isToday ? 'Earning in progress...' : 'Pending Settlement'}
                      </Text>
                    </View>
                    <Text style={[styles.amountText, { color: data.status === 'sent' ? Colors.success : Colors.text }]}>₹{data.total.toFixed(2)}</Text>
                  </View>

                  {data.status === 'sent' && data.utr && (
                    <View style={styles.utrBadge}>
                      <Icon name="check-decagram" size={14} color={Colors.success} />
                      <Text style={styles.utrText}>UTR: {data.utr}</Text>
                    </View>
                  )}

                  {data.isToday && (
                    <View style={styles.infoRow}>
                      <Icon name="information" size={16} color={Colors.primary} />
                      <Text style={styles.infoText}>Payment is transferred at the end of the day.</Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Icon name="cash-multiple" size={80} color={Colors.border} />
              <Text style={styles.emptyTitle}>No Earnings Yet</Text>
              <Text style={styles.emptySubtitle}>
                Complete your first delivery to start seeing your daily earnings here.
              </Text>
            </View>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: Spacing.md },
  dateGroup: { marginTop: Spacing.lg },
  dateGroupTitle: { ...Typography.caption, fontWeight: '900', color: Colors.textSecondary, textTransform: 'uppercase', marginBottom: 10, letterSpacing: 1 },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, elevation: 2, shadowColor: Colors.dark, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 5 },
  todayCard: { borderLeftWidth: 4, borderLeftColor: Colors.primary },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { ...Typography.cardTitle, fontSize: 13, fontWeight: '700' },
  amountText: { fontSize: 24, fontWeight: '900' },
  utrBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 15, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Colors.success + '10', borderRadius: BorderRadius.md, gap: 8 },
  utrText: { fontSize: 12, fontWeight: '800', color: Colors.success },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15, gap: 8, padding: 12, backgroundColor: Colors.primary + '08', borderRadius: BorderRadius.md },
  infoText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700', lineHeight: 16, flex: 1 },
  emptyContainer: { marginTop: 100, alignItems: 'center', padding: 40 },
  emptyTitle: { ...Typography.pageTitle, fontSize: 22, marginTop: 20 },
  emptySubtitle: { ...Typography.body, textAlign: 'center', marginTop: 12, color: Colors.textSecondary },
});

export default PaymentsScreen;
