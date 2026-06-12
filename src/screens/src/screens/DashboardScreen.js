import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, RefreshControl } from 'react-native';
import { ref, onValue, query, orderByChild } from 'firebase/database';
import { db } from '../firebase';
import { COLORS, minsToStr, fmtTime, initials, today } from '../utils/helpers';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DashboardScreen({ navigation }) {
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    // Subscribe to locations
    const locUnsub = onValue(ref(db, 'locations'), snap => {
      setLocations(snap.val() || {});
    });

    // Subscribe to employees — FIXED: filter out non-employee entries
    const empUnsub = onValue(ref(db, 'employees'), snap => {
      const data = snap.val() || {};
      const validEmployees = Object.entries(data)
        .filter(([uid, emp]) => {
          // Only include entries that have a 'name' field and are actual employees
          // This filters out @logs, @status, @totalMins etc.
          return emp && 
                 typeof emp === 'object' && 
                 emp.name && 
                 typeof emp.name === 'string' &&
                 emp.name.trim().length > 0 &&
                 emp.username; // must have username field
        })
        .map(([uid, emp]) => ({ ...emp, uid }));
      
      setEmployees(validEmployees);
      setLastUpdated(new Date());
    });

    // Auto refresh every 30 seconds
    const timer = setInterval(() => {
      setLastUpdated(new Date());
    }, 30000);

    return () => { locUnsub(); empUnsub(); clearInterval(timer); };
  }, []);

  function calcMins(emp) {
    // Reset check - if lastIn is from a different day, don't count it
    if (emp.lastIn) {
      const lastInDate = new Date(emp.lastIn).toISOString().slice(0, 10);
      if (lastInDate !== today()) {
        return emp.totalMins || 0;
      }
    }
    let m = emp.totalMins || 0;
    if (emp.status === 'inside' && emp.lastIn) {
      m += Math.floor((Date.now() - emp.lastIn) / 60000);
    }
    return Math.max(0, m);
  }

  const insideCount = employees.filter(e => e.status === 'inside').length;
  const outsideCount = employees.filter(e => e.status === 'outside').length;
  const totalMins = employees.reduce((s, e) => s + calcMins(e), 0);

  async function logout() {
    await AsyncStorage.clear();
    navigation.replace('Login');
  }

  function onRefresh() {
    setRefreshing(true);
    setLastUpdated(new Date());
    setTimeout(() => setRefreshing(false), 1000);
  }

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <View style={styles.topbarLeft}>
          <View style={styles.syncDot} />
          <Text style={styles.topbarTitle}>GeoAttend</Text>
        </View>
        <View style={styles.topbarRight}>
          <Text style={styles.adminLabel}>Admin</Text>
          <TouchableOpacity onPress={logout} style={styles.outBtn}>
            <Text style={styles.outBtnText}>Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}>

        <Text style={styles.pageTitle}>Dashboard</Text>
        <Text style={styles.pageSub}>
          {new Date().toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </Text>
        <Text style={styles.liveTag}>● Live — pull down to refresh</Text>

        {/* Metrics */}
        <View style={styles.metrics}>
          <View style={[styles.metric, { borderTopColor: COLORS.accent2 }]}>
            <Text style={[styles.metricVal, { color: COLORS.accent2 }]}>{insideCount}</Text>
            <Text style={styles.metricLabel}>Inside</Text>
          </View>
          <View style={[styles.metric, { borderTopColor: COLORS.danger }]}>
            <Text style={[styles.metricVal, { color: COLORS.danger }]}>{outsideCount}</Text>
            <Text style={styles.metricLabel}>Outside</Text>
          </View>
          <View style={[styles.metric, { borderTopColor: COLORS.accent }]}>
            <Text style={[styles.metricVal, { color: COLORS.accent }]}>{employees.length}</Text>
            <Text style={styles.metricLabel}>Total</Text>
          </View>
          <View style={[styles.metric, { borderTopColor: COLORS.warning }]}>
            <Text style={[styles.metricVal, { color: COLORS.warning, fontSize: 16 }]}>{minsToStr(totalMins)}</Text>
            <Text style={styles.metricLabel}>Team hrs</Text>
          </View>
        </View>

        {/* Live Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>LIVE TEAM STATUS</Text>
          {employees.length === 0 ? (
            <Text style={styles.emptyText}>No employees yet. Add from Team tab.</Text>
          ) : (
            employees.map((emp, i) => {
              const isIn = emp.status === 'inside';
              const loc = locations[emp.locationId];
              const mins = calcMins(emp);
              return (
                <View key={emp.uid} style={[styles.empRow, i < employees.length - 1 && styles.empRowBorder]}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(emp.name)}</Text>
                  </View>
                  <View style={styles.empInfo}>
                    <Text style={styles.empName}>{emp.name}</Text>
                    <Text style={styles.empSub}>
                      {loc ? '📍 ' + loc.name : 'No location'} · {emp.workStart || '--'}–{emp.workEnd || '--'}
                    </Text>
                    <Text style={styles.empHours}>{minsToStr(mins)} today</Text>
                  </View>
                  <View style={styles.empRight}>
                    <View style={[styles.badge, isIn ? styles.badgeIn : styles.badgeOut]}>
                      <Text style={[styles.badgeText, { color: isIn ? COLORS.accent2 : COLORS.danger }]}>
                        {isIn ? '● Inside' : '⬤ Outside'}
                      </Text>
                    </View>
                    <Text style={styles.checkTime}>{isIn ? fmtTime(emp.lastIn) : '--'}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Hours chart */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>HOURS TODAY</Text>
          {employees.length === 0 ? (
            <Text style={styles.emptyText}>No data</Text>
          ) : (
            employees.map((emp) => {
              const mins = calcMins(emp);
              const pct = Math.min(100, Math.round(mins / 540 * 100));
              return (
                <View key={emp.uid} style={{ marginBottom: 12 }}>
                  <View style={styles.barHeader}>
                    <Text style={styles.barName}>{emp.name}</Text>
                    <Text style={styles.barVal}>{minsToStr(mins)}</Text>
                  </View>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: pct + '%' }]} />
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topbar: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 52 : 44, paddingBottom: 12 },
  topbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topbarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent2 },
  topbarTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  adminLabel: { fontSize: 12, color: COLORS.text2 },
  outBtn: { backgroundColor: COLORS.surface2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border },
  outBtnText: { color: COLORS.text, fontSize: 13 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: COLORS.text2, marginTop: 4 },
  liveTag: { fontSize: 11, color: COLORS.accent2, marginBottom: 16, marginTop: 4 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metric: { flex: 1, minWidth: '45%', backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border, borderTopWidth: 3 },
  metricVal: { fontSize: 28, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  metricLabel: { fontSize: 12, color: COLORS.text2, marginTop: 4 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontSize: 11, fontWeight: '700', color: COLORS.text2, letterSpacing: 0.8, marginBottom: 12 },
  emptyText: { color: COLORS.text3, fontSize: 13, textAlign: 'center', padding: 8 },
  empRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 10 },
  empRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empInfo: { flex: 1 },
  empName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  empSub: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  empHours: { fontSize: 12, color: COLORS.accent, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  empRight: { alignItems: 'flex-end', gap: 4 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeIn: { backgroundColor: 'rgba(79,209,160,0.12)' },
  badgeOut: { backgroundColor: 'rgba(255,94,94,0.12)' },
  badgeText: { fontSize: 12, fontWeight: '500' },
  checkTime: { fontSize: 11, color: COLORS.text3, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barName: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  barVal: { fontSize: 12, color: COLORS.text2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  barBg: { backgroundColor: COLORS.surface2, borderRadius: 4, height: 5, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 4, backgroundColor: COLORS.accent },
});
