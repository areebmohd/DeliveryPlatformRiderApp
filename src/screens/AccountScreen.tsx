import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { User } from '@supabase/supabase-js';

const AccountOption = ({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.optionContainer} onPress={onPress}>
    <View style={styles.optionLeft}>
      <Icon name={icon} size={24} color="#007bff" style={styles.optionIcon} />
      <Text style={styles.optionLabel}>{label}</Text>
    </View>
    <Icon name="chevron-right" size={24} color="#adb5bd" />
  </TouchableOpacity>
);

const AccountScreen = ({ navigation }: { navigation: any }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [address, setAddress] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    if (user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(profileData);

      const { data: addressData } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .single();
      setAddress(addressData);
    }
    setLoading(false);
  }

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Error signing out', error.message);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Icon name="account-circle" size={80} color="#007bff" />
        </View>
        <Text style={styles.title}>{profile?.full_name || 'Rider'}</Text>
        <Text style={styles.subtitle}>{profile?.phone || 'No phone added'}</Text>
        
        {address && (
          <View style={styles.addressBadge}>
            <Icon name="map-marker" size={14} color="#6c757d" />
            <Text style={styles.addressText}>
              {address.address_line}, {address.city}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.optionsSection}>
        <AccountOption 
          icon="account-edit" 
          label="Edit Profile" 
          onPress={() => navigation.navigate('ProfileSetup', { isEditing: true })} 
        />
        <AccountOption icon="credit-card" label="Payments & UPI" onPress={() => {}} />
        <AccountOption icon="bell" label="Notifications" onPress={() => {}} />
        <AccountOption icon="headphones" label="Rider Support" onPress={() => {}} />
      </View>
      
      <View style={styles.footer}>
        <View style={styles.infoBox}>
          <Icon name="email-outline" size={20} color="#6c757d" />
          <Text style={styles.loginEmail}>{user?.email}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Icon name="logout-variant" size={20} color="#dc3545" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  avatarContainer: {
    marginVertical: 15,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#212529',
  },
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 4,
  },
  optionsSection: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  optionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    marginRight: 16,
  },
  optionLabel: {
    fontSize: 16,
    color: '#495057',
  },
  addressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e9ecef',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 10,
  },
  addressText: {
    fontSize: 12,
    color: '#6c757d',
    marginLeft: 4,
  },
  footer: {
    marginTop: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    marginBottom: 15,
    width: '100%',
  },
  loginEmail: {
    fontSize: 14,
    color: '#495057',
    marginLeft: 10,
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    width: '100%',
    padding: 16,
    backgroundColor: '#fff1f2',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  logoutText: {
    color: '#dc3545',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 10,
  },
});

export default AccountScreen;
