import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { useCustomAlert } from '../context/CustomAlertContext';

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
  const [loading, setLoading] = useState(false);
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    if (user) {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      setProfile(profileData);

      // Profile data is fetched, rider profile availability is no longer manually toggled
    }
    setLoading(false);
  }


  const handleLogout = async () => {
    showAlert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.auth.signOut();
            if (error) showAlert('Error', error.message);
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatarBackground}>
            <Icon name="account" size={50} color="#fff" />
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>RIDER</Text>
          </View>
        </View>
        <Text style={styles.title}>{profile?.full_name || 'Rider'}</Text>
        <Text style={styles.subtitle}>{profile?.phone || 'No phone added'}</Text>
        
      </View>

      <View style={styles.optionsSection}>
        <AccountOption 
          icon="account-edit" 
          label="Edit Profile" 
          onPress={() => navigation.navigate('ProfileSetup', { isEditing: true })} 
        />
        <AccountOption icon="credit-card" label="Payments" onPress={() => {}} />
        <AccountOption 
          icon="bell" 
          label="Notifications" 
          onPress={() => navigation.navigate('Notifications')} 
        />
        <AccountOption icon="headphones" label="Rider Support" onPress={() => {}} />
      </View>
      
      <View style={styles.footer}>
        <View style={styles.emailBadge}>
          <Icon name="email-outline" size={16} color="#6c757d" />
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
    paddingTop: 30,
    paddingBottom: 10,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 15,
  },
  avatarBackground: {
    width: 90,
    height: 90,
    backgroundColor: '#007bff',
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007bff',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  roleBadge: {
    position: 'absolute',
    bottom: -5,
    backgroundColor: '#28a745',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
    marginTop: 4,
  },
  optionsSection: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f1f3f5',
  },
  optionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
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
    fontWeight: '500',
    color: '#343a40',
  },
  footer: {
    marginTop: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(108, 117, 125, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 20,
  },
  loginEmail: {
    fontSize: 13,
    color: '#6c757d',
    marginLeft: 8,
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    width: '100%',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffdada',
    shadowColor: '#dc3545',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  logoutText: {
    color: '#dc3545',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 10,
  },
});

export default AccountScreen;
