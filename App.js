import 'expo-dev-client';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator } from 'react-native';

import LoginScreen from './src/screens/LoginScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import TeamScreen from './src/screens/TeamScreen';
import LocationsScreen from './src/screens/LocationsScreen';
import { LogsScreen, SettingsScreen } from './src/screens/LogsAndSettingsScreens';
import { COLORS } from './src/utils/helpers';
import { setBackgroundUser } from './src/utils/backgroundTask';

SplashScreen.preventAutoHideAsync();

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Admin bottom tab navigator
function AdminTabs({ navigation }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.text3,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Home: focused ? 'grid' : 'grid-outline',
            Team: focused ? 'people' : 'people-outline',
            Zones: focused ? 'location' : 'location-outline',
            Logs: focused ? 'list' : 'list-outline',
            Settings: focused ? 'settings' : 'settings-outline',
          };
          return <Ionicons name={icons[route.name] || 'ellipse'} size={22} color={color} />;
        },
      })}>
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Team" component={TeamScreen} />
      <Tab.Screen name="Zones" component={LocationsScreen} />
      <Tab.Screen name="Logs" component={LogsScreen} />
      <Tab.Screen name="Settings">{(props) => <SettingsScreen {...props} />}</Tab.Screen>
    </Tab.Navigator>
  );
}

// Employee bottom tab navigator
function EmployeeTabs({ navigation }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.text3,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
      }}>
      <Tab.Screen name="Attendance" component={AttendanceScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="business" size={22} color={color} /> }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    checkAuth();
    // Handle notification taps
    Notifications.addNotificationResponseReceivedListener(() => {});
  }, []);

  async function checkAuth() {
    try {
      const user = await AsyncStorage.getItem('currentUser');
      const role = await AsyncStorage.getItem('currentRole');
      if (user && role) {
        setBackgroundUser(user);
        setInitialRoute(role === 'admin' ? 'AdminTabs' : 'EmployeeTabs');
      } else {
        setInitialRoute('Login');
      }
    } catch (e) {
      setInitialRoute('Login');
    }
    await SplashScreen.hideAsync();
  }

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="AdminTabs" component={AdminTabs} />
        <Stack.Screen name="EmployeeTabs" component={EmployeeTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
