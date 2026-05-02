import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Image,

} from 'react-native';
import { Spacing } from '../theme/colors';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { Colors, UI } from '../theme/colors';
import { useCustomAlert } from '../context/CustomAlertContext';

const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

const ReturnsScreen = ({ navigation }: any) => {
  const { showAlert } = useCustomAlert();
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  
  const [otpInput, setOtpInput] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchReturns = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Check rider verification status
      const { data: riderProfile } = await supabase
        .from('rider_profiles')
        .select('is_verified')
        .eq('profile_id', user.id)
        .maybeSingle();

      const verificationStatus = riderProfile?.is_verified ?? false;
      setIsVerified(verificationStatus);

      if (!verificationStatus) {
        setReturns([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const { data, error } = await supabase
        .from('returns')
        .select(`
          *,
          products!inner(name, image_url, store_id, stores:store_id(name, address, phone)),
          orders:order_id(order_number, addresses:delivery_address_id(*), total_amount),
          profiles:user_id(full_name, phone)
        `)
        .or(`status.in.(approved),rider_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setReturns(data || []);
    } catch (e) {
      console.error('Error fetching returns:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  const sections = useMemo(() => {
    const grouped: { [key: string]: any[] } = {};
    returns.forEach(item => {
      const date = new Date(item.created_at);
      const dateStr = date.toDateString();
      
      let label = dateStr;
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      
      if (dateStr === today) label = 'Today';
      else if (dateStr === yesterday) label = 'Yesterday';

      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(item);
    });

    const sortedLabels = Object.keys(grouped).sort((a, b) => {
      if (a === 'Today') return -1;
      if (b === 'Today') return 1;
      if (a === 'Yesterday') return -1;
      if (b === 'Yesterday') return 1;
      return new Date(b).getTime() - new Date(a).getTime();
    });

    return sortedLabels.map(key => ({
      title: key,
      data: grouped[key].sort((a: any, b: any) => {
        const isAHistory = ['completed', 'returned', 'rejected'].includes(a.status);
        const isBHistory = ['completed', 'returned', 'rejected'].includes(b.status);
        if (isAHistory && !isBHistory) return 1;
        if (!isAHistory && isBHistory) return -1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    }));
  }, [returns]);

  const handleAcceptReturn = async (returnId: string, returnType: string) => {
    setProcessingId(returnId);
    try {
      const otp1 = generateOTP();
      const otp2 = generateOTP();
      const otp3 = generateOTP();

      const { error } = await supabase
        .from('returns')
        .update({
          rider_id: userId,
          status: 'rider_assigned',
          otp_customer_pickup: otp1,
          otp_store_drop: otp2,
          otp_customer_exchange: otp3,
          updated_at: new Date().toISOString()
        })
        .eq('id', returnId)
        .in('status', ['approved']); // Ensure it hasn't been taken

      if (error) throw error;
      showAlert('✅ Return Accepted', 'You have been assigned this return. Please proceed to pick up the item from the customer.');
      fetchReturns();
    } catch (err: any) {
      showAlert('Error', err.message || 'Could not accept return');
    } finally {
      setProcessingId(null);
    }
  };

  const handleVerifyOTP = async (item: any, expectedOtp: string, nextStatus: string, isFinal: boolean = false) => {
    if (otpInput !== expectedOtp) {
      showAlert('Invalid OTP', 'The OTP you entered is incorrect.');
      return;
    }

    setProcessingId(item.id);
    try {
      let updates: any = { status: nextStatus, updated_at: new Date().toISOString() };
      
      const { error } = await supabase
        .from('returns')
        .update(updates)
        .eq('id', item.id);

      if (error) throw error;

      if (isFinal) {
        showAlert('✅ Completed', 'Return process fully completed!');
        // Delete image from storage
        if (item.image_url) {
          try {
            // Extract path from public URL
            // URL format: https://.../storage/v1/object/public/products/returns/{userId}/{filename}
            const pathParts = item.image_url.split('/products/');
            if (pathParts.length > 1) {
              const filePath = pathParts[1];
              await supabase.storage.from('products').remove([filePath]);
            }
          } catch (storageErr) {
            console.error('Failed to delete image', storageErr);
          }
        }
      } else {
        showAlert('✅ Verified', 'OTP verified successfully. Proceed to the next step.');
      }
      
      setOtpInput('');
      fetchReturns();
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to update status');
    } finally {
      setProcessingId(null);
    }
  };

  const renderReturnItem = ({ item }: { item: any }) => {
    const isMine = item.rider_id === userId;
    const isAvailable = item.status === 'approved';
    const isHistory = ['completed', 'returned', 'rejected'].includes(item.status);

    let statusLabel = item.status.replace(/_/g, ' ');
    let statusColor = Colors.primary;
    let badgeStyle = styles.badgeActive;

    if (isAvailable) {
      statusLabel = 'New Request';
      statusColor = Colors.success;
      badgeStyle = styles.badgeAvailable;
    } else if (isHistory) {
      statusColor = Colors.textSecondary;
      badgeStyle = styles.badgeHistory;
    }

    return (
      <View style={[styles.card, isHistory && styles.historyCard]}>
        <View style={styles.cardHeader}>
          <Text style={styles.orderNumber}>Order #{item.orders?.order_number || 'N/A'}</Text>
          <View style={[styles.badge, badgeStyle]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.productRow}>
          <Image source={{ uri: item.products?.image_url }} style={styles.productImage} />
          <View style={styles.productInfo}>
            <Text style={styles.productName}>{item.products?.name}</Text>
            <Text style={styles.returnType}>{item.return_type}</Text>
          </View>
        </View>

        <View style={styles.detailsBox}>
          <View style={styles.detailRow}>
            <View style={styles.detailCol}>
              <Text style={styles.detailTitle}><Icon name="account" size={16} color={Colors.primary} /> Customer</Text>
              <Text style={styles.detailText} numberOfLines={1}>{item.profiles?.full_name}</Text>
              <Text style={styles.detailText}>{item.profiles?.phone}</Text>
              <Text style={styles.detailText} numberOfLines={2}>{item.orders?.addresses?.address_line || 'Address unavailable'}</Text>
              <Text style={styles.detailText}>{item.orders?.addresses?.city || ''}</Text>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailCol}>
              <Text style={styles.detailTitle}><Icon name="store" size={16} color={Colors.primary} /> Store</Text>
              <Text style={styles.detailText} numberOfLines={1}>{item.products?.stores?.name}</Text>
              <Text style={styles.detailText}>{item.products?.stores?.phone}</Text>
              <Text style={styles.detailText} numberOfLines={3}>{item.products?.stores?.address}</Text>
            </View>
          </View>
        </View>

        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>Reason for Return</Text>
          <Text style={styles.reasonValue}>{item.reason}</Text>
        </View>

        {isAvailable && (
          <TouchableOpacity 
            style={styles.acceptButton}
            onPress={() => handleAcceptReturn(item.id, item.return_type)}
            disabled={processingId === item.id}
          >
            {processingId === item.id ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.acceptButtonText}>Accept Return</Text>
            )}
          </TouchableOpacity>
        )}

        {isMine && item.status !== 'completed' && (
          <View style={styles.otpSection}>
            <Text style={styles.otpTitle}>
              {item.status === 'rider_assigned' ? '1. Enter Customer Pickup OTP' :
               item.status === 'picked_up_from_customer' ? '2. Enter Store Drop OTP' :
               item.status === 'dropped_at_store' ? '3. Enter Customer Exchange OTP' : ''}
            </Text>
            
            <TextInput
              style={styles.otpInput}
              placeholder="Enter 4-digit OTP"
              keyboardType="number-pad"
              maxLength={4}
              value={processingId === item.id ? otpInput : (processingId ? '' : otpInput)}
              onChangeText={(text) => {
                if (!processingId || processingId === item.id) setOtpInput(text);
              }}
              editable={processingId !== item.id}
            />

            <TouchableOpacity
              style={styles.verifyButton}
              disabled={otpInput.length !== 4 || processingId === item.id}
              onPress={() => {
                if (item.status === 'rider_assigned') {
                  handleVerifyOTP(item, item.otp_customer_pickup, 'picked_up_from_customer');
                } else if (item.status === 'picked_up_from_customer') {
                  handleVerifyOTP(item, item.otp_store_drop, 'dropped_at_store');
                } else if (item.status === 'dropped_at_store') {
                  handleVerifyOTP(item, item.otp_customer_exchange, 'completed', true);
                }
              }}
            >
              {processingId === item.id ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.verifyButtonText}>Verify OTP</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 50 }} />
      ) : isVerified === false ? (
        <ScrollView
          contentContainerStyle={styles.scrollFlexible}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchReturns(); }} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.verificationContainer}>
            <View style={styles.verificationCard}>
              <View style={styles.iconCircle}>
                <Icon name="shield-account" size={50} color={Colors.primary} />
              </View>
              <Text style={styles.verificationTitle}>Verification Pending</Text>
              <Text style={styles.verificationText}>
                Your profile will be verified by admin then you will be able to handle returns
              </Text>
              <View style={styles.statusBadgePending}>
                <Icon name="clock-outline" size={16} color={Colors.warning} />
                <Text style={styles.statusBadgeText}>Awaiting Review</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      ) : (
        <SectionList
          sections={sections}
          renderItem={renderReturnItem}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.dateSectionHeader}>
              <Text style={styles.dateSectionTitle}>{title}</Text>
            </View>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchReturns(); }} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="package-variant" size={60} color={Colors.border} />
              <Text style={styles.emptyText}>No returns found.</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  card: { backgroundColor: Colors.white, padding: 16, borderRadius: 12, marginBottom: 16, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  orderNumber: { fontSize: 16, fontWeight: '700', color: Colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeAvailable: { backgroundColor: Colors.success + '20' },
  badgeActive: { backgroundColor: Colors.primary + '20' },
  badgeHistory: { backgroundColor: Colors.textSecondary + '20' },
  badgeText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  historyCard: { opacity: 0.8, backgroundColor: '#f1f3f5', elevation: 1 },
  dateSectionHeader: {
    paddingVertical: 12,
    marginBottom: 4,
    backgroundColor: Colors.background,
  },
  dateSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  productRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  productImage: { width: 50, height: 50, borderRadius: 8, marginRight: 12, backgroundColor: Colors.surface },
  productInfo: { flex: 1 },
  productName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  returnType: { fontSize: 13, color: Colors.primary, fontWeight: '700', marginTop: 4 },
  detailsBox: { backgroundColor: Colors.surface, padding: 12, borderRadius: 8, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailCol: { flex: 1, paddingHorizontal: 4 },
  detailDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 8 },
  detailTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  detailText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
  reasonBox: { backgroundColor: Colors.warning + '15', padding: 12, borderRadius: 8, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: Colors.warning },
  reasonLabel: { fontSize: 12, fontWeight: '700', color: Colors.warning, textTransform: 'uppercase', marginBottom: 4 },
  reasonValue: { fontSize: 14, color: Colors.text },
  acceptButton: { backgroundColor: Colors.success, padding: 12, borderRadius: 8, alignItems: 'center' },
  acceptButtonText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  otpSection: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 16 },
  otpTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  otpInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 12, fontSize: 18, textAlign: 'center', letterSpacing: 4, marginBottom: 12 },
  verifyButton: { backgroundColor: Colors.primary, padding: 12, borderRadius: 8, alignItems: 'center' },
  verifyButtonText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  emptyText: { textAlign: 'center', color: Colors.textSecondary, marginTop: 12, fontSize: 16, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  scrollFlexible: { flexGrow: 1, justifyContent: 'center', padding: Spacing.md },
  verificationContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  verificationCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    width: '100%',
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  verificationTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 12,
  },
  verificationText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  statusBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warning + '15',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.warning,
  },
});

export default ReturnsScreen;
