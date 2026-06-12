import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { COLORS, fmtDateTime } from '../utils/helpers';

export function LogsScreen() {
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState({});
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const l1 = onValue(ref(db, 'logs'), snap => {
      const data = snap.val() || {};
      const arr = Object.values(data).sort((a, b) => b.time - a.time);
      setLogs(arr);
    });
    const l2 = onValue(ref(db, 'employees'), snap => setEmployees(snap.val() || {}));
    return () => { l1(); l2(); };
  }, []);

  const filtered = filter === 'all' ? logs : logs.filter(l => l.empId === filter);
  const emps = Object.entries(employees);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Activity Logs</Text>
        <Text style={styles.pageSub}>Real-time check-in / check-out</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <TouchableOpacity style={[styles.filterChip, filter === 'all' && styles.filterActive]} onPress={() => setFilter('all')}>
            <Text style={styles.filterText}>All</Text>
          </TouchableOpacity>
          {emps.map(([uid, emp]) => (
            <TouchableOpacity key={uid} style={[styles.filterChip, filter === uid && styles.filterActive]} onPress={() => setFilter(uid)}>
              <Text style={styles.filterText}>{emp.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.card}>
          {filtered.length === 0 ? <Text style={styles.emptyText}>No activity yet</Text> :
            filtered.slice(0, 80).map((log, i) => (
              <View key={i} style={[styles.logRow, i < filtered.length - 1 && styles.logBorder]}>
                <View style={[styles.logDot, log.type === 'in' ? styles.dotIn : styles.dotOut]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.logName}>{log.empName} — <Text style={{ color: log.type === 'in' ? COLORS.accent2 : COLORS.danger }}>{log.type === 'in' ? 'Checked in' : 'Left office'}</Text>{log.locName ? <Text style={styles.logLoc}> ({log.locName})</Text> : null}</Text>
                  <Text style={styles.logTime}>{fmtDateTime(log.time)}</Text>
                </View>
              </View>
            ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function SettingsScreen({ navigation }) {
  const [newPass, setNewPass] = useState('');
  const [confPass, setConfPass] = useState('');
  const [interval, setIntervalVal] = useState('30000');

  async function changePass() {
    if (newPass.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters'); return; }
    if (newPass !== confPass) { Alert.alert('Error', 'Passwords do not match'); return; }
    const { update, ref } = require('firebase/database');
    const { db } = require('../firebase');
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const u = await AsyncStorage.getItem('currentUser');
    await update(ref(db, `accounts/${u}`), { password: newPass });
    Alert.alert('Success', 'Password updated');
    setNewPass(''); setConfPass('');
  }

  async function saveInterval() {
    const { update, ref } = require('firebase/database');
    const { db } = require('../firebase');
    await update(ref(db, 'settings'), { trackInterval: parseInt(interval) });
    Alert.alert('Saved', 'GPS interval updated');
  }

  async function logout() {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const { stopBackgroundTracking } = require('../utils/backgroundTask');
    await stopBackgroundTracking();
    await AsyncStorage.clear();
    navigation.replace('Login');
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Settings</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>CHANGE PASSWORD</Text>
          <TextInput style={styles.input} value={newPass} onChangeText={setNewPass} placeholder="New password" placeholderTextColor={COLORS.text3} secureTextEntry />
          <TextInput style={[styles.input, { marginTop: 8 }]} value={confPass} onChangeText={setConfPass} placeholder="Confirm password" placeholderTextColor={COLORS.text3} secureTextEntry />
          <TouchableOpacity style={[styles.btn, { marginTop: 12 }]} onPress={changePass}>
            <Text style={styles.btnText}>Update password</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>GPS TRACKING INTERVAL</Text>
          {[['10000', 'Every 10s (fastest)'], ['30000', 'Every 30s (recommended)'], ['60000', 'Every 1 min (battery saver)']].map(([val, label]) => (
            <TouchableOpacity key={val} style={[styles.optionRow, interval === val && styles.optionActive]} onPress={() => setIntervalVal(val)}>
              <Text style={styles.optionText}>{label}</Text>
              {interval === val && <Text style={{ color: COLORS.accent }}>✓</Text>}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.btn, { marginTop: 12 }]} onPress={saveInterval}>
            <Text style={styles.btnText}>Save interval</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: COLORS.text2, marginBottom: 16, marginTop: 4 },
  filterChip: { backgroundColor: COLORS.surface2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 6, borderWidth: 1, borderColor: COLORS.border },
  filterActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterText: { color: COLORS.text, fontSize: 13 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontSize: 11, fontWeight: '700', color: COLORS.text2, letterSpacing: 0.8, marginBottom: 12 },
  emptyText: { color: COLORS.text3, fontSize: 13, textAlign: 'center', padding: 12 },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  logBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  logDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 3 },
  dotIn: { borderColor: COLORS.accent2, backgroundColor: 'rgba(79,209,160,0.15)' },
  dotOut: { borderColor: COLORS.danger, backgroundColor: 'rgba(255,94,94,0.1)' },
  logName: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  logLoc: { color: COLORS.text3, fontSize: 12 },
  logTime: { fontSize: 11, color: COLORS.text2, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  input: { backgroundColor: COLORS.surface2, borderRadius: 10, padding: 12, fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  btn: { backgroundColor: COLORS.accent, borderRadius: 10, padding: 13, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 6, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border },
  optionActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(108,99,255,0.1)' },
  optionText: { fontSize: 14, color: COLORS.text },
  logoutBtn: { backgroundColor: 'rgba(255,94,94,0.1)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,94,94,0.3)', marginTop: 8 },
  logoutText: { color: COLORS.danger, fontSize: 15, fontWeight: '600' },
});
Done
