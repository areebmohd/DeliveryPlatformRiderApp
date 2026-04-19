import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useCustomAlert } from '../context/CustomAlertContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Typography, BorderRadius } from '../theme/colors';

const { width } = Dimensions.get('window');

type Timeframe = 'daily' | 'weekly' | 'monthly';

interface DashboardStats {
  completed_deliveries: number;
  total_earnings: number;
  acceptance_rate: number;
}

const RIDER_PRO_TIPS = [
  {
    id: '1',
    title: 'Acceptance Rate',
    text: 'High acceptance rate helps you get priority for new available orders in your area!',
    icon: 'trending-up',
    color: Colors.warning,
  },
  {
    id: '2',
    title: 'Product Verification',
    text: 'Properly check and verify all products when picking up from stores, including their working and expiry dates.',
    icon: 'clipboard-check-outline',
    color: '#3b82f6',
  },
  {
    id: '3',
    title: 'Customer Verification',
    text: 'Ask the customer to check and verify products again during delivery to avoid any complaints.',
    icon: 'account-check-outline',
    color: '#10b981',
  },
  {
    id: '4',
    title: 'Payment Verification',
    text: 'Always verify payment is received from customer in PhonePe Business during delivery.',
    icon: 'shield-check-outline',
    color: '#8b5cf6',
  },
];

const DashboardScreen = () => {
  const { showAlert } = useCustomAlert();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('daily');
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const fetchDashboardData = useCallback(async (selectedTimeframe: Timeframe) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const days = selectedTimeframe === 'daily' ? 1 : selectedTimeframe === 'weekly' ? 7 : 30;
      
      const { data, error } = await supabase.rpc('get_rider_dashboard_stats', {
        p_rider_id: user.id,
        days_limit: days,
      });

      if (error) throw error;
      setStats(data as DashboardStats);
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error.message);
      showAlert('Error', 'Failed to fetch dashboard data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchDashboardData(timeframe);
  }, [timeframe, fetchDashboardData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData(timeframe);
  };

  const formatCurrency = (amount: number) => {
    return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`;
  };

  const StatCard = ({ title, value, icon, color, subtitle, suffix = "" }: any) => (
    <View style={styles.statCard}>
      <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
        <Icon name={icon} size={24} color={color} />
      </View>
      <View style={styles.statInfo}>
        <Text style={styles.statLabel} numberOfLines={1}>{title}</Text>
        <Text style={[styles.statValue, { color: Colors.text }]}>{value}{suffix}</Text>
        {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
      </View>
    </View>
  );

  const TimeframeButton = ({ label, value }: { label: string; value: Timeframe }) => (
    <TouchableOpacity
      style={[
        styles.timeframeBtn,
        timeframe === value && styles.timeframeBtnActive,
      ]}
      onPress={() => {
        setLoading(true);
        setTimeframe(value);
      }}>
      <Text
        style={[
          styles.timeframeText,
          timeframe === value && styles.timeframeTextActive,
        ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Hello, Delivery Partner!</Text>
        <Text style={styles.dashboardSubtitle}>Track your earnings and progress</Text>
        
        <View style={styles.timeframeContainer}>
          <TimeframeButton label="Daily" value="daily" />
          <TimeframeButton label="Weekly" value="weekly" />
          <TimeframeButton label="Monthly" value="monthly" />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }>
        
        {/* Main Earnings Card */}
        <View style={styles.mainFinanceCard}>
          <View style={styles.mainFinanceContent}>
            <Text style={styles.mainFinanceLabel}>Estimated Earnings</Text>
            <Text style={styles.mainFinanceValue}>
              {formatCurrency(stats?.total_earnings || 0)}
            </Text>
            <Text style={styles.earningsTip}>Earned from completed deliveries</Text>
          </View>
          <View style={styles.mainFinanceIcon}>
            <Icon name="cash-multiple" size={40} color={Colors.white} />
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard
            title="Completed"
            value={stats?.completed_deliveries || 0}
            icon="check-decagram"
            color={Colors.success}
            subtitle="Deliveries"
          />
          <StatCard
            title="Acceptance"
            value={stats?.acceptance_rate || 0}
            icon="hand-okay"
            color={Colors.primary}
            subtitle="Rate"
            suffix="%"
          />
        </View>

        {/* Tip/Info Section */}
        <View style={styles.tipsHeader}>
          <Text style={styles.tipsSectionTitle}>Rider Pro Tips</Text>
          <View style={styles.tipsBadge}>
            <Text style={styles.tipsBadgeText}>{RIDER_PRO_TIPS.length} Tips</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tipsScrollView}
          contentContainerStyle={styles.tipsCarousel}
          snapToInterval={width * 0.85 + Spacing.md}
          decelerationRate="fast"
        >
          {RIDER_PRO_TIPS.map((tip) => (
            <View key={tip.id} style={[styles.tipCard, { borderBottomColor: tip.color }]}>
              <View style={styles.tipCardHeader}>
                <View style={[styles.tipIconBox, { backgroundColor: tip.color + '15' }]}>
                  <Icon name={tip.icon} size={22} color={tip.color} />
                </View>
                <Text style={[styles.tipTitle, { color: tip.color }]}>{tip.title}</Text>
              </View>
              <Text style={styles.tipText}>{tip.text}</Text>
            </View>
          ))}
        </ScrollView>
        
        <View style={styles.footerSpacer} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: Spacing.lg,
  },
  welcomeText: {
    ...Typography.pageTitle,
    color: Colors.text,
  },
  dashboardSubtitle: {
    ...Typography.pageSubtitle,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  timeframeContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.lg,
    padding: 3,
  },
  timeframeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  timeframeBtnActive: {
    backgroundColor: Colors.white,
    elevation: 2,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  timeframeText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  timeframeTextActive: {
    color: Colors.primary,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  statInfo: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  statSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  mainFinanceCard: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  mainFinanceContent: {
    flex: 1,
  },
  mainFinanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '700',
  },
  mainFinanceValue: {
    color: Colors.white,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 4,
  },
  earningsTip: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  mainFinanceIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  infoIconBox: {
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  infoText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  footerSpacer: {
    height: 60,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  tipsSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  tipsBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
  },
  tipsBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  tipsCarousel: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  tipsScrollView: {
    marginHorizontal: -Spacing.md,
  },
  tipCard: {
    width: width * 0.85,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    elevation: 2,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    borderBottomWidth: 4,
  },
  tipCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  tipIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tipText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    fontWeight: '500',
  },
});

export default DashboardScreen;
