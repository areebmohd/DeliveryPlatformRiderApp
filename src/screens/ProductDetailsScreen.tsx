import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  StatusBar,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, BorderRadius, Typography } from '../theme/colors';

const ProductDetailsScreen = ({ route }: any) => {
  const { items, storeName } = route.params;

  const renderProduct = (item: any) => {
    // More robust data resolution
    const productsField = item.products;
    const product = Array.isArray(productsField) 
      ? (productsField.length > 0 ? productsField[0] : item) 
      : (productsField || item);

    const imageUrl = product?.image_url || product?.raw_image_url || item.image_url || item.raw_image_url;

    return (
      <View key={item.id} style={styles.productCard}>
        <View style={styles.imageContainer}>
          {imageUrl ? (
            <Image 
              source={{ uri: imageUrl }} 
              style={styles.productImage} 
              resizeMode="cover"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Icon name="package-variant" size={64} color={Colors.border} />
            </View>
          )}
        </View>
        
        <View style={styles.nameContainer}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.product_name || product.name || 'Unnamed Product'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>{storeName}</Text>
          <Text style={styles.headerSubtitle}>{items.length} {items.length === 1 ? 'Item' : 'Items'} for pickup</Text>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        {items.map(renderProduct)}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA', // Refined off-white background
  },
  header: {
    paddingTop: 10,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: 'transparent', 
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.navTitle,
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  scrollContent: {
    padding: Spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tipIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
    lineHeight: 18,
  },
  productCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1, // Square image
    backgroundColor: '#F2F2F7',
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameContainer: {
    padding: Spacing.md,
    backgroundColor: Colors.white,
    alignItems: 'center',
  },
  productName: {
    ...Typography.cardTitle,
    color: Colors.text,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerSpacing: {
    height: 100,
  },
});

export default ProductDetailsScreen;
