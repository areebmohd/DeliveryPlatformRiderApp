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

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          stores:store_id (*),
          addresses:delivery_address_id (*),
          order_items (*)
        `)
        .eq('rider_id', user.id)
        .in('status', ['accepted', 'preparing', 'ready', 'picked_up'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
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
      .channel('rider_orders')
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
          payment_status: 'verified' // Assuming delivery means payment is settled if POD
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

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Deliveries</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Icon name="refresh" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="moped" size={80} color={Colors.border} />
            <Text style={styles.emptyText}>No active deliveries</Text>
            <Text style={styles.emptySubtext}>New orders will appear here when assigned</Text>
          </View>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <View>
                  <Text style={styles.orderNumber}>Order #{order.order_number}</Text>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{order.status.replace('_', ' ').toUpperCase()}</Text>
                  </View>
                </View>
                <TouchableOpacity 
                   style={styles.mapBtn}
                   onPress={() => navigation.navigate('DeliveryMap', { orderId: order.id })}
                >
                  <Icon name="map-marker-path" size={20} color={Colors.white} />
                  <Text style={styles.mapBtnText}>Map</Text>
                </TouchableOpacity>
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

                {order.status !== 'picked_up' && (
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

                {order.status === 'picked_up' && (
                  <View style={styles.otpSection}>
                    <Text style={styles.otpLabel}>Enter Delivery OTP</Text>
                    <View style={styles.otpRow}>
                      <TextInput
                        style={styles.otpInput}
                        placeholder="4-digit OTP"
                        keyboardType="number-pad"
                        maxLength={4}
                        value={otpInputs[order.id] || ''}
                        onChangeText={(text) => setOtpInputs({ ...otpInputs, [order.id]: text })}
                      />
                      <TouchableOpacity 
                        style={styles.completeBtn}
                        onPress={() => handleCompleteOrder(order.id, order.delivery_otp)}
                      >
                        <Text style={styles.completeBtnText}>Complete Delivery</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </View>
          ))
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
    marginTop: 100,
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
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.primary,
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
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 4,
    fontWeight: 'bold',
  },
  completeBtn: {
    flex: 2,
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
