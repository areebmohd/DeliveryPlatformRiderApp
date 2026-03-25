import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
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
import { useCustomAlert } from '../context/CustomAlertContext';

const DeliveriesScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [otpInputs, setOtpInputs] = useState<{ [key: string]: string }>({});
  const { showAlert } = useCustomAlert();

  const fetchOrders = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if rider has any active orders
      const { data: activeOrders, error: activeError } = await supabase
        .from('orders')
        .select(`
          *,
          stores:store_id (*),
          addresses:delivery_address_id (*),
          order_items (
            *,
            products (
              stores (*)
            )
          )
        `)
        .eq('rider_id', user.id)
        .not('status', 'in', '(delivered,cancelled)');

      if (activeError) throw activeError;

      let fetchedOrders: any[] = activeOrders || [];

      // If no active orders, look for nearby unassigned orders
      if (fetchedOrders.length === 0) {
        // Get current location
        const { data: riderProfile } = await supabase
          .from('rider_profiles')
          .select('current_location')
          .eq('profile_id', user.id)
          .single();

        if (riderProfile?.current_location) {
          const { data: nearbyOrders, error: nearbyError } = await supabase
            .rpc('get_nearby_unassigned_orders', {
              rider_location: riderProfile.current_location,
              radius_km: 10
            });

          if (nearbyError) {
            console.error('Error fetching nearby orders:', nearbyError);
          } else if (nearbyOrders) {
            fetchedOrders = [...fetchedOrders, ...nearbyOrders];
          }
        }
      }

      // Also fetch delivered/cancelled orders for history (optional, let's keep it simple)
      const { data: historyOrders } = await supabase
        .from('orders')
        .select(`
          *,
          stores:store_id (*),
          addresses:delivery_address_id (*),
          order_items (
            *,
            products (
              stores (*)
            )
          )
        `)
        .eq('rider_id', user.id)
        .in('status', ['delivered', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (historyOrders) {
        fetchedOrders = [...fetchedOrders, ...historyOrders];
      }
      setOrders(fetchedOrders);

      // Group by date
      const grouped: { [key: string]: any[] } = {};
      fetchedOrders.forEach(order => {
        const date = new Date(order.created_at);
        const dateStr = date.toDateString();
        
        let label = dateStr;
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        
        if (dateStr === today) label = 'Today';
        else if (dateStr === yesterday) label = 'Yesterday';

        if (!grouped[label]) grouped[label] = [];
        grouped[label].push(order);
      });

      // Sort labels: Today, Yesterday, then descending date
      const sortedLabels = Object.keys(grouped).sort((a, b) => {
        if (a === 'Today') return -1;
        if (b === 'Today') return 1;
        if (a === 'Yesterday') return -1;
        if (b === 'Yesterday') return 1;
        return new Date(b).getTime() - new Date(a).getTime();
      });

      const sectionData = sortedLabels.map(key => ({
        title: key,
        data: grouped[key].sort((a: any, b: any) => {
          const isAHistory = a.status === 'delivered' || a.status === 'cancelled';
          const isBHistory = b.status === 'delivered' || b.status === 'cancelled';
          if (isAHistory && !isBHistory) return 1;
          if (!isAHistory && isBHistory) return -1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }),
      }));

      setSections(sectionData);
    } catch (error: any) {
      console.error('Error fetching orders:', error.message);
      showAlert('Error', 'Failed to fetch orders. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showAlert]);

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
            <View style={[
              styles.paymentBadge,
              order.payment_status === 'verified' ? styles.paidBadge : styles.unpaidBadge
            ]}>
              <Icon 
                name={order.payment_status === 'verified' ? "check-circle" : "clock-outline"} 
                size={12} 
                color={order.payment_status === 'verified' ? Colors.success : Colors.textSecondary} 
              />
              <Text style={[
                styles.paymentBadgeText,
                order.payment_status === 'verified' ? { color: Colors.success } : { color: Colors.textSecondary }
              ]}>
                {order.payment_status === 'verified' ? 'PAID' : (order.payment_method === 'pay_on_delivery' ? 'COD' : 'PENDING')}
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

        {/* Store Details (Grouped) */}
        {(() => {
          const groups: { [key: string]: { name: string, address: string, items: any[] } } = {};
          order.order_items?.forEach((oi: any) => {
            const store = oi.products?.stores || order.stores;
            const sId = store?.id || 'unknown';
            if (!groups[sId]) {
              groups[sId] = {
                name: store?.name || 'Unknown Store',
                address: store?.address || 'N/A',
                items: []
              };
            }
            groups[sId].items.push(oi);
          });

          return Object.values(groups).map((group, gIdx) => (
            <View key={gIdx} style={[styles.section, { marginTop: gIdx > 0 ? Spacing.md : 0 }]}>
              <View style={styles.sectionHeader}>
                <Icon name="store" size={18} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Pickup Stop #{gIdx + 1}</Text>
              </View>
              <Text style={styles.storeName}>{group.name}</Text>
              <Text style={styles.addressText}>{group.address}</Text>
              
              <View style={styles.productList}>
                {group.items.map((item: any) => (
                  <View key={item.id} style={styles.productItem}>
                    <Text style={styles.productName}>{item.product_name} x {item.quantity}</Text>
                    <Text style={styles.productPrice}>₹{item.product_price * item.quantity}</Text>
                  </View>
                ))}
              </View>
            </View>
          ));
        })()}

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
              {order.payment_method === 'pay_on_delivery' && order.payment_status === 'pending' && (
                <View style={styles.paymentAlert}>
                  <Icon name="cash-multiple" size={24} color={Colors.warning} />
                  <View style={styles.paymentAlertTextContainer}>
                    <Text style={styles.paymentAlertTitle}>COLLECT CASH</Text>
                    <Text style={styles.paymentAlertAmount}>₹{order.total_amount}</Text>
                  </View>
                </View>
              )}
              
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
      showAlert('Success', 'Order accepted! It is now in your active deliveries.');
      fetchOrders();
    } catch (error: any) {
      showAlert('Error', error.message);
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
      showAlert('Success', 'Order marked as picked up!');
      fetchOrders();
    } catch (error: any) {
      showAlert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteOrder = async (orderId: string, correctOtp: string) => {
    const enteredOtp = otpInputs[orderId];
    if (enteredOtp !== correctOtp) {
      showAlert('Invalid OTP', 'The OTP entered is incorrect. Please ask the customer for the correct OTP.');
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
      showAlert('Success', 'Order delivered successfully!');
      fetchOrders();
    } catch (error: any) {
      showAlert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderSectionHeader = ({ section: { title } }: any) => (
    <View style={styles.dateSectionHeader}>
      <Text style={styles.dateSectionTitle}>{title}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
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
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderOrder(item)}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          stickySectionHeadersEnabled={false}
        />
      )}
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
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  paidBadge: {
    backgroundColor: '#e6fffa',
    borderColor: '#b2f5ea',
  },
  unpaidBadge: {
    backgroundColor: '#fffaf0',
    borderColor: '#feebc8',
  },
  paymentBadgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
  paymentAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffaf0',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.warning,
    marginBottom: 16,
    gap: 12,
  },
  paymentAlertTextContainer: {
    flex: 1,
  },
  paymentAlertTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  paymentAlertAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.dark,
  },
});

export default DeliveriesScreen;
