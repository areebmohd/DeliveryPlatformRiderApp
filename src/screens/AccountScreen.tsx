import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { useCustomAlert } from '../context/CustomAlertContext';
import { Colors, BorderRadius, UI } from '../theme/colors';

const AccountOption = ({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.optionContainer} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.optionLeft}>
      <View style={styles.optionIconWrap}>
        <Icon name={icon} size={22} color={Colors.primary} />
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
    </View>
    <Icon name="chevron-right" size={22} color={Colors.border} />
  </TouchableOpacity>
);

const AccountScreen = ({ navigation }: { navigation: any }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    if (user) {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*, rider_profiles(*)')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      setProfile(profileData);
    }
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
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar backgroundColor={Colors.background} barStyle="dark-content" />

      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatarBackground}>
            <Icon name="account" size={50} color={Colors.white} />
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>RIDER</Text>
          </View>
        </View>
        <Text style={styles.title}>{profile?.full_name || 'Rider'}</Text>
        <Text style={styles.subtitle}>{profile?.phone || 'No phone added'}</Text>

        {profile?.rider_profiles?.[0]?.vehicle_type && profile?.rider_profiles?.[0]?.vehicle_number && (
          <View style={styles.vehicleInfo}>
            <Icon 
              name={profile.rider_profiles[0].vehicle_type.toLowerCase() === 'truck' ? 'truck-delivery' : 'moped'} 
              size={18} 
              color={Colors.primary} 
            />
            <Text style={styles.vehicleText}>
              {profile.rider_profiles[0].vehicle_type.toUpperCase()} • {profile.rider_profiles[0].vehicle_number}
            </Text>
          </View>
        )}
      </View>

      {/* Options */}
      <View style={styles.optionsSection}>
        <AccountOption
          icon="account-edit"
          label="Edit Profile"
          onPress={() => navigation.navigate('ProfileSetup', { isEditing: true })}
        />
        <AccountOption icon="credit-card-outline" label="Payments" onPress={() => navigation.navigate('Payments')} />
        <AccountOption
          icon="bell-outline"
          label="Notifications"
          onPress={() => navigation.navigate('Notifications')}
        />
        <AccountOption 
          icon="headset" 
          label="Rider Support" 
          onPress={() => navigation.navigate('Support')} 
        />
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.emailBadge}>
          <Icon name="email-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.loginEmail}>{user?.email}</Text>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Icon name="logout-variant" size={20} color={Colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingTop: 30,
    paddingBottom: 16,
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarBackground: {
    width: 90,
    height: 90,
    backgroundColor: Colors.primary,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  roleBadge: {
    position: 'absolute',
    bottom: -10,
    backgroundColor: Colors.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  roleBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 4,
  },
  vehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  vehicleText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
    marginLeft: 6,
  },
  optionsSection: {
    marginTop: 20,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  optionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: UI.screenPadding,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  footer: {
    marginTop: 36,
    paddingHorizontal: UI.screenPadding,
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
    color: Colors.textSecondary,
    marginLeft: 8,
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    width: '100%',
    paddingVertical: 16,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffdada',
    shadowColor: Colors.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  logoutText: {
    color: Colors.danger,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 10,
  },
});

export default AccountScreen;
