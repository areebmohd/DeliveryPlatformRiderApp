import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import DashboardScreen from '../screens/DashboardScreen';
import DeliveriesScreen from '../screens/DeliveriesScreen';
import ReturnsScreen from '../screens/ReturnsScreen';
import AccountScreen from '../screens/AccountScreen';

import { Colors, UI } from '../theme/colors';

const Tab = createBottomTabNavigator();

const TabBarIcon = ({ route, focused, color, size }: any) => {
  let iconName: string = 'help-circle';

  if (route.name === 'Dashboard') {
    iconName = focused ? 'view-dashboard' : 'view-dashboard-outline';
  } else if (route.name === 'Deliveries') {
    iconName = focused ? 'moped' : 'moped-outline';
  } else if (route.name === 'Returns') {
    iconName = 'keyboard-return';
  } else if (route.name === 'Account') {
    iconName = focused ? 'account' : 'account-outline';
  }

  return <Icon name={iconName} size={size} color={color} />;
};

const BottomTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: (props) => <TabBarIcon {...props} route={route} />,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        headerShown: true,
        headerStyle: {
          backgroundColor: Colors.white,
        },
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 20,
          color: Colors.text,
        },
        headerTitleAlign: 'center',
        tabBarStyle: {
          height: UI.tabBarHeight,
          paddingBottom: UI.tabBarPaddingBottom,
          backgroundColor: Colors.white,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginBottom: 2,
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Deliveries" component={DeliveriesScreen} />
      <Tab.Screen name="Returns" component={ReturnsScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
};

export default BottomTabNavigator;
