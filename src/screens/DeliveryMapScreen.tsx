import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapView, Camera, PointAnnotation, ShapeSource, LineLayer } from 'mappls-map-react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import Geolocation from 'react-native-geolocation-service';


const DeliveryMapScreen = ({ route }: any) => {
  const { orderId, batchOrders, batchSlot } = route.params;
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [riderLocation, setRiderLocation] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [nextRouteLine, setNextRouteLine] = useState<any>(null);
  const [lastStopsHash, setLastStopsHash] = useState<string>('');



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

  const parseLocation = useCallback((locString: string) => {
    if (!locString) return null;
    
    // If it's a WKT string (e.g. "POINT(77.123 28.123)")
    const match = locString.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
    if (match) {
      return {
        longitude: parseFloat(match[1]),
        latitude: parseFloat(match[2]),
      };
    }

    // If it's a hex EWKB string (common from Supabase directly)
    // EWKB for Point SRID 4326 (Little Endian): 0101000020E6100000<8-byte-X><8-byte-Y>
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
      } catch (e) {
        console.error('Error parsing hex location:', e);
      }
    }
    return null;
  }, []);

  const stops = React.useMemo(() => {
    if (!riderLocation || activeOrders.length === 0) return [];

    let calculatedStops: any[] = [];
    const allOrdersPickedUp = activeOrders.every(o => o.status === 'picked_up');

    if (allOrdersPickedUp) {
      // DELIVERY PHASE: All items picked up, route to customers
      calculatedStops = activeOrders
        .map(o => ({
          ...parseLocation(o.addresses?.location),
          id: o.id,
          type: 'customer'
        }))
        .filter(l => !!l.latitude)
        .sort((a, b) => {
          const distA = calculateDistance(riderLocation.latitude, riderLocation.longitude, a.latitude, a.longitude);
          const distB = calculateDistance(riderLocation.latitude, riderLocation.longitude, b.latitude, b.longitude);
          return distA - distB;
        });
    } else {
      // PICKUP PHASE: Collect products from all stores
      const pendingStores = new Map();
      activeOrders.forEach(order => {
        if (order.status !== 'picked_up') {
          // Direct store
          if (order.stores) {
            const storeItems = order.order_items.filter((oi: any) => (oi.products?.stores?.id || order.stores?.id) === order.stores.id);
            if (!storeItems.every((oi: any) => oi.is_picked_up)) {
              pendingStores.set(order.stores.id, order.stores);
            }
          }
          // Stores from items
          order.order_items?.forEach((item: any) => {
            const s = item.products?.stores;
            if (s && !item.is_picked_up) {
              pendingStores.set(s.id, s);
            }
          });
        }
      });

      calculatedStops = Array.from(pendingStores.values())
        .map(s => ({
          ...parseLocation(s.location),
          id: s.id,
          type: 'store'
        }))
        .filter(l => !!l.latitude)
        .sort((a, b) => {
          const distA = calculateDistance(riderLocation.latitude, riderLocation.longitude, a.latitude, a.longitude);
          const distB = calculateDistance(riderLocation.latitude, riderLocation.longitude, b.latitude, b.longitude);
          return distA - distB;
        });
    }
    return calculatedStops;
  }, [activeOrders, riderLocation, parseLocation]);

  const getCurrentRiderLocation = useCallback(() => {
    Geolocation.getCurrentPosition(
      (position) => {
        setRiderLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => console.log('Current Location Error:', error),
      { enableHighAccuracy: true }
    );
  }, []);

  const fetchActiveOrders = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      let query = supabase
        .from('orders')
        .select(`
          *,
          stores:store_id (id, name, location, address),
          addresses:delivery_address_id (location, address_line, city),
          customer:profiles!orders_customer_id_fkey (phone, full_name),
          order_items (
            product_id,
            is_picked_up,
            products (
              stores (id, name, location, address)
            )
          )
        `);

      if (batchOrders && batchOrders.length > 0) {
        const ids = batchOrders.map((o: any) => o.id);
        query = query.in('id', ids);
      } else {
        query = query.or(`rider_id.eq.${user.id},id.eq.${orderId}`)
                     .in('status', ['waiting_for_pickup', 'picked_up']);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      const orders = data || [];
      setActiveOrders(orders);

      // Extract unique stores
      const storeMap = new Map();
      orders.forEach(order => {
        if (order.stores) storeMap.set(order.stores.id, order.stores);
        order.order_items?.forEach((item: any) => {
          const s = item.products?.stores;
          if (s) storeMap.set(s.id, s);
        });
      });
      setStores(Array.from(storeMap.values()));

    } catch (error: any) {
      console.error('Error fetching orders:', error.message);
    } finally {
      setLoading(false);
    }
  }, [orderId, batchOrders]);

  const fitToStops = useCallback((stopsToFit: any[]) => {
    if (!cameraRef.current || !riderLocation) return;
    
    const allCoords = [
      [riderLocation.longitude, riderLocation.latitude],
      ...stopsToFit.map(s => [s.longitude, s.latitude])
    ];

    // Simple bounding box calculation
    let minLng = allCoords[0][0], maxLng = allCoords[0][0];
    let minLat = allCoords[0][1], maxLat = allCoords[0][1];

    allCoords.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });

    cameraRef.current.setCamera({
      bounds: {
        ne: [maxLng, maxLat],
        sw: [minLng, minLat],
        paddingLeft: 50,
        paddingRight: 50,
        paddingTop: 50,
        paddingBottom: 200, // Account for info card
      },
      duration: 1000,
    });
  }, [riderLocation]);

  const calculateAndFetchRoute = useCallback(async () => {
    if (!riderLocation || activeOrders.length === 0 || stops.length === 0) {
      if (stops.length === 0) {
        setNextRouteLine(null);
        setLastStopsHash('');
      }
      return;
    }

    // MEMORY/SPEED FIX: Only re-process if stops or rider position changed
    const currentStopsHash = `${riderLocation.longitude.toFixed(5)},${riderLocation.latitude.toFixed(5)}|` + stops.map(s => `${s.longitude},${s.latitude}`).join('|');
    if (lastStopsHash === currentStopsHash && nextRouteLine) {
      return;
    }

    try {
      // THE FIX: Only show route line if the order is accepted by this rider
      const selectedOrder = activeOrders[0];
      if (selectedOrder && selectedOrder.rider_id !== currentUserId) {
        setNextRouteLine(null);
        setLastStopsHash('');
        return;
      }

      // DIRECT PATH: Instead of API road routing (which misses small galis), 
      // we draw a straight direct line to the next stop.
      const directPath = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [riderLocation.longitude, riderLocation.latitude],
            [stops[0].longitude, stops[0].latitude]
          ]
        }
      };
      
      setNextRouteLine(directPath);
      setLastStopsHash(currentStopsHash);
      fitToStops(stops);
    } catch (error) {
      console.error('Error updating path:', error);
    }
  }, [riderLocation, activeOrders, lastStopsHash, nextRouteLine, fitToStops, stops, currentUserId]);

  useEffect(() => {
    fetchActiveOrders();
    getCurrentRiderLocation();

    // Watch rider location
    const watchId = Geolocation.watchPosition(
      (position) => {
        setRiderLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => console.log('Watch Error:', error),
      { enableHighAccuracy: true, distanceFilter: 10 }
    );

    // Real-time subscription for order updates (including pickup status)
    const ordersSubscription = supabase
      .channel('map_orders_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchActiveOrders();
      })
      .subscribe();

    const itemsSubscription = supabase
      .channel('map_items_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        fetchActiveOrders();
      })
      .subscribe();

    return () => {
      Geolocation.clearWatch(watchId);
      ordersSubscription.unsubscribe();
      itemsSubscription.unsubscribe();
    };
  }, [orderId, fetchActiveOrders, getCurrentRiderLocation]);

  useEffect(() => {
    if (activeOrders.length > 0 && riderLocation) {
      calculateAndFetchRoute();
    }
  }, [activeOrders, riderLocation, calculateAndFetchRoute]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Selected order for highlighting or info card
  const selectedOrder = activeOrders.find(o => o.id === orderId) || activeOrders[0];
  const storeLoc = selectedOrder ? parseLocation(selectedOrder.stores?.location) : null;
  const initialCenter = storeLoc 
    ? [storeLoc.longitude, storeLoc.latitude] 
    : (riderLocation ? [riderLocation.longitude, riderLocation.latitude] : [77.2090, 28.6139]);

  return (
    <View style={styles.container}>
      <MapView style={styles.map}>
        <Camera
          ref={cameraRef}
          zoomLevel={14}
          centerCoordinate={initialCenter}
        />

        {/* Primary Route Line - Solid Blue */}
        {nextRouteLine && (
          <ShapeSource id="nextRouteSource" shape={nextRouteLine}>
            <LineLayer
              id="nextRouteLayer"
              style={{
                lineColor: Colors.primary,
                lineWidth: 5,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
          </ShapeSource>
        )}

        {/* Rider Marker */}
        {riderLocation && (
          <PointAnnotation
            id="rider"
            coordinate={[riderLocation.longitude, riderLocation.latitude]}
          >
            <View style={styles.riderMarker}>
              <Icon name="moped" size={20} color={Colors.white} />
            </View>
          </PointAnnotation>
        )}

        {/* Store Markers (All stores involved) */}
        {stores.map((store) => {
          const loc = parseLocation(store.location);
          if (!loc) return null;

          // Determine if this store is fully picked up for all active orders
          const isFullyPickedUp = activeOrders.every(order => {
            const storeItems = order.order_items?.filter((oi: any) => 
              (oi.products?.stores?.id || order.stores?.id) === store.id
            ) || [];
            return storeItems.length > 0 ? storeItems.every((oi: any) => oi.is_picked_up) : true;
          });

          return (
            <PointAnnotation
              key={`store-${store.id}`}
              id={`store-${store.id}`}
              coordinate={[loc.longitude, loc.latitude]}
            >
              <View style={[
                styles.marker, 
                { backgroundColor: isFullyPickedUp ? Colors.border : Colors.warning }
              ]}>
                <Icon 
                  name={isFullyPickedUp ? "store-check" : "store"} 
                  size={20} 
                  color={isFullyPickedUp ? Colors.textSecondary : Colors.dark} 
                />
              </View>
            </PointAnnotation>
          );
        })}

        {/* Customer Markers */}
        {activeOrders.map((order) => {
          const customerLoc = parseLocation(order.addresses?.location);
          if (!customerLoc) return null;
          return (
            <PointAnnotation
              key={`customer-${order.id}`}
              id={`customer-${order.id}`}
              coordinate={[customerLoc.longitude, customerLoc.latitude]}
            >
              <View style={[styles.marker, { backgroundColor: Colors.success }]}>
                <Icon name="account" size={20} color={Colors.white} />
              </View>
            </PointAnnotation>
          );
        })}
      </MapView>

      {/* Selected Info Card */}
      {selectedOrder && (
        <View style={[styles.infoCard, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Text style={styles.selectedOrderTitle}>
            {batchSlot ? `${batchSlot} Batch` : `Focus: #${selectedOrder?.order_number}`}
          </Text>
          
          {!activeOrders.every(o => o.status === 'picked_up') ? (
            <View style={styles.infoRow}>
              <Icon name="store-marker" size={24} color={Colors.warning} />
              <View style={styles.infoText}>
                <Text style={styles.infoLabel}>Pickup Phase: {stops.length} Store(s) Left</Text>
                <Text style={styles.infoValue} numberOfLines={1}>
                  Collect items from pending stores
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.infoRow}>
              <Icon name="flag-checkered" size={24} color={Colors.success} />
              <View style={styles.infoText}>
                <Text style={styles.infoLabel}>Delivery Phase: {activeOrders.length} Order(s)</Text>
                <Text style={styles.infoValue} numberOfLines={1}>Deliver to customers in sequence</Text>
              </View>
            </View>
          )}

          <TouchableOpacity 
            style={styles.recenterBtn}
            onPress={() => fitToStops(stops)}
          >
            <Icon name="crosshairs-gps" size={20} color={Colors.primary} />
            <Text style={styles.recenterText}>Fit View</Text>
          </TouchableOpacity>
        </View>
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
  },
  map: {
    flex: 1,
  },
  marker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  riderMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  infoCard: {
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  selectedOrderTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  infoText: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text,
  },
  recenterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  recenterText: {
    color: Colors.primary,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});

export default DeliveryMapScreen;
