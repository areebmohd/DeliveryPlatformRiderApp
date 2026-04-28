import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { Colors, UI } from '../theme/colors';

const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

const ReturnsScreen = ({ navigation }: any) => {
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  const [otpInput, setOtpInput] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchReturns = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data, error } = await supabase
        .from('returns')
        .select(`
          *,
          products!inner(name, image_url, store_id, stores:store_id(name, address, phone)),
          orders(order_number, addresses:delivery_address_id(*), total_amount),
          profiles:user_id(full_name, phone)
        `)
        .or(`status.in.(approved,refund_paid),rider_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Filter out completed ones unless we want to show history.
      // Let's hide 'completed' from the active list, or maybe show it at the bottom.
      const activeReturns = (data || []).filter(r => r.status !== 'completed' && r.status !== 'returned' && r.status !== 'rejected');
      setReturns(activeReturns);
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

  const handleAcceptReturn = async (returnId: string, returnType: string) => {
    setProcessingId(returnId);
    try {
      const otp1 = generateOTP();
      const otp2 = generateOTP();
      const otp3 = returnType === 'Exchange' ? generateOTP() : null;

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
        .eq('status', 'approved'); // Ensure it hasn't been taken

      if (error) throw error;
      Alert.alert('Success', 'Return accepted! Proceed to pickup.');
      fetchReturns();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not accept return');
    } finally {
      setProcessingId(null);
    }
  };

  const handleVerifyOTP = async (item: any, expectedOtp: string, nextStatus: string, isFinal: boolean = false) => {
    if (otpInput !== expectedOtp) {
      Alert.alert('Invalid OTP', 'The OTP you entered is incorrect.');
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
        Alert.alert('Success', 'Return fully completed!');
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
        Alert.alert('Verified', 'OTP verified successfully. Proceed to next step.');
      }
      
      setOtpInput('');
      fetchReturns();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update status');
    } finally {
      setProcessingId(null);
    }
  };

  const renderReturnItem = ({ item }: { item: any }) => {
    const isMine = item.rider_id === userId;
    const isAvailable = item.status === 'approved' || item.status === 'refund_paid';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.orderNumber}>Order #{item.orders?.order_number}</Text>
          <View style={[styles.badge, isAvailable ? styles.badgeAvailable : styles.badgeActive]}>
            <Text style={styles.badgeText}>{isAvailable ? 'New Request' : item.status.replace(/_/g, ' ')}</Text>
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
              <Text style={styles.detailText} numberOfLines={2}>{item.orders?.addresses?.address_line}</Text>
              <Text style={styles.detailText}>{item.orders?.addresses?.city}</Text>
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
               item.status === 'dropped_at_store' && item.return_type === 'Exchange' ? '3. Enter Customer Exchange OTP' : ''}
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
                  const isFinal = item.return_type === 'Refund';
                  handleVerifyOTP(item, item.otp_store_drop, isFinal ? 'completed' : 'dropped_at_store', isFinal);
                } else if (item.status === 'dropped_at_store' && item.return_type === 'Exchange') {
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
      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={returns}
          renderItem={renderReturnItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchReturns(); }} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No active returns found.</Text>
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
  badgeText: { fontSize: 12, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase' },
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
  emptyText: { textAlign: 'center', color: Colors.textSecondary, marginTop: 40, fontSize: 16 },
});

export default ReturnsScreen;
