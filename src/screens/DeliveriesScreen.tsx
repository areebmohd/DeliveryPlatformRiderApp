import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const DeliveriesScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Deliveries</Text>
      <Text style={styles.subtitle}>View your active and past deliveries.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
    marginTop: 8,
  },
});

export default DeliveriesScreen;
