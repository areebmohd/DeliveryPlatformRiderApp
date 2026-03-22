import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapView, Camera, PointAnnotation } from 'mappls-map-react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { Colors, Spacing } from '../theme/colors';
import Geolocation from 'react-native-geolocation-service';

const { width, height } = Dimensions.get('window');

const DeliveryMapScreen = ({ route, navigation }: any) => {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [riderLocation, setRiderLocation] = useState<any>(null);

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

    return () => Geolocation.clearWatch(watchId);
  }, []);

  const fetchActiveOrders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch both assigned active orders and the specific order requested (could be unassigned)
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          stores:store_id (name, location, address),
          addresses:delivery_address_id (receiver_name, location, address_line, city)
        `)
        .or(`rider_id.eq.${user.id},id.eq.${orderId}`)
        .in('status', ['pending_verification', 'accepted', 'preparing', 'ready', 'picked_up']);

      if (error) throw error;
      setActiveOrders(data || []);
    } catch (error: any) {
      console.error('Error fetching orders:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentRiderLocation = () => {
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
  };

  const parseLocation = (locString: string) => {
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
  };

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

        {/* Active Order Markers */}
        {activeOrders.map((order) => {
          const storeLoc = parseLocation(order.stores?.location);
          const customerLoc = parseLocation(order.addresses?.location);
          
          return (
            <React.Fragment key={order.id}>
              {storeLoc && (
                <PointAnnotation
                  id={`store-${order.id}`}
                  coordinate={[storeLoc.longitude, storeLoc.latitude]}
                >
                  <View style={[styles.marker, { backgroundColor: Colors.warning }]}>
                    <Icon name="store" size={20} color={Colors.dark} />
                  </View>
                </PointAnnotation>
              )}
              {customerLoc && (
                <PointAnnotation
                  id={`customer-${order.id}`}
                  coordinate={[customerLoc.longitude, customerLoc.latitude]}
                >
                  <View style={[styles.marker, { backgroundColor: Colors.success }]}>
                    <Icon name="account" size={20} color={Colors.white} />
                  </View>
                </PointAnnotation>
              )}
            </React.Fragment>
          );
        })}
      </MapView>

      {/* Selected Info Card */}
      {selectedOrder && (
        <View style={[styles.infoCard, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Text style={styles.selectedOrderTitle}>Focus: Order #{selectedOrder.order_number}</Text>
          <View style={styles.infoRow}>
            <Icon name="store" size={20} color={Colors.warning} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Pickup</Text>
              <Text style={styles.infoValue} numberOfLines={1}>{selectedOrder.stores?.name}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Icon name="account-location" size={20} color={Colors.success} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Drop-off</Text>
              <Text style={styles.infoValue} numberOfLines={1}>{selectedOrder.addresses?.address_line}</Text>
            </View>
          </View>
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
});

export default DeliveryMapScreen;
