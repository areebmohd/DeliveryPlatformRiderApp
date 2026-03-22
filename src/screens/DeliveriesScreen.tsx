import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DeliveriesScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [otpInputs, setOtpInputs] = useState<{ [key: string]: string }>({});

  const fetchOrders = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch all relevant orders:
      // 1. Unassigned orders in 'pending_verification', 'accepted', 'ready'
      // 2. Orders assigned to the current rider
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          stores:store_id (*),
          addresses:delivery_address_id (*),
          order_items (*)
        `)
        .or(`rider_id.eq.${user.id},and(rider_id.is.null,status.in.(pending_verification,accepted,ready))`);

      if (error) throw error;

      // Sort: Active and Available first, then History (delivered/cancelled)
      const sortedData = (data || []).sort((a: any, b: any) => {
        const isAHistory = a.status === 'delivered' || a.status === 'cancelled';
        const isBHistory = b.status === 'delivered' || b.status === 'cancelled';

        if (isAHistory && !isBHistory) return 1;
        if (!isAHistory && isBHistory) return -1;
        
        // Secondary sort by date (newest first)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setOrders(sortedData);
    } catch (error: any) {
      console.error('Error fetching orders:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    
    // Subscribe to order changes
    const subscription = supabase
      .channel('rider_orders_all')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders' 
      }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const handleAcceptOrder = async (orderId: string) => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('orders')
        .update({ rider_id: user.id })
        .eq('id', orderId);

      if (error) throw error;
      Alert.alert('Success', 'Order accepted! It is now in your active deliveries.');
      fetchOrders();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePickUp = async (orderId: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('orders')
        .update({ status: 'picked_up' })
        .eq('id', orderId);

      if (error) throw error;
      Alert.alert('Success', 'Order marked as picked up!');
      fetchOrders();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteOrder = async (orderId: string, correctOtp: string) => {
    const enteredOtp = otpInputs[orderId];
    if (enteredOtp !== correctOtp) {
      Alert.alert('Invalid OTP', 'The OTP entered is incorrect. Please ask the customer for the correct OTP.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: 'delivered',
          payment_status: 'verified'
        })
        .eq('id', orderId);

      if (error) throw error;
      Alert.alert('Success', 'Order delivered successfully!');
      fetchOrders();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderOrder = (order: any) => {
    const isHistory = order.status === 'delivered' || order.status === 'cancelled';
    const isAvailable = order.rider_id === null;

    return (
      <View key={order.id} style={[styles.orderCard, isHistory && styles.historyCard]}>
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderNumber}>Order #{order.order_number}</Text>
            <View style={[
              styles.statusBadge, 
              order.status === 'delivered' ? styles.successBadge : 
              order.status === 'cancelled' ? styles.errorBadge : 
              isAvailable ? styles.availableBadge : null
            ]}>
              <Text style={[
                styles.statusText,
                (order.status === 'delivered' || order.status === 'cancelled' || isAvailable) ? styles.whiteText : null
              ]}>
                {isAvailable ? 'AVAILABLE (NEW)' : order.status.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
          </View>
          {!isHistory && (
            <TouchableOpacity 
               style={styles.mapBtn}
               onPress={() => navigation.navigate('DeliveryMap', { orderId: order.id })}
            >
              <Icon name="map-marker-path" size={20} color={Colors.white} />
              <Text style={styles.mapBtnText}>Map</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.divider} />

        {/* Store Details */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="store" size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Pickup from Store</Text>
          </View>
          <Text style={styles.storeName}>{order.stores?.name}</Text>
          <Text style={styles.addressText}>{order.stores?.address}</Text>
          
          <View style={styles.productList}>
            {order.order_items?.map((item: any) => (
              <View key={item.id} style={styles.productItem}>
                <Text style={styles.productName}>{item.product_name} x {item.quantity}</Text>
                <Text style={styles.productPrice}>₹{item.product_price * item.quantity}</Text>
              </View>
            ))}
          </View>

          {isAvailable && (
            <TouchableOpacity 
              style={styles.acceptBtn}
              onPress={() => handleAcceptOrder(order.id)}
            >
              <Text style={styles.acceptBtnText}>Accept Delivery</Text>
            </TouchableOpacity>
          )}

          {order.rider_id && !isHistory && order.status !== 'picked_up' && (
            <TouchableOpacity 
              style={styles.pickupBtn}
              onPress={() => handlePickUp(order.id)}
            >
              <Text style={styles.pickupBtnText}>Mark Picked Up</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.divider} />

        {/* Customer Details */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="account" size={18} color={Colors.success} />
            <Text style={styles.sectionTitle}>Deliver to Customer</Text>
          </View>
          <Text style={styles.customerName}>{order.addresses?.receiver_name}</Text>
          <Text style={styles.addressText}>{order.addresses?.address_line}, {order.addresses?.city}</Text>
          <Text style={styles.phoneText}>
             <Icon name="phone" size={14} /> {order.addresses?.receiver_phone}
          </Text>

          {order.rider_id && order.status === 'picked_up' && (
            <View style={styles.otpSection}>
              <Text style={styles.otpLabel}>Enter Delivery OTP</Text>
              <View style={styles.otpRow}>
                <TextInput
                  style={styles.otpInput}
                  placeholder="4-digit"
                  keyboardType="number-pad"
                  maxLength={4}
                  value={otpInputs[order.id] || ''}
                  onChangeText={(text) => setOtpInputs({ ...otpInputs, [order.id]: text })}
                />
                <TouchableOpacity 
                  style={styles.completeBtn}
                  onPress={() => handleCompleteOrder(order.id, order.delivery_otp)}
                >
                  <Text style={styles.completeBtnText}>Complete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>All Deliveries</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Icon name="refresh" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="moped" size={80} color={Colors.border} />
            <Text style={styles.emptyText}>No deliveries found</Text>
            <Text style={styles.emptySubtext}>New orders will show up here as they become available.</Text>
          </View>
        ) : (
          orders.map(renderOrder)
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  orderCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  historyCard: {
    opacity: 0.8,
    backgroundColor: '#f1f3f5',
    elevation: 1,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  statusBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  successBadge: {
    backgroundColor: Colors.success,
  },
  errorBadge: {
    backgroundColor: Colors.danger,
  },
  availableBadge: {
    backgroundColor: Colors.warning,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  whiteText: {
    color: Colors.white,
  },
  mapBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  mapBtnText: {
    color: Colors.white,
    fontWeight: 'bold',
    marginLeft: 4,
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  section: {
    marginBottom: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.textSecondary,
    marginLeft: 6,
    textTransform: 'uppercase',
  },
  storeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  addressText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  phoneText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: 'bold',
    marginTop: 4,
  },
  productList: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.light,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  productName: {
    fontSize: 14,
    color: Colors.text,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.text,
  },
  acceptBtn: {
    backgroundColor: Colors.warning,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  acceptBtnText: {
    color: Colors.dark,
    fontWeight: 'bold',
    fontSize: 15,
  },
  pickupBtn: {
    backgroundColor: Colors.warning,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  pickupBtnText: {
    color: Colors.dark,
    fontWeight: 'bold',
    fontSize: 15,
  },
  otpSection: {
    marginTop: Spacing.md,
  },
  otpLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 12,
  },
  otpInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    fontSize: 18,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  completeBtn: {
    flex: 1.5,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  completeBtnText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: 15,
  },
});

export default DeliveriesScreen;
