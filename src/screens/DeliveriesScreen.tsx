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
import Geolocation from 'react-native-geolocation-service';
import { useCustomAlert } from '../context/CustomAlertContext';
import { useProfileCheck } from '../hooks/useProfileCheck';
import QRCode from 'react-native-qrcode-svg';
import { getItemTotals } from '../utils/orderUtils';


const PAYMENT_UPI_ID = 'Q369351522@ybl';
const PAYMENT_PAYEE_NAME = 'Delivery Platform';

const getRiderDeliveryFee = (order: any) => {
  const appliedOffers = order.applied_offers || {};
  const hasAppOffer = !!(appliedOffers.app_offer || appliedOffers.app_batch_offer || appliedOffers.app_fast_offer);
  const hasStoreDeliveryOffer = Object.keys(appliedOffers).some(key => key.endsWith('_delivery'));

  // If app offer is applied and NO store delivery offer, rider gets 0
  if (hasAppOffer && !hasStoreDeliveryOffer) return 0;

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

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const getSlotStartTime = (slotStr: string, dateLabel: string) => {
  if (!slotStr || dateLabel !== 'Today') return null;
  
  // Try to parse "2-3 PM", "2 PM", "02:00 PM", etc.
  const match = slotStr.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
  if (!match) return null;
  
  let hours = parseInt(match[1]);
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const ampm = match[3].toUpperCase();
  
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
};

const parseLocation = (locString: string) => {
  if (!locString) return null;
  const match = locString.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
  if (match) {
    return {
      longitude: parseFloat(match[1]),
      latitude: parseFloat(match[2]),
    };
  }
  // Hex EWKB handling
  if (locString.length >= 50 && locString.startsWith('0101000020E6100000')) {
    try {
      const hexToDouble = (hex: string) => {
        const buffer = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const view = new DataView(buffer.buffer);
        return view.getFloat64(0, true);
      };
      return {
        longitude: hexToDouble(locString.substring(18, 34)),
        latitude: hexToDouble(locString.substring(34, 50)),
      };
    } catch {
      return null;
    }
  }
  return null;
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
            {discounted < original - 0.1 ? (
              <>
                <Text style={[styles.productPrice, { textDecorationLine: 'line-through', color: Colors.textSecondary, fontSize: 13 }]}>₹{Number(original).toFixed(2)}</Text>
                <Text style={[styles.productPrice, { color: Colors.success }]}>₹{Number(discounted).toFixed(2)}</Text>
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

const StoreSection = React.memo(({ group, gIdx, order, navigation, onStorePickUp, processingId }: any) => {
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
            style={[styles.storePickupBtn, processingId === `${group.id}_${order.id}` && { opacity: 0.7 }]}
            onPress={() => onStorePickUp([order.id], group.id, `${group.id}_${order.id}`)}
            disabled={processingId === `${group.id}_${order.id}`}
          >
            {processingId === `${group.id}_${order.id}` ? (
              <ActivityIndicator color={Colors.dark} size="small" />
            ) : (
              <Text style={styles.storePickupBtnText}>Mark Picked Up</Text>
            )}
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
  setOtpValue,
  riderLocation,
  processingId
}: any) => {
  const isHistory = order.status === 'delivered' || order.status === 'cancelled';
  const isAvailable = order.rider_id === null;
  const isProcessing = processingId === order.id;

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
          location: store?.location,
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
        location: s.location, // Ensure location is here
        items: []
      };
    }
    
    let result = Object.values(g);

    // SORT BY PROXIMITY
    if (riderLocation) {
      result = result.sort((a: any, b: any) => {
        const locA = parseLocation(a.location);
        const locB = parseLocation(b.location);
        if (!locA || !locB) return 0;

        const distA = calculateDistance(riderLocation.latitude, riderLocation.longitude, locA.latitude, locA.longitude);
        const distB = calculateDistance(riderLocation.latitude, riderLocation.longitude, locB.latitude, locB.longitude);
        return distA - distB;
      });
    }

    return result;
  }, [order.order_items, order.stores, riderLocation]);

  const totalDistance = React.useMemo(() => {
    if (groups.length === 0 || !order.addresses?.location) return 0;
    
    let dist = 0;
    let currentLoc = parseLocation(groups[0].location);
    if (!currentLoc) return 0;

    // Dist between stores
    for (let i = 1; i < groups.length; i++) {
      const nextLoc = parseLocation(groups[i].location);
      if (nextLoc) {
        dist += calculateDistance(currentLoc.latitude, currentLoc.longitude, nextLoc.latitude, nextLoc.longitude);
        currentLoc = nextLoc;
      }
    }

    // Last store to customer
    const custLoc = parseLocation(order.addresses.location);
    if (custLoc) {
      dist += calculateDistance(currentLoc.latitude, currentLoc.longitude, custLoc.latitude, custLoc.longitude);
    }
    
    return dist;
  }, [groups, order.addresses?.location]);

  return (
    <View style={[styles.orderCard, isHistory && styles.historyCard]}>
      <View style={styles.orderHeader}>
        <View>
          <Text style={styles.orderNumber}>#{order.order_number}{totalDistance > 0 ? ` • ${totalDistance.toFixed(1)} km` : ''}</Text>
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
            {order.delivery_type === 'batch' && order.delivery_slot && (
              <View style={[styles.statusBadge, { backgroundColor: Colors.primaryLight, marginLeft: 8 }]}>
                <Text style={[styles.statusText, { color: Colors.primary }]}>{order.delivery_slot}</Text>
              </View>
            )}
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
          processingId={processingId}
        />
      ))}

      {isAvailable && (
        <TouchableOpacity 
          style={[styles.acceptBtn, isProcessing && { opacity: 0.7 }]} 
          onPress={() => onAccept(order.id)}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color={Colors.dark} size="small" />
          ) : (
            <Text style={styles.acceptBtnText}>Accept Delivery</Text>
          )}
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
        <Text style={styles.addressText}>{order.addresses?.address_line}{order.addresses?.city ? `, ${order.addresses.city}` : ''}</Text>
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
                style={[styles.completeBtn, isProcessing && { opacity: 0.7 }]}
                onPress={() => onComplete(order.id, order.delivery_otp)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.completeBtnText}>Complete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* App Offer Display */}
        {(order.applied_offers?.app_offer || order.applied_offers?.app_batch_offer || order.applied_offers?.app_fast_offer) && (
          <View style={styles.appOfferBadge}>
            <View style={styles.appOfferIconBox}>
              <Icon 
                name={order.applied_offers?.app_fast_offer ? "flash" : "truck-delivery"} 
                size={14} 
                color={Colors.white} 
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.appOfferTitle}>
                {order.applied_offers?.app_fast_offer ? 'Free Fast Delivery' : 'Free Batch Delivery'}
              </Text>
              <Text style={styles.appOfferDesc}>
                {order.applied_offers?.app_fast_offer 
                  ? 'Free fast delivery above ₹149' 
                  : `Free batch delivery above ₹${order.applied_offers?.app_batch_offer ? '49' : '29'}`}
              </Text>
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

const BatchCard = React.memo(({ 
  batch, 
  navigation, 
  onAccept, 
  onStorePickUp, 
  onShowOrderDetails,
  processingId
}: any) => {
  const isAvailable = batch.rider_id === null;
  const isProcessing = processingId === batch.id;
  
  // Aggregate stores and their products for the pickup phase
  const storesMap = React.useMemo(() => {
    const map: { [key: string]: { id: string, name: string, products: any[], isPickedUp: boolean, orderIds: number[] } } = {};
    batch.orders.forEach((order: any) => {
      order.order_items.forEach((oi: any) => {
        const storeId = oi.products?.stores?.id || order.stores?.id;
        const storeName = oi.products?.stores?.name || order.stores?.name || 'Store';
        if (!map[storeId]) {
          map[storeId] = { id: storeId, name: storeName, products: [], isPickedUp: true, orderIds: [] };
        }
        map[storeId].products.push({
          ...oi.products,
          quantity: oi.quantity,
          order_number: order.order_number
        });
        if (!oi.is_picked_up) map[storeId].isPickedUp = false;
        if (!map[storeId].orderIds.includes(order.id)) map[storeId].orderIds.push(order.id);
      });
    });
    return Object.values(map);
  }, [batch.orders]);

  const isAllPickedUp = storesMap.every(s => s.isPickedUp);

  // Aggregate customers and their orders for the delivery phase
  const customersMap = React.useMemo(() => {
    const map: { [key: string]: { id: string, name: string, address: string, orders: any[] } } = {};
    batch.orders.forEach((order: any) => {
      const rawName = order.customer?.full_name || (Array.isArray(order.customer) ? order.customer[0]?.full_name : 'Customer');
      const rawAddress = order.addresses?.address_line || 'No Address';
      
      // Use name and address for grouping to ensure visual consistency
      const nameKey = rawName.trim().toLowerCase();
      const addrKey = rawAddress.trim().toLowerCase();
      const key = `${nameKey}_${addrKey}`;
      
      if (!map[key]) {
        map[key] = { 
          id: key, 
          name: rawName, 
          address: rawAddress,
          orders: [] 
        };
      }
      map[key].orders.push(order);
    });
    return Object.values(map);
  }, [batch.orders]);

  const totalBatchDistance = React.useMemo(() => {
    if (!batch.orders || batch.orders.length === 0) return 0;

    // Get unique stores in sequence (following storesMap logic)
    const storesList: any[] = [];
    batch.orders.forEach((order: any) => {
      order.order_items.forEach((oi: any) => {
        const s = oi.products?.stores || order.stores;
        if (s && !storesList.find(item => item.id === s.id)) {
          storesList.push(s);
        }
      });
    });

    // Get unique customer addresses in sequence
    const addrList: any[] = [];
    batch.orders.forEach((order: any) => {
      if (order.addresses && !addrList.find(a => a.id === order.addresses.id)) {
        addrList.push(order.addresses);
      }
    });

    if (storesList.length === 0 || addrList.length === 0) return 0;

    let dist = 0;
    let currentLoc = parseLocation(storesList[0].location);
    if (!currentLoc) return 0;

    // Store to Store
    for (let i = 1; i < storesList.length; i++) {
      const nextLoc = parseLocation(storesList[i].location);
      if (nextLoc) {
        dist += calculateDistance(currentLoc.latitude, currentLoc.longitude, nextLoc.latitude, nextLoc.longitude);
        currentLoc = nextLoc;
      }
    }

    // Last store to first customer
    const firstCustLoc = parseLocation(addrList[0].location);
    if (firstCustLoc) {
      dist += calculateDistance(currentLoc.latitude, currentLoc.longitude, firstCustLoc.latitude, firstCustLoc.longitude);
      currentLoc = firstCustLoc;
    }

    // Customer to Customer
    for (let i = 1; i < addrList.length; i++) {
      const nextLoc = parseLocation(addrList[i].location);
      if (nextLoc) {
        dist += calculateDistance(currentLoc.latitude, currentLoc.longitude, nextLoc.latitude, nextLoc.longitude);
        currentLoc = nextLoc;
      }
    }

    return dist;
  }, [batch.orders]);

  const isFullyDelivered = batch.orders.every((o: any) => o.status === 'delivered' || o.status === 'cancelled');

  const isAcceptanceClosed = React.useMemo(() => {
    if (batch.date_label !== 'Today') return true;
    
    const startTime = getSlotStartTime(batch.delivery_slot, batch.date_label);
    if (!startTime) return false;
    
    const now = new Date();
    const oneHourBefore = new Date(startTime.getTime() - 60 * 60 * 1000);
    
    // Interpret "cannot accept 1 hour before" as "cannot accept until it is 1 hour before start time"
    return now < oneHourBefore || now > startTime;
  }, [batch.delivery_slot, batch.date_label]);

  return (
    <View style={[styles.batchCard, isFullyDelivered && styles.historyCard]}>
      <View style={styles.batchHeader}>
        <View style={styles.batchTitleRow}>
          <View>
            <Text style={styles.batchLabel}>
              {batch.delivery_slot} Batch{totalBatchDistance > 0 ? ` • ${totalBatchDistance.toFixed(1)} km` : ''}
            </Text>
            <View style={styles.badgeContainer}>
              <Text style={styles.batchSublabel}>{batch.orders.length} Orders • {batch.date_label}</Text>
              {isFullyDelivered && (
                <View style={[styles.statusBadge, styles.successBadge, { marginLeft: 8 }]}>
                  <Text style={[styles.statusText, { color: Colors.success }]}>COMPLETED</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        
        {!isAvailable && !isFullyDelivered && (
          <TouchableOpacity 
             style={styles.batchMapBtn}
             onPress={() => navigation.navigate('DeliveryMap', { 
               batchOrders: batch.orders,
               batchSlot: batch.delivery_slot 
             })}
          >
            <Icon name="map-marker-path" size={20} color={Colors.white} />
            <Text style={styles.batchMapBtnText}>Route</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.batchOrdersList}>
        {!isAllPickedUp ? (
          // PICKUP PHASE: Group by Store
          <View>
            <View style={styles.batchPhaseHeader}>
              <Icon name="store" size={16} color={Colors.primary} />
              <Text style={styles.batchPhaseTitle}>Pickup Phase: Shops</Text>
            </View>
            {storesMap.map((store: any, idx: number) => (
              <View key={store.id} style={[styles.batchStoreItem, idx === storesMap.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.batchStoreHeader}>
                  <Text style={styles.batchStoreName}>{store.name}</Text>
                  {store.isPickedUp ? (
                    <View style={styles.miniSuccessBadge}>
                      <Icon name="check-circle" size={14} color={Colors.success} />
                      <Text style={styles.miniSuccessText}>Collected</Text>
                    </View>
                  ) : !isAvailable && (
                    <TouchableOpacity 
                      style={[styles.batchStorePickupBtn, processingId === `${store.id}_${batch.id}` && { opacity: 0.7 }]}
                      onPress={() => {
                        // Mark picked up for all orders from this store in the batch
                        onStorePickUp(store.orderIds, store.id, `${store.id}_${batch.id}`);
                      }}
                      disabled={processingId === `${store.id}_${batch.id}`}
                    >
                      {processingId === `${store.id}_${batch.id}` ? (
                        <ActivityIndicator color={Colors.dark} size="small" />
                      ) : (
                        <Text style={styles.batchStorePickupText}>Mark Picked Up</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.batchProductList}>
                  {store.products.map((p: any, pIdx: number) => (
                    <View key={`${p.id}_${pIdx}`} style={styles.batchProductItem}>
                      <Text style={styles.batchProductText}>• {p.name} (x{p.quantity})</Text>
                      <Text style={styles.batchProductOrderRef}>#{p.order_number}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          // DELIVERY PHASE: Group by Customer
          <View>
            <View style={styles.batchPhaseHeader}>
              <Icon name="account-group" size={16} color={Colors.success} />
              <Text style={styles.batchPhaseTitle}>Delivery Phase: Customers</Text>
            </View>
            {customersMap.map((customer: any, idx: number) => (
              <View key={customer.id} style={[styles.batchCustomerItem, idx === customersMap.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.batchCustomerHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.batchCustomerName}>{customer.name}</Text>
                    <Text style={styles.batchCustomerAddress} numberOfLines={1}>{customer.address}</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.batchCustomerDetailsBtn}
                    onPress={() => onShowOrderDetails(customer.orders)}
                  >
                    <Text style={styles.batchCustomerDetailsText}>
                      {customer.orders.length > 1 ? `${customer.orders.length} Orders` : 'Details'}
                    </Text>
                    <Icon name="chevron-right" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {isAvailable && (
        isAcceptanceClosed ? (
          <View style={styles.closedBatchBanner}>
            <Icon name="clock-alert-outline" size={18} color={Colors.warning} />
            <Text style={styles.closedBatchText}>Acceptance opens 1hr before start</Text>
          </View>
        ) : (
          <TouchableOpacity 
            style={[styles.batchAcceptBtn, isProcessing && { opacity: 0.7 }]} 
            onPress={() => onAccept(batch.orders, batch.delivery_slot, batch.date_label, batch.id)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color={Colors.dark} size="small" />
            ) : (
              <Text style={styles.batchAcceptBtnText}>Accept Entire Batch</Text>
            )}
          </TouchableOpacity>
        )
      )}

      {!isAvailable && (
        <View style={styles.batchFooter}>
           <Text style={styles.batchFooterHint}>
             {isFullyDelivered ? "All orders delivered." : isAllPickedUp ? "All items collected. Deliver to customers." : "Go to Map for optimized pickup route."}
           </Text>
        </View>
      )}
    </View>
  );
});

const DeliveriesScreen = ({ navigation }: any) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [otpInputs, setOtpInputs] = useState<{ [key: string]: string }>({});
  const [riderLocation, setRiderLocation] = useState<{ latitude: number, longitude: number } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { showAlert } = useCustomAlert();
  const { checkProfileCompleteness } = useProfileCheck();
  const [breakdownModal, setBreakdownModal] = useState<{ visible: boolean; order: any }>({ 
    visible: false, 
    order: null 
  });
  const [orderDetailsModal, setOrderDetailsModal] = useState<{ visible: boolean; orders: any[] }>({
    visible: false,
    orders: []
  });
  const [qrModal, setQrModal] = useState<{ visible: boolean; order: any; upiUri: string }>({
    visible: false,
    order: null,
    upiUri: '',
  });
  const getCurrentLocation = useCallback(() => {
    Geolocation.getCurrentPosition(
      (position) => {
        setRiderLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => console.log('Location Error:', error),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;


      // 1. Unified Fetch: All active orders (Assigned to me OR Unassigned)
      // We do a broad fetch to ensure no orders are missed due to RPC filters
      const { data: allOrders, error: allOrdersError } = await supabase
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
        .or(`rider_id.eq.${user.id},rider_id.is.null`)
        .not('status', 'in', '("delivered","cancelled")');

      if (allOrdersError) throw allOrdersError;

      let fetchedOrders: any[] = allOrders || [];
      
      const { data: riderProfile } = await supabase
        .from('rider_profiles')
        .select('vehicle_type, is_verified')
        .eq('profile_id', user.id)
        .maybeSingle();
      
      const verificationStatus = riderProfile?.is_verified ?? false;
      setIsVerified(verificationStatus);

      if (!verificationStatus) {
        setOrders([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
      // Log all unassigned orders as offers for the rider
      const unassigned = fetchedOrders.filter(o => !o.rider_id);
      if (unassigned.length > 0) {
        const offers = unassigned.map((o: any) => ({
          rider_id: user.id,
          order_id: o.id
        }));
        
        supabase
          .from('rider_offer_logs')
          .upsert(offers, { onConflict: 'rider_id, order_id' })
          .then(({ error: err }) => {
            if (err) console.error('Error logging offers:', err.message);
          });
      }

      const { data: historyOrders, error: historyError } = await supabase
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
      
      if (historyError) {
        console.warn('History orders fetch error:', historyError);
      } else if (historyOrders) {
        fetchedOrders = [...fetchedOrders, ...historyOrders];
      }
      setOrders(fetchedOrders);
    } catch (e: any) {
      console.error('Fetch Orders Error:', e);
      showAlert('Error', `Failed to fetch orders: ${e.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showAlert]);

  const sections = React.useMemo(() => {
    const grouped: { [key: string]: any[] } = {};
    const batches: { [key: string]: any } = {}; // slotLabel -> batchObject

    orders.forEach(order => {
      const isHistory = order.status === 'delivered' || order.status === 'cancelled';
      
      const date = new Date(order.created_at);
      const dateStr = date.toDateString();
      const todayDate = new Date();
      const todayStr = todayDate.toDateString();
      const yesterdayStr = new Date(todayDate.getTime() - 86400000).toDateString();
      
      let label = dateStr;
      if (dateStr === todayStr) label = 'Today';
      else if (dateStr === yesterdayStr) label = 'Yesterday';

      if (!grouped[label]) grouped[label] = [];
      
      const isBatchOrder = !!order.delivery_slot;
      
      if (isBatchOrder) {
        // Group into a virtual batch object. 
        let normalizedSlot = (order.delivery_slot || '').trim();
        const upperSlot = normalizedSlot.toUpperCase();
        if (upperSlot === '2 PM' || upperSlot === '2:00 PM') normalizedSlot = '2-3 PM';
        if (upperSlot === '8 PM' || upperSlot === '8:00 PM') normalizedSlot = '8-9 PM';

        const internalSlotKey = normalizedSlot.toLowerCase().replace(/slot/g, '').replace(/[^a-z0-9]/g, '');
        
        // Use the actual date label instead of hardcoded "Today"
        const batchLabel = label;
        if (!grouped[batchLabel]) grouped[batchLabel] = [];
        
        // Key MUST include date to prevent cross-day slot merging
        const slotKey = `batch_${batchLabel}_${internalSlotKey}`;
        
        if (!batches[slotKey]) {
          batches[slotKey] = {
            id: slotKey,
            is_batch: true,
            delivery_slot: normalizedSlot,
            date_label: batchLabel,
            orders: [],
            status: order.status, 
            rider_id: order.rider_id // Will be overwritten if any order is assigned
          };
          grouped[batchLabel].push(batches[slotKey]);
        }
        
        // If any order in the batch is assigned to current rider, the whole batch is "Active"
        if (order.rider_id) {
          batches[slotKey].rider_id = order.rider_id;
        }
        batches[slotKey].orders.push(order);

        // If it's a history order, ALSO show it separately as requested
        if (isHistory) {
          grouped[label].push(order);
        }
      } else {
        // Regular individual order
        grouped[label].push(order);
      }
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
        
        // Push batches to the top of active deliveries
        if (a.is_batch && !b.is_batch) return -1;
        if (!a.is_batch && b.is_batch) return 1;

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
    getCurrentLocation();
    
    // Subscribe to order changes
    const orderSubscription = supabase
      .channel('rider_orders_all')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders' 
      }, () => {
        fetchOrders();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'order_items'
      }, () => {
        fetchOrders();
      })
      .subscribe();

    // Subscribe to verification status changes
    let profileSubscription: any;
    const setupProfileSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      profileSubscription = supabase
        .channel(`rider_profile_${user.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'rider_profiles',
          filter: `profile_id=eq.${user.id}`
        }, (payload) => {
          console.log('Verification status changed:', payload.new.is_verified);
          setIsVerified(payload.new.is_verified);
          if (payload.new.is_verified) {
            fetchOrders();
          }
        })
        .subscribe();
    };

    setupProfileSubscription();

    return () => {
      if (orderSubscription) orderSubscription.unsubscribe();
      if (profileSubscription) profileSubscription.unsubscribe();
    };
  }, [fetchOrders, getCurrentLocation]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
    getCurrentLocation();
  };

  const handleAcceptBatch = useCallback(async (batchOrders: any[], slot: string, dateLabel: string, batchId: string) => {
    try {
      setProcessingId(batchId);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Re-verify cutoff in handler
      const startTime = getSlotStartTime(slot, dateLabel);
      if (startTime) {
        const now = new Date();
        const oneHourBefore = new Date(startTime.getTime() - 60 * 60 * 1000);
        if (now < oneHourBefore) {
          showAlert('Too Early', 'Acceptance for this batch opens 1 hour before the start time.');
          return;
        }
        if (now > startTime) {
          showAlert('Too Late', 'This batch has already started.');
          return;
        }
      }

      const isProfileComplete = await checkProfileCompleteness(user.id);
      if (!isProfileComplete) return;

      // Check for active non-batch deliveries
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('rider_id', user.id)
        .not('status', 'in', '(delivered,cancelled)')
        .limit(1);

      if (activeOrders && activeOrders.length > 0) {
        showAlert(
          'Active Delivery In Progress',
          'You already have an active delivery. Please complete it before accepting a new batch.'
        );
        return;
      }

      const orderIds = batchOrders.map(o => o.id);
      const { error } = await supabase
        .from('orders')
        .update({ rider_id: user.id })
        .in('id', orderIds);

      if (error) throw error;
      showAlert('Success', `Batch accepted! ${orderIds.length} orders are now in your active deliveries.`);
      await fetchOrders();
    } catch (error: any) {
      showAlert('Error', error.message);
    } finally {
      setTimeout(() => setProcessingId(null), 500);
    }
  }, [checkProfileCompleteness, fetchOrders, showAlert]);

  const handleAcceptOrder = useCallback(async (orderId: string) => {
    try {
      setProcessingId(orderId);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check profile completeness before accepting
      const isProfileComplete = await checkProfileCompleteness(user.id);
      if (!isProfileComplete) return;

      // Check if rider already has an active delivery
      const { data: activeOrders, error: activeError } = await supabase
        .from('orders')
        .select('id')
        .eq('rider_id', user.id)
        .not('status', 'in', '(delivered,cancelled)')
        .limit(1);

      if (activeError) throw activeError;

      if (activeOrders && activeOrders.length > 0) {
        showAlert(
          'Active Delivery In Progress',
          'You already have an active delivery. Please complete it before accepting a new one.'
        );
        return;
      }

      const { error } = await supabase
        .from('orders')
        .update({ rider_id: user.id })
        .eq('id', orderId);

      if (error) throw error;
      showAlert('Success', 'Order accepted! It is now in your active deliveries.');
      await fetchOrders();
    } catch (error: any) {
      showAlert('Error', error.message);
    } finally {
      setTimeout(() => setProcessingId(null), 500);
    }
  }, [checkProfileCompleteness, fetchOrders, showAlert]);

  const handleStorePickUp = useCallback(async (orderIds: string[], storeId: string | undefined, pId: string) => {
    if (!storeId) {
      showAlert('Error', 'Missing store information.');
      return;
    }
    try {
      setProcessingId(pId);
      
      const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
      
      // Execute all pick ups in parallel
      const results = await Promise.all(ids.map(oid => 
        supabase.rpc('mark_store_items_picked_up', {
          input_order_id: oid,
          input_store_id: storeId
        })
      ));
      
      const error = results.find(r => r.error)?.error;
      if (error) throw error;

      showAlert('Success', 'Store marked as picked up!');
      await fetchOrders();
    } catch (error: any) {
      showAlert('Error', error.message);
    } finally {
      setTimeout(() => setProcessingId(null), 500);
    }
  }, [fetchOrders, showAlert]);

  const handleCompleteOrder = useCallback(async (orderId: string, correctOtp: string) => {
    const enteredOtp = otpInputs[orderId];
    if (enteredOtp !== correctOtp) {
      showAlert('Invalid OTP', 'The OTP entered is incorrect. Please ask the customer for the correct OTP.');
      return;
    }

    try {
      setProcessingId(orderId);
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: 'delivered'
        })
        .eq('id', orderId);

      if (error) throw error;
      showAlert('Success', 'Order delivered successfully!');
      await fetchOrders();
    } catch (error: any) {
      showAlert('Error', error.message);
    } finally {
      setTimeout(() => setProcessingId(null), 500);
    }
  }, [fetchOrders, otpInputs, showAlert]);

  const handleShowOrderDetails = (ordersList: any) => {
    const ordersArray = Array.isArray(ordersList) ? ordersList : [ordersList];
    setOrderDetailsModal({ visible: true, orders: ordersArray });
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
      ) : isVerified === false ? (
        <ScrollView
          contentContainerStyle={styles.scrollFlexible}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.verificationContainer}>
            <View style={styles.verificationCard}>
              <View style={styles.iconCircle}>
                <Icon name="shield-account" size={50} color={Colors.primary} />
              </View>
              <Text style={styles.verificationTitle}>Verification Pending</Text>
              <Text style={styles.verificationText}>
                Your profile will be verified by admin then you will be able to accept deliveries
              </Text>
              <View style={styles.statusBadgePending}>
                <Icon name="clock-outline" size={16} color={Colors.warning} />
                <Text style={styles.statusBadgeText}>Awaiting Review</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      ) : orders.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.scrollFlexible}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.emptyContainer}>
            <Icon name="moped" size={80} color={Colors.border} />
            <Text style={styles.emptyText}>No deliveries found</Text>
            <Text style={styles.emptySubtext}>New orders will show up here as they become available.</Text>
          </View>
        </ScrollView>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={true}
          renderItem={({ item }) => {
            if (item.is_batch) {
              return (
                <BatchCard 
                  batch={item}
                  navigation={navigation}
                  onAccept={handleAcceptBatch}
                  onStorePickUp={handleStorePickUp}
                  onShowBreakdown={handleShowBreakdown}
                  onComplete={handleCompleteOrder}
                  onShowQr={handleShowPaymentQr}
                  onShowOrderDetails={handleShowOrderDetails}
                  otpInputs={otpInputs}
                  setOtpInputs={setOtpInputs}
                  riderLocation={riderLocation}
                  processingId={processingId}
                />
              );
            }
            return (
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
                riderLocation={riderLocation}
                processingId={processingId}
              />
            );
          }}
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

      <Modal
        visible={orderDetailsModal.visible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setOrderDetailsModal({ ...orderDetailsModal, visible: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailsModalContent}>
            <View style={styles.detailsModalHeader}>
              <Text style={styles.detailsModalTitle}>Order Details</Text>
              <TouchableOpacity onPress={() => setOrderDetailsModal({ ...orderDetailsModal, visible: false })}>
                <Icon name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              {orderDetailsModal.orders.map((order, idx) => (
                <View key={order.id} style={{ padding: 16, borderBottomWidth: idx < orderDetailsModal.orders.length - 1 ? 8 : 0, borderBottomColor: Colors.border + '50' }}>
                  <OrderCard 
                    order={order}
                    navigation={navigation}
                    onAccept={handleAcceptOrder}
                    onStorePickUp={handleStorePickUp}
                    onShowBreakdown={handleShowBreakdown}
                    onComplete={handleCompleteOrder}
                    onShowQr={handleShowPaymentQr}
                    otpValue={otpInputs[order.id]}
                    setOtpValue={(text: string) => setOtpInputs(prev => ({ ...prev, [order.id]: text }))}
                    riderLocation={riderLocation}
                    processingId={processingId}
                  />
                </View>
              ))}
            </ScrollView>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  detailsModalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  detailsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailsModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 40,
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
  verificationContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  verificationCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  verificationTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  verificationText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  statusBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  statusBadgeText: {
    color: '#d97706',
    fontWeight: '600',
    fontSize: 14,
  },
  scrollFlexible: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  appOfferBadge: {
    flexDirection: 'row',
    backgroundColor: Colors.primaryLight,
    padding: 10,
    borderRadius: BorderRadius.md,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
    gap: 10,
    alignItems: 'center',
  },
  appOfferIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appOfferTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
  },
  appOfferDesc: {
    fontSize: 11,
    color: Colors.primary,
    opacity: 0.8,
  },
  // Batch Card Styles
  batchCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  batchTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  batchIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  batchLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  batchSublabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  batchMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  batchMapBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  batchOrdersList: {
    backgroundColor: '#f8fafc',
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  batchAcceptBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  batchAcceptBtnText: {
    color: Colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  batchFooter: {
    marginTop: Spacing.sm,
    alignItems: 'center',
  },
  batchFooterHint: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
    fontStyle: 'italic',
  },
  // Phase UI Styles
  batchPhaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 8,
  },
  batchPhaseTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  batchStoreItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '50',
  },
  batchStoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  batchStoreName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    flex: 1,
  },
  batchStorePickupBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  batchStorePickupText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  miniSuccessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  miniSuccessText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.success,
  },
  batchProductList: {
    gap: 4,
  },
  batchProductItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchProductText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  batchProductOrderRef: {
    fontSize: 11,
    color: Colors.textSecondary,
    backgroundColor: Colors.border + '50',
    paddingHorizontal: 4,
    borderRadius: 4,
    fontWeight: '700',
  },
  batchCustomerItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '50',
  },
  batchCustomerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  batchCustomerName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  batchCustomerAddress: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  batchCustomerDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
  },
  batchCustomerDetailsText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
  },
  closedBatchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
    marginTop: Spacing.sm,
  },
  closedBatchText: {
    color: Colors.danger,
    fontWeight: '700',
    fontSize: 13,
  },
});

export default DeliveriesScreen;
