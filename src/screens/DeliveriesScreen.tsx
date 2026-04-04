import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCustomAlert } from '../context/CustomAlertContext';
import { useProfileCheck } from '../hooks/useProfileCheck';

const DeliveriesScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [otpInputs, setOtpInputs] = useState<{ [key: string]: string }>({});
  const { showAlert } = useCustomAlert();
  const { checkProfileCompleteness } = useProfileCheck();

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
            is_picked_up,
            products:product_id (
              stores:store_id (*)
            )
          )
        `)
        .eq('rider_id', user.id)
        .not('status', 'in', '(delivered,cancelled)');

      if (activeError) throw activeError;

      let fetchedOrders: any[] = activeOrders || [];
      
      // Look for unassigned orders (all riders can see them now)
      const { data: availableOrders, error: availableError } = await supabase
        .rpc('get_nearby_unassigned_orders');

      if (availableError) {
        console.error('Error fetching available orders:', availableError);
      } else if (availableOrders) {
        // Avoid duplicates if any, though active orders should have rider_id set
        const availableIds = new Set(fetchedOrders.map(o => o.id));
        const filteredAvailable = availableOrders.filter((o: any) => !availableIds.has(o.id));
        fetchedOrders = [...fetchedOrders, ...filteredAvailable];

        // Log these as "offers" for the rider to track acceptance rate
        if (availableOrders.length > 0) {
          const offers = availableOrders.map((o: any) => ({
            rider_id: user.id,
            order_id: o.id
          }));
          
          // Use insert with then() to run in background without blocking UI
          supabase
            .from('rider_offer_logs')
            .upsert(offers, { onConflict: 'rider_id, order_id' })
            .then(({ error }) => {
               if (error) console.error('Error logging offers:', error.message);
            });
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
            is_picked_up,
            products:product_id (
              stores:store_id (*)
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
            <Text style={styles.orderNumber}>#{order.order_number}</Text>
            <View style={styles.badgeContainer}>
              <View style={[
                styles.statusBadge, 
                order.status === 'delivered' ? styles.successBadge : 
                order.status === 'cancelled' ? styles.errorBadge : 
                order.status === 'picked_up' ? styles.pickedUpStatusBadge : 
                styles.waitingBadge
              ]}>
                <Text style={[
                  styles.statusText,
                  order.status === 'delivered' ? styles.successText : 
                  order.status === 'cancelled' ? styles.errorText : 
                  order.status === 'picked_up' ? styles.pickedUpStatusText : 
                  styles.waitingText
                ]}>
                  {order.status === 'delivered' ? 'DELIVERED' : 
                   order.status === 'cancelled' ? 'CANCELLED' : 
                   (order.status === 'picked_up' ? 'PICKED UP' : 'WAITING FOR PICKUP')}
                </Text>
              </View>

              <View style={[
                styles.paymentBadge,
                order.payment_status === 'verified' ? styles.paidBadge : styles.unpaidBadge
              ]}>
                <Text style={[
                  styles.paymentBadgeText,
                  order.payment_status === 'verified' ? styles.paidText : styles.unpaidText
                ]}>
                  {order.payment_status === 'verified' ? 'PAID' : (order.payment_method === 'pay_on_delivery' ? 'POD' : (order.payment_method === 'pay_online' ? 'ONLINE' : 'PENDING'))}
                </Text>
              </View>
            </View>

            {order.payment_method === 'pay_online' && order.utr_number && (
              <Text style={styles.paymentMetaText}>UTR: {order.utr_number}</Text>
            )}
            {order.payment_method === 'pay_online' && order.payer_name && (
              <Text style={styles.paymentMetaText}>Payer: {order.payer_name}</Text>
            )}
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
          const groups: { [key: string]: { id: string, name: string, address: string, items: any[] } } = {};
          order.order_items?.forEach((oi: any) => {
            const store = oi.products?.stores || (Array.isArray(oi.products) ? oi.products[0]?.stores : null) || order.stores;
            const sId = store?.id || 'unknown';
            if (!groups[sId]) {
              groups[sId] = {
                id: sId,
                name: store?.name || 'Unknown Store',
                address: store?.address || 'N/A',
                items: []
              };
            }
            groups[sId].items.push(oi);
          });

          // Fallback if no items but store exists
          if (Object.keys(groups).length === 0 && order.stores) {
            const s = order.stores;
            const sId = s.id || 'main';
            groups[sId] = {
              id: sId,
              name: s.name || 'Unknown Store',
              address: s.address || 'N/A',
              items: []
            };
          }

          return Object.values(groups).map((group, gIdx) => (
            <View key={gIdx} style={[styles.section, { marginTop: gIdx > 0 ? Spacing.md : 0 }]}>
              <View style={styles.sectionHeader}>
                <Icon name="store" size={18} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Pickup Stop #{gIdx + 1}</Text>
              </View>
              <Text style={styles.storeName}>{group.name}</Text>
              <Text style={styles.addressText}>{group.address}</Text>

              {/* Find offers for this specific store */}
              {(() => {
                const storeOffer = order.applied_offers?.[group.id];
                const deliveryOffer = order.applied_offers?.[`${group.id}_delivery` || ''];
                
                return (
                  <>
                    {group.items.length > 0 && (
                      <View style={styles.productList}>
                        {group.items.map((item: any) => {
                          const hasDiscount = storeOffer?.type === 'discount';
                          const discountedPrice = hasDiscount 
                            ? item.product_price * (1 - storeOffer.amount / 100) 
                            : item.product_price;

                          return (
                            <View key={item.id} style={styles.productItemContainer}>
                              <View style={styles.productItem}>
                                <Text style={styles.productName}>
                                  {item.product_name}
                                  {item.selected_options && Object.keys(item.selected_options).length > 0 && (
                                    <Text style={styles.itemOptionsText}>
                                      {` (${Object.entries(item.selected_options)
                                        .map(([k, v]) => `${v}`)
                                        .join(', ')})`}
                                    </Text>
                                  )}
                                  {' '}x {item.quantity}
                                </Text>
                                <View style={styles.productInfoRow}>
                                  {item.is_picked_up && (
                                    <Icon name="check-circle" size={14} color={Colors.success} style={{ marginRight: 4 }} />
                                  )}
                                  <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={styles.productPrice}>₹{Math.round(discountedPrice * item.quantity)}</Text>
                                  </View>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </>
                );
              })()}

              {/* Store-level Pickup Button */}
              {order.rider_id && !isHistory && order.status !== 'delivered' && order.status !== 'cancelled' && (
                (() => {
                  const allStoreItemsPicked = group.items.length > 0 && group.items.every((item: any) => item.is_picked_up);
                  if (allStoreItemsPicked) {
                    return (
                      <View style={styles.pickedUpBadge}>
                        <Icon name="check-decagram" size={16} color={Colors.success} />
                        <Text style={styles.pickedUpBadgeText}>PICKED UP FROM {group.name.toUpperCase()}</Text>
                      </View>
                    );
                  }
                  return (
                    <TouchableOpacity 
                      style={styles.storePickupBtn}
                      onPress={() => handleStorePickUp(order.id, group.id || Object.keys(groups).find(key => groups[key] === group))}
                    >
                      <Text style={styles.storePickupBtnText}>Mark Picked Up</Text>
                    </TouchableOpacity>
                  );
                })()
              )}
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
                    <Text style={styles.paymentAlertTitle}>COLLECT FROM CUSTOMER</Text>
                    <Text style={styles.paymentAlertAmount}>₹{order.total_amount}</Text>
                    <Text style={styles.paymentAlertNote}>(Final Total After All Offers)</Text>
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

      // Check profile completeness before accepting
      const isProfileComplete = await checkProfileCompleteness(user.id);
      if (!isProfileComplete) return;

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

  const handleStorePickUp = async (orderId: string, storeId: string | undefined) => {
    if (!storeId) {
      showAlert('Error', 'Missing store information.');
      return;
    }
    try {
      setLoading(true);
      
      const { error } = await supabase.rpc('mark_store_items_picked_up', {
        input_order_id: orderId,
        input_store_id: storeId
      });
      
      if (error) throw error;

      showAlert('Success', 'Store marked as picked up!');
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
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  successBadge: {
    backgroundColor: '#D1FAE5', // Emerald 100
    borderColor: '#A7F3D0', // Emerald 200
    borderWidth: 1,
  },
  errorBadge: {
    backgroundColor: '#FFE4E6', // Rose 100
    borderColor: '#FECDD3', // Rose 200
    borderWidth: 1,
  },
  pickedUpStatusBadge: {
    backgroundColor: '#E0F2FE', // Sky 100
    borderColor: '#BAE6FD', // Sky 200
    borderWidth: 1,
  },
  waitingBadge: {
    backgroundColor: '#FEF3C7', // Amber 100
    borderColor: '#FDE68A', // Amber 200
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  successText: {
    color: '#065F46', // Emerald 800
  },
  errorText: {
    color: '#9F1239', // Rose 800
  },
  pickedUpStatusText: {
    color: '#075985', // Sky 800
  },
  waitingText: {
    color: '#92400E', // Amber 800
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
    fontWeight: '700',
    marginLeft: 4,
    fontSize: 13,
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
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginLeft: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  storeName: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  customerName: {
    fontSize: 17,
    fontWeight: '700',
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
    fontWeight: '700',
    marginTop: 4,
  },
  productList: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.light,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  productItemContainer: {
    marginBottom: 8,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optionsBadgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  optionBadge: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
  },
  optionBadgeLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
    fontWeight: '700',
    marginRight: 2,
  },
  optionBadgeValue: {
    fontSize: 9,
    color: Colors.text,
    fontWeight: '800',
  },
  productName: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '700',
  },
  itemOptionsText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  strikePrice: {
    fontSize: 11,
    color: Colors.textSecondary,
    textDecorationLine: 'line-through',
    marginBottom: -2,
  },
  offerBreakdown: {
    marginTop: Spacing.sm,
    backgroundColor: '#F0FFF4',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C6F6D5',
  },
  offerHeader: {
    fontSize: 10,
    fontWeight: '900',
    color: '#2F855A',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  offerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  offerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#276749',
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
    fontWeight: '700',
    fontSize: 16,
  },
  otpSection: {
    marginTop: Spacing.md,
  },
  otpLabel: {
    fontSize: 14,
    fontWeight: '700',
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
    fontWeight: '700',
    fontSize: 16,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  paidBadge: {
    backgroundColor: '#D1FAE5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
  },
  unpaidBadge: {
    backgroundColor: '#FFF1F2', // Rose 50
    borderColor: '#FECDD3',
  },
  paidText: {
    color: '#065F46',
  },
  unpaidText: {
    color: '#9F1239',
  },
  paymentBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  paymentMetaText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 2,
    marginLeft: 6,
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
  paymentAlertNote: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 2,
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
  productInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storePickupBtn: {
    backgroundColor: Colors.warning,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    gap: 8,
  },
  storePickupBtnText: {
    color: Colors.dark,
    fontWeight: '700',
    fontSize: 15,
  },
  pickedUpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fff4',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: '#c6f6d5',
    gap: 8,
  },
  pickedUpBadgeText: {
    color: Colors.success,
    fontWeight: '700',
    fontSize: 12,
  },
});

export default DeliveriesScreen;
