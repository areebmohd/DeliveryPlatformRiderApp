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

  // Summary calculations
  const totalEarned = payouts.filter(p => p.status === 'sent').reduce((acc, p) => acc + parseFloat(p.amount), 0);
  const pendingSettlement = payouts.filter(p => p.status !== 'sent').reduce((acc, p) => acc + parseFloat(p.amount), 0);
  const lastPayout = payouts.find(p => p.status === 'sent');

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
          {/* Summary Dashboard */}
          <View style={styles.summaryContainer}>
            <View style={styles.mainSummaryCard}>
              <Text style={styles.summaryLabel}>Total Earned</Text>
              <Text style={styles.totalEarnedText}>₹{totalEarned.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              {lastPayout && (
                <View style={styles.lastPayoutContainer}>
                  <Icon name="clock-check-outline" size={12} color={Colors.white + '90'} />
                  <Text style={styles.lastPayoutText}>
                    Last payout: ₹{parseFloat(lastPayout.amount).toFixed(2)} on {new Date(lastPayout.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.secondaryStatsRow}>
              <View style={[styles.statCard, { backgroundColor: Colors.white }]}>
                <View style={[styles.statIconContainer, { backgroundColor: Colors.primary + '10' }]}>
                  <Icon name="timer-sand" size={20} color={Colors.primary} />
                </View>
                <View>
                  <Text style={styles.statLabel}>Pending</Text>
                  <Text style={[styles.statValue, { color: Colors.primary }]}>₹{pendingSettlement.toFixed(2)}</Text>
                </View>
              </View>

              <View style={[styles.statCard, { backgroundColor: Colors.white }]}>
                <View style={[styles.statIconContainer, { backgroundColor: Colors.success + '10' }]}>
                  <Icon name="check-circle-outline" size={20} color={Colors.success} />
                </View>
                <View>
                  <Text style={styles.statLabel}>Processed</Text>
                  <Text style={[styles.statValue, { color: Colors.success }]}>₹{totalEarned.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Settlements</Text>
          </View>

          {sortedGroups.length > 0 ? (
            sortedGroups.map(([date, data]: any) => (
              <View key={date} style={styles.dateGroup}>
                <View style={[styles.card, data.isToday && styles.todayCard]}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.dateInfo}>
                      <Text style={styles.dateText}>
                        {data.isToday ? 'Today' : new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                      <View style={[
                        styles.statusBadge, 
                        { backgroundColor: data.status === 'sent' ? Colors.success + '15' : Colors.primary + '15' }
                      ]}>
                        <View style={[
                          styles.statusDot, 
                          { backgroundColor: data.status === 'sent' ? Colors.success : Colors.primary }
                        ]} />
                        <Text style={[
                          styles.statusText, 
                          { color: data.status === 'sent' ? Colors.success : Colors.primary }
                        ]}>
                          {data.status === 'sent' ? 'Settled' : 'Processing'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.cardAmountText}>₹{data.total.toFixed(2)}</Text>
                  </View>

                  {data.status === 'sent' && data.utr && (
                    <View style={styles.utrSection}>
                      <Text style={styles.utrLabel}>UTR Number</Text>
                      <Text style={styles.utrValue}>{data.utr}</Text>
                    </View>
                  )}

                  {data.isToday && (
                    <View style={styles.todayInfoBox}>
                      <Icon name="information-outline" size={14} color={Colors.primary} />
                      <Text style={styles.todayInfoText}>Earnings are typically settled within 24 hours.</Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Icon name="wallet-outline" size={40} color={Colors.border} />
              </View>
              <Text style={styles.emptyStateTitle}>Your wallet is empty</Text>
              <Text style={styles.emptyStateSubtitle}>
                Perform deliveries to start earning. Your daily balance will appear here.
              </Text>
            </View>
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: Spacing.md },
  
  // Summary Styles
  summaryContainer: { marginTop: Spacing.md, marginBottom: Spacing.lg },
  mainSummaryCard: { 
    backgroundColor: Colors.primary, 
    borderRadius: BorderRadius.xl, 
    padding: Spacing.lg, 
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  summaryLabel: { color: Colors.white + '90', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  totalEarnedText: { color: Colors.white, fontSize: 36, fontWeight: '900', marginTop: 4 },
  lastPayoutContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 6 },
  lastPayoutText: { color: Colors.white + '90', fontSize: 12, fontWeight: '500' },
  
  secondaryStatsRow: { flexDirection: 'row', marginTop: Spacing.md, gap: Spacing.md },
  statCard: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: Spacing.md, 
    borderRadius: BorderRadius.lg,
    elevation: 2,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    gap: 12
  },
  statIconContainer: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  statLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  statValue: { fontSize: 16, fontWeight: '800', marginTop: 2 },

  // Section Styles
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm, marginBottom: Spacing.sm },
  sectionTitle: { ...Typography.sectionLabel, color: Colors.text, fontSize: 16 },

  // Card Styles
  dateGroup: { marginBottom: Spacing.md },
  card: { 
    backgroundColor: Colors.white, 
    borderRadius: BorderRadius.lg, 
    padding: Spacing.md, 
    elevation: 3, 
    shadowColor: Colors.dark, 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.08, 
    shadowRadius: 4 
  },
  todayCard: { borderLeftWidth: 4, borderLeftColor: Colors.primary },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  dateInfo: { gap: 6 },
  dateText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  statusBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  cardAmountText: { fontSize: 20, fontWeight: '900', color: Colors.text },
  
  utrSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border + '50' },
  utrLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: '600', textTransform: 'uppercase' },
  utrValue: { fontSize: 12, fontWeight: '700', color: Colors.text, marginTop: 2 },
  
  todayInfoBox: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8, padding: 10, backgroundColor: Colors.primary + '08', borderRadius: BorderRadius.md },
  todayInfoText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', flex: 1 },

  // Empty State Styles
  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 40 },
  emptyIconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.border + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyStateTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  emptyStateSubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});

export default PaymentsScreen;
