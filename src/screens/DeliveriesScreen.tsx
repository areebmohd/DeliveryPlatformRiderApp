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
  Linking,
  Modal,
  ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCustomAlert } from '../context/CustomAlertContext';
import { useProfileCheck } from '../hooks/useProfileCheck';
import QRCode from 'react-native-qrcode-svg';
import { getItemTotals } from '../utils/orderUtils';


const PAYMENT_UPI_ID = 'Q369351522@ybl';
const PAYMENT_PAYEE_NAME = 'Delivery Platform';

const getRiderDeliveryFee = (order: any) => {
  const riderFee = Number(order.rider_delivery_fee ?? 0);
  if (Number.isFinite(riderFee) && riderFee > 0) return riderFee;

  const customerFee = Number(order.delivery_fee ?? 0);
  return Number.isFinite(customerFee) ? customerFee : 0;
};

const buildUpiPaymentUri = (upiId: string, payeeName: string, order: any) => {
  const amount = Number(order.total_amount || 0).toFixed(2);
  const orderLabel = order.order_number ? `Order ${order.order_number}` : 'Delivery order';
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName || PAYMENT_PAYEE_NAME,
    am: amount,
    cu: 'INR',
    tn: `${orderLabel} payment`,
  });

  return `upi://pay?${params.toString()}`;
};

// --- Sub-components for better performance ---

const ProductItem = React.memo(({ item, items, storeOffer }: any) => {
  const { original, discounted } = getItemTotals(item, items, storeOffer);
  
  return (
    <View key={item.id} style={styles.productItemContainer}>
      <View style={styles.productItem}>
        <Text style={styles.productName}>
          {item.product_name}
          {item.selected_options && Object.keys(item.selected_options).length > 0 && (
            <Text style={styles.itemOptionsText}>
              {` (${Object.entries(item.selected_options)
                .map(([k, v]) => k === 'gift' ? 'Gift' : `${v}`)
                .join(', ')})`}
            </Text>
          )}
          {' '}x {item.quantity}
        </Text>
        <View style={styles.productInfoRow}>
          {item.is_picked_up && (
            <Icon name="check-circle" size={14} color={Colors.success} style={{ marginRight: 4 }} />
          )}
          <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 6 }}>
            {discounted < original ? (
              <>
                <Text style={styles.productPrice}>₹{Number(discounted).toFixed(2)}</Text>
                <Text style={[styles.productPrice, { textDecorationLine: 'line-through', color: Colors.textSecondary, fontSize: 11 }]}>₹{Number(original).toFixed(2)}</Text>
              </>
            ) : (
              <Text style={styles.productPrice}>₹{Number(original).toFixed(2)}</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
});

const StoreSection = React.memo(({ group, gIdx, order, navigation, onStorePickUp }: any) => {
  const storeOffer = order.applied_offers?.[group.id];
  const deliveryOffer = order.applied_offers?.[`${group.id}_delivery`];
  const isHistory = order.status === 'delivered' || order.status === 'cancelled';
  const allStoreItemsPicked = group.items.length > 0 && group.items.every((item: any) => item.is_picked_up);

  return (
    <View style={[styles.section, { marginTop: gIdx > 0 ? Spacing.md : 0 }]}>
      <View style={styles.sectionHeader}>
        <Icon name="store" size={18} color={Colors.primary} />
        <Text style={styles.sectionTitle}>Pickup Stop #{gIdx + 1}</Text>
      </View>
      <Text style={styles.storeName}>{group.name}</Text>
      <Text style={styles.addressText}>{group.address}</Text>
      {group.phone && (
        <TouchableOpacity onPress={() => Linking.openURL(`tel:${group.phone}`)}>
          <Text style={styles.phoneText}>
            <Icon name="phone" size={14} color={Colors.primary} /> {group.phone}
          </Text>
        </TouchableOpacity>
      )}

      {group.items.length > 0 && (
        <View style={styles.productList}>
          {group.items.map((item: any) => (
            <ProductItem key={item.id} item={item} items={group.items} storeOffer={storeOffer} />
          ))}
        </View>
      )}

      <TouchableOpacity 
        style={styles.viewProductDetailsBtn}
        onPress={() => navigation.navigate('ProductDetails', { 
          items: group.items, 
          storeName: group.name,
          appliedOffers: order.applied_offers
        })}
      >
        <Text style={styles.viewProductDetailsText}>View Product Images</Text>
      </TouchableOpacity>

      {(storeOffer || deliveryOffer) && (
        <View style={styles.offerBadgeContainer}>
          {storeOffer && (
            <View style={styles.offerBadge}>
              <Icon name="ticket-percent-outline" size={14} color="#16a34a" />
              <View style={{ flex: 1 }}>
                <Text style={styles.offerBadgeName}>{storeOffer.name || 'Store Offer'}</Text>
                <Text style={styles.offerBadgeDesc}>
                  {(() => {
                    const { type, amount, reward_data } = storeOffer;
                    const productName = reward_data?.product_name;
                    switch (type) {
                      case 'discount': return `${amount}% Instant Discount on Total Items Price`;
                      case 'free_cash': return `₹${amount} Free Cash amount`;
                      case 'cheap_product': return `${amount}% Instant Discount on ${productName || 'Some Items'}`;
                      case 'combo': return `${productName || 'Items'} at Only ₹${amount}`;
                      case 'fixed_price': return `${productName || 'Selected Items'} at ₹${amount} each`;
                      case 'free_product': return `Get Free ${productName || 'Gift Item'}`;
                      default: return 'Special store offer';
                    }
                  })()}
                </Text>
              </View>
            </View>
          )}
          {deliveryOffer && (
            <View style={[styles.offerBadge, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
              <Icon name="truck-delivery-outline" size={14} color="#d97706" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.offerBadgeName, { color: '#d97706' }]}>{deliveryOffer.name || 'Free Delivery'}</Text>
                <Text style={styles.offerBadgeDesc}>₹0 Delivery fee</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {order.rider_id && !isHistory && order.status !== 'delivered' && order.status !== 'cancelled' && (
        allStoreItemsPicked ? (
          <View style={styles.pickedUpBadge}>
            <Icon name="check-decagram" size={16} color={Colors.success} />
            <Text style={styles.pickedUpBadgeText}>PICKED UP FROM {group.name.toUpperCase()}</Text>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.storePickupBtn}
            onPress={() => onStorePickUp(order.id, group.id)}
          >
            <Text style={styles.storePickupBtnText}>Mark Picked Up</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
});

const OrderCard = React.memo(({ 
  order, 
  navigation, 
  onAccept, 
  onStorePickUp, 
  onShowBreakdown, 
  onComplete, 
  onShowQr,
  otpValue,
  setOtpValue
}: any) => {
  const isHistory = order.status === 'delivered' || order.status === 'cancelled';
  const isAvailable = order.rider_id === null;

  let statusLabel = '';
  let statusColor = Colors.text;
  if (order.status === 'waiting_for_pickup') {
    statusLabel = 'WAITING FOR PICKUP';
    statusColor = Colors.warning;
  } else if (order.status === 'picked_up') {
    statusLabel = 'PICKED UP';
    statusColor = Colors.primary;
  } else if (order.status === 'delivered') {
    statusLabel = 'DELIVERED';
    statusColor = Colors.success;
  } else if (order.status === 'cancelled') {
    statusLabel = 'CANCELLED';
    statusColor = Colors.danger;
  }

  const groups = React.useMemo(() => {
    const g: { [key: string]: any } = {};
    order.order_items?.filter((oi: any) => !oi.is_removed).forEach((oi: any) => {
      const store = oi.products?.stores || (Array.isArray(oi.products) ? oi.products[0]?.stores : null) || order.stores;
      const sId = store?.id || 'unknown';
      if (!g[sId]) {
        g[sId] = {
          id: sId,
          name: store?.name || 'Unknown Store',
          address: store?.address || 'N/A',
          phone: store?.phone,
          items: []
        };
      }
      g[sId].items.push(oi);
    });

    if (Object.keys(g).length === 0 && order.stores) {
      const s = order.stores;
      const sId = s.id || 'main';
      g[sId] = {
        id: sId,
        name: s.name || 'Unknown Store',
        address: s.address || 'N/A',
        phone: s.phone,
        items: []
      };
    }
    return Object.values(g);
  }, [order.order_items, order.stores]);

  return (
    <View style={[styles.orderCard, isHistory && styles.historyCard]}>
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
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
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

      {groups.map((group, idx) => (
        <StoreSection 
          key={idx} 
          group={group} 
          gIdx={idx} 
          order={order} 
          navigation={navigation} 
          onStorePickUp={onStorePickUp} 
        />
      ))}

      {isAvailable && (
        <TouchableOpacity style={styles.acceptBtn} onPress={() => onAccept(order.id)}>
          <Text style={styles.acceptBtnText}>Accept Delivery</Text>
        </TouchableOpacity>
      )}

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="account" size={18} color={Colors.success} />
          <Text style={styles.sectionTitle}>Deliver to Customer</Text>
        </View>
        <Text style={styles.customerName}>
          {order.customer?.full_name || (Array.isArray(order.customer) ? order.customer[0]?.full_name : 'Customer')}
        </Text>
        <Text style={styles.addressText}>{order.addresses?.address_line}, {order.addresses?.city}</Text>
        <TouchableOpacity 
          onPress={() => {
            const phone = order.customer?.phone || (Array.isArray(order.customer) ? order.customer[0]?.phone : null);
            if (phone) Linking.openURL(`tel:${phone}`);
          }}
          disabled={!(order.customer?.phone || (Array.isArray(order.customer) ? order.customer[0]?.phone : null))}
        >
          <Text style={styles.phoneText}>
            <Icon name="phone" size={14} color={Colors.primary} /> { (order.customer?.phone || (Array.isArray(order.customer) ? order.customer[0]?.phone : null)) || 'Phone unavailable' }
          </Text>
        </TouchableOpacity>

        {order.rider_id && order.status === 'picked_up' && (
          <View style={styles.otpSection}>
            {order.payment_method === 'pay_on_delivery' && (
              <View style={styles.paymentAlert}>
                <Icon name="cash-multiple" size={24} color={Colors.warning} />
                <View style={styles.paymentAlertTextContainer}>
                  <Text style={styles.paymentAlertTitle}>COLLECT FROM CUSTOMER</Text>
                  <Text style={styles.paymentAlertAmount}>₹{Number(order.total_amount).toFixed(2)}</Text>
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
                value={otpValue || ''}
                onChangeText={setOtpValue}
              />
              <TouchableOpacity 
                style={styles.completeBtn}
                onPress={() => onComplete(order.id, order.delivery_otp)}
              >
                <Text style={styles.completeBtnText}>Complete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.divider} />
        
        <View style={styles.cardFooter}>
            <View style={styles.totalContainer}>
               <View>
                 <Text style={styles.totalLabel}>Total Price</Text>
                 <TouchableOpacity onPress={() => onShowBreakdown(order)}>
                   <Text style={styles.viewSharesText}>View Shares</Text>
                 </TouchableOpacity>
               </View>
               <View style={{ alignItems: 'flex-end' }}>
                 <Text style={styles.grandTotal}>₹{Number(order.total_amount).toFixed(2)}</Text>
               </View>
            </View>
         </View>

        {order.status === 'delivered' && order.payment_method === 'pay_on_delivery' && (
          <TouchableOpacity style={styles.showQrBtn} onPress={() => onShowQr(order)} activeOpacity={0.85}>
            <Icon name="qrcode-scan" size={20} color={Colors.white} />
            <Text style={styles.showQrBtnText}>Show QR</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

const DeliveriesScreen = ({ navigation }: any) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [otpInputs, setOtpInputs] = useState<{ [key: string]: string }>({});
  const { showAlert } = useCustomAlert();
  const { checkProfileCompleteness } = useProfileCheck();
  const [breakdownModal, setBreakdownModal] = useState<{ visible: boolean; order: any }>({ 
    visible: false, 
    order: null 
  });
  const [qrModal, setQrModal] = useState<{ visible: boolean; order: any; upiUri: string }>({
    visible: false,
    order: null,
    upiUri: '',
  });

  const fetchOrders = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: activeOrders, error: activeError } = await supabase
        .from('orders')
        .select(`
          *,
          stores:store_id (*),
          addresses:delivery_address_id (*),
          customer:profiles!orders_customer_id_fkey (phone, full_name),
          order_items (
            *,
            is_picked_up,
            products:product_id (
              name,
              image_url,
              raw_image_url,
              weight_kg,
              price,
              description,
              options,
              stores:store_id (*)
            )
          )
        `)
        .eq('rider_id', user.id)
        .not('status', 'in', '(delivered,cancelled)');

      if (activeError) throw activeError;

      let fetchedOrders: any[] = activeOrders || [];
      
      const { data: riderProfile } = await supabase
        .from('rider_profiles')
        .select('vehicle_type')
        .eq('profile_id', user.id)
        .maybeSingle();
      
      const vehicleType = (riderProfile?.vehicle_type || 'bike').toLowerCase();
      
      const { data: availableOrders, error: availableError } = await supabase
        .rpc('get_nearby_unassigned_orders', { rider_vehicle_type: vehicleType });

      if (availableError) {
        // Reduced log noise
      } else if (availableOrders) {
        const availableIds = new Set(fetchedOrders.map(o => o.id));
        const filteredAvailable = availableOrders.filter((o: any) => !availableIds.has(o.id));
        fetchedOrders = [...fetchedOrders, ...filteredAvailable];

        if (availableOrders.length > 0) {
          const offers = availableOrders.map((o: any) => ({
            rider_id: user.id,
            order_id: o.id
          }));
          
          supabase
            .from('rider_offer_logs')
            .upsert(offers, { onConflict: 'rider_id, order_id' })
            .then(({ error: _error }) => {
               if (_error) console.error('Error logging offers:', _error.message);
            });
        }
      }

      const { data: historyOrders } = await supabase
        .from('orders')
        .select(`
          *,
          stores:store_id (*),
          addresses:delivery_address_id (*),
          customer:profiles!orders_customer_id_fkey (phone, full_name),
          order_items (
            *,
            is_picked_up,
            products:product_id (
              name,
              image_url,
              raw_image_url,
              weight_kg,
              price,
              description,
              options,
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
    } catch {
      showAlert('Error', 'Failed to fetch orders. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showAlert]);

  const sections = React.useMemo(() => {
    const grouped: { [key: string]: any[] } = {};
    orders.forEach(order => {
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
        const isAHistory = a.status === 'delivered' || a.status === 'cancelled';
        const isBHistory = b.status === 'delivered' || b.status === 'cancelled';
        if (isAHistory && !isBHistory) return 1;
        if (!isAHistory && isBHistory) return -1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    }));
  }, [orders]);

  const handleShowBreakdown = (order: any) => {
    setBreakdownModal({ 
      visible: true, 
      order: { ...order, delivery_fee: getRiderDeliveryFee(order) } 
    });
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
          status: 'delivered'
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

  const handleShowPaymentQr = (order: any) => {
    setQrModal({
      visible: true,
      order,
      upiUri: buildUpiPaymentUri(PAYMENT_UPI_ID, PAYMENT_PAYEE_NAME, order),
    });
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
          renderItem={({ item }) => (
            <OrderCard 
              order={item}
              navigation={navigation}
              onAccept={handleAcceptOrder}
              onStorePickUp={handleStorePickUp}
              onShowBreakdown={handleShowBreakdown}
              onComplete={handleCompleteOrder}
              onShowQr={handleShowPaymentQr}
              otpValue={otpInputs[item.id]}
              setOtpValue={(text: string) => setOtpInputs(prev => ({ ...prev, [item.id]: text }))}
            />
          )}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          stickySectionHeadersEnabled={false}
        />
      )}

      <Modal
        visible={breakdownModal.visible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setBreakdownModal({ ...breakdownModal, visible: false })}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setBreakdownModal({ ...breakdownModal, visible: false })}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Payout Breakdown</Text>
              <TouchableOpacity onPress={() => setBreakdownModal({ ...breakdownModal, visible: false })}>
                <Icon name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {breakdownModal.order && (() => {
              const storeShares: { [key: string]: number } = {};
              let totalSponsoredDelivery = 0;
              const { order } = breakdownModal;
              
              order.order_items.filter((oi: any) => !oi.is_removed).forEach((oi: any) => {
                const sName = oi.products?.stores?.name || order.stores?.name || 'Store';
                const sId = oi.products?.stores?.id || order.stores?.id;
                
                const storeOffer = order.applied_offers?.[sId];
                const allStoreItems = order.order_items.filter((i: any) => 
                  !i.is_removed && (i.products?.stores?.id || order.stores?.id) === sId
                );
                
                const { discounted } = getItemTotals(oi, allStoreItems, storeOffer);

                if (storeShares[sName] === undefined) {
                  storeShares[sName] = 0;
                  const deliveryFeePaidByStore = Number(order.store_delivery_fees?.[sId] || 0);
                  storeShares[sName] -= deliveryFeePaidByStore;
                  totalSponsoredDelivery += deliveryFeePaidByStore;
                }
                storeShares[sName] += discounted;
              });

              let displayDeliveryFee = getRiderDeliveryFee(order);
              let displayPlatformFee = order.platform_fee || 0;

              if (totalSponsoredDelivery > 0) {
                displayPlatformFee += Math.max(0, totalSponsoredDelivery - displayDeliveryFee);
              }

              return (
                <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                  <View style={styles.breakdownSection}>
                    <Text style={styles.breakdownSectionTitle}>Store Items Total</Text>
                    {Object.entries(storeShares).map(([name, amount], idx) => (
                      <View key={idx} style={[styles.breakdownRow, { marginBottom: 8 }]}>
                        <Text style={[styles.breakdownLabel, { color: Colors.text, textTransform: 'none', fontSize: 14, fontWeight: '600' }]}>{name}</Text>
                        <Text style={[styles.breakdownValue, { fontSize: 14 }]}>₹{amount.toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.breakdownSection}>
                    <Text style={styles.breakdownSectionTitle}>Fees & Services</Text>
                    {displayDeliveryFee > 0 && (
                      <View style={[styles.breakdownRow, { marginBottom: 8 }]}>
                        <Text style={[styles.breakdownLabel, { color: Colors.text, textTransform: 'none', fontSize: 14, fontWeight: '600' }]}>Delivery Fee</Text>
                        <Text style={[styles.breakdownValue, { fontSize: 14 }]}>₹{displayDeliveryFee.toFixed(2)}</Text>
                      </View>
                    )}
                    {displayPlatformFee > 0 && (
                      <View style={[styles.breakdownRow, { marginBottom: 8 }]}>
                        <Text style={[styles.breakdownLabel, { color: Colors.text, textTransform: 'none', fontSize: 14, fontWeight: '600' }]}>Platform Fee</Text>
                        <Text style={[styles.breakdownValue, { fontSize: 14 }]}>₹{displayPlatformFee.toFixed(2)}</Text>
                      </View>
                    )}
                    {order.helper_fee > 0 && (
                      <View style={[styles.breakdownRow, { marginBottom: 8 }]}>
                        <Text style={[styles.breakdownLabel, { color: Colors.text, textTransform: 'none', fontSize: 14, fontWeight: '600' }]}>Helper Fee</Text>
                        <Text style={[styles.breakdownValue, { fontSize: 14 }]}>₹{Number(order.helper_fee).toFixed(2)}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.grandTotalRowModal}>
                    <Text style={styles.grandTotalLabelModal}>Grand Total</Text>
                    <Text style={styles.grandTotalValueModal}>₹{Number(order.total_amount).toFixed(2)}</Text>
                  </View>
                </ScrollView>
              );
            })()}

            <TouchableOpacity 
              style={styles.closeBtnModal}
              onPress={() => setBreakdownModal({ ...breakdownModal, visible: false })}
            >
              <Text style={styles.closeBtnTextModal}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={qrModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setQrModal({ visible: false, order: null, upiUri: '' })}
      >
        <View style={styles.qrModalOverlay}>
          <View style={styles.qrModalContent}>
            <View style={styles.qrModalHeader}>
              <View>
                <Text style={styles.qrModalTitle}>Customer Payment QR</Text>
                <Text style={styles.qrModalSubtitle}>#{qrModal.order?.order_number || 'Order'}</Text>
              </View>
              <TouchableOpacity onPress={() => setQrModal({ visible: false, order: null, upiUri: '' })}>
                <Icon name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.qrAmountBox}>
              <Text style={styles.qrAmountLabel}>Amount to Pay</Text>
              <Text style={styles.qrAmountValue}>₹{Number(qrModal.order?.total_amount || 0).toFixed(2)}</Text>
            </View>

            <View style={styles.qrCodeWrap}>
              {qrModal.upiUri ? (
                <QRCode
                  value={qrModal.upiUri}
                  size={230}
                  backgroundColor={Colors.white}
                  color={Colors.dark}
                />
              ) : null}
            </View>

            <Text style={styles.qrUpiText}>{PAYMENT_UPI_ID}</Text>
            <Text style={styles.qrHintText}>Ask the customer to scan this QR with any UPI app.</Text>

            <TouchableOpacity
              style={styles.closeBtnModal}
              onPress={() => setQrModal({ visible: false, order: null, upiUri: '' })}
            >
              <Text style={styles.closeBtnTextModal}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    alignItems: 'center',
    marginBottom: 4,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#333',
    marginBottom: -2,
  },
  viewSharesText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '800',
    marginTop: 2,
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
    marginVertical: 8,
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
  showQrBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  showQrBtnText: {
    color: Colors.white,
    fontWeight: '800',
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
  offerBadgeContainer: {
    marginTop: 8,
    gap: 6,
  },
  offerBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  offerBadgeName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
  },
  offerBadgeDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
    fontWeight: '500',
  },
  cardFooter: {
    marginTop: 4,
  },
  footerInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  breakdownContainer: {
    gap: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  breakdownValue: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: '800',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  viewProductDetailsBtn: {
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  viewProductDetailsText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'none',
  },
  grandTotal: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  modalBody: {
    marginBottom: Spacing.lg,
  },
  breakdownSection: {
    marginBottom: Spacing.lg,
  },
  breakdownSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  grandTotalRowModal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.sm,
  },
  grandTotalLabelModal: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  grandTotalValueModal: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.primary,
  },
  closeBtnModal: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  closeBtnTextModal: {
    color: Colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  qrModalContent: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  qrModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  qrModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
  },
  qrModalSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '700',
    marginTop: 2,
  },
  qrAmountBox: {
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: Spacing.lg,
  },
  qrAmountLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  qrAmountValue: {
    fontSize: 28,
    color: Colors.primary,
    fontWeight: '900',
    marginTop: 2,
  },
  qrCodeWrap: {
    alignSelf: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qrUpiText: {
    marginTop: Spacing.md,
    textAlign: 'center',
    fontSize: 14,
    color: Colors.text,
    fontWeight: '800',
  },
  qrHintText: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
});

export default DeliveriesScreen;
