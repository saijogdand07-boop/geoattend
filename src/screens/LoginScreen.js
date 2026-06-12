import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { ref, get } from 'firebase/database';
import { db } from '../firebase';
import { COLORS } from '../utils/helpers';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen({ navigation }) {
  const [role, setRole] = useState('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function doLogin() {
    if (!username.trim() || !password) {
      Alert.alert('Error', 'Enter username and password');
      return;
    }
    setLoading(true);
    try {
      const u = username.trim().toLowerCase();
      if (role === 'admin') {
        const snap = await get(ref(db, `accounts/${u}`));
        const acc = snap.val();
        if (acc && acc.role === 'admin' && acc.password === password) {
          await AsyncStorage.setItem('currentUser', u);
          await AsyncStorage.setItem('currentRole', 'admin');
          setTimeout(() => navigation.replace('AdminTabs'), 100);
        } else {
          setLoading(false);
          Alert.alert('Login Failed', 'Invalid admin credentials');
        }
      } else {
        const snap = await get(ref(db, `employees/${u}`));
        const emp = snap.val();
        if (emp && emp.password === password) {
          await AsyncStorage.setItem('currentUser', u);
          await AsyncStorage.setItem('currentRole', 'employee');
          // FIX: was 'EmployeeMain' — correct name is 'EmployeeTabs'
          setTimeout(() => navigation.replace('EmployeeTabs'), 100);
        } else {
          setLoading(false);
          Alert.alert('Login Failed', 'Invalid credentials. Contact your admin.');
        }
      }
    } catch (e) {
      setLoading(false);
      Alert.alert('Connection Error', 'Check your internet connection and try again.');
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Text style={styles.logoEmoji}>📍</Text>
        </View>
        <Text style={styles.appName}>GeoAttend</Text>
        <Text style={styles.appSub}>Attendance & location tracking</Text>

        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, role === 'admin' && styles.tabActive]} onPress={() => setRole('admin')}>
            <Text style={[styles.tabText, role === 'admin' && styles.tabTextActive]}>🔑 Admin</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, role === 'employee' && styles.tabActive]} onPress={() => setRole('employee')}>
            <Text style={[styles.tabText, role === 'employee' && styles.tabTextActive]}>👤 Employee</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>USERNAME</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Enter username"
            placeholderTextColor={COLORS.text3}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter password"
            placeholderTextColor={COLORS.text3}
            secureTextEntry
            onSubmitEditing={doLogin}
          />
          <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={doLogin} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Sign in →</Text>
            }
          </TouchableOpacity>
        </View>

        {role === 'admin' && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>
              First time? Default:{' '}
              <Text style={{ color: COLORS.accent, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                admin / admin123
              </Text>
            </Text>
            <Text style={styles.hintSub}>Change password in Settings after login</Text>
          </View>
        )}
        <Text style={styles.footer}>Contact your administrator if you need access</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { width: 72, height: 72, borderRadius: 20, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  logoEmoji: { fontSize: 36 },
  appName: { fontSize: 28, fontWeight: '700', color: COLORS.text, textAlign: 'center', letterSpacing: -0.5 },
  appSub: { fontSize: 13, color: COLORS.text2, textAlign: 'center', marginBottom: 32, marginTop: 4 },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.surface2, borderRadius: 10, padding: 4, marginBottom: 20 },
  tab: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.accent },
  tabText: { fontSize: 14, fontWeight: '500', color: COLORS.text2 },
  tabTextActive: { color: '#fff' },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  label: { fontSize: 11, color: COLORS.text2, fontWeight: '600', letterSpacing: 0.8, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: COLORS.surface2, borderRadius: 10, padding: 13, fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  btn: { backgroundColor: COLORS.accent, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hint: { backgroundColor: 'rgba(108,99,255,0.1)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(108,99,255,0.3)', marginBottom: 16 },
  hintText: { fontSize: 13, color: COLORS.text2, textAlign: 'center' },
  hintSub: { fontSize: 11, color: COLORS.text3, textAlign: 'center', marginTop: 4 },
  footer: { fontSize: 12, color: COLORS.text3, textAlign: 'center' },
});
