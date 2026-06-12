import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Platform, AppState, ActivityIndicator
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { ref, onValue, update, push, get } from 'firebase/database';
import { db } from '../firebase';
import { COLORS, haversine, minsToStr, fmtTime, fmtDateTime, initials, today, needsDailyReset } from '../utils/helpers';
import { startBackgroundTracking, stopBackgroundTracking, setBackgroundUser } from '../utils/backgroundTask';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export default function AttendanceScreen({ navigation }) {
  const [emp, setEmp] = useState(null);
  const [loc, setLoc] = useState(null);
  const [gpsStatus, setGpsStatus] = useState({ state: 'starting', msg: 'Starting GPS...' });
  const [dist, setDist] = useState(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const watchRef = useRef(null);
  const appState = useRef(AppState.currentState);
  const empRef = useRef(null);
  const locRef = useRef(null);
  const usernameRef = useRef('');

  useEffect(() => {
    init();
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => { sub.remove(); cleanup(); };
  }, []);

  async function init() {
    const u = await AsyncStorage.getItem('currentUser');
    setUsername(u);
    usernameRef.current = u;
    setBackgroundUser(u);

    // Subscribe to employee data
    const empUnsub = onValue(ref(db, `employees/${u}`), async snap => {
      const data = snap.val();
      if (data) {
        // Auto daily reset if needed
        if (needsDailyReset(data)) {
          await performDailyReset(u, data);
          return; // will re-trigger via onValue
        }
        setEmp(data);
        empRef.current = data;
        setLoading(false);
        // Update location ref when locationId changes
        if (data.locationId && locRef.current) {
          const l = locRef.current[data.locationId];
          if (l) setLoc(l);
        }
      }
    });

    // Subscribe to all locations
    const locUnsub = onValue(ref(db, 'locations'), snap => {
      const locs = snap.val() || {};
      locRef.current = locs;
      if (empRef.current?.locationId) {
        setLoc(locs[empRef.current.locationId] || null);
      }
      setLoading(false);
    });

    await requestPermissions();
    return () => { empUnsub(); locUnsub(); };
  }

  async function performDailyReset(uid, empData) {
    // Reset daily stats at midnight
    const updates = {};
    // If employee was inside when day changed, check them out first
    if (empData.status === 'inside' && empData.lastIn) {
      const addMins = Math.floor((Date.now() - empData.lastIn) / 60000);
      updates[`employees/${uid}/totalMins`] = Math.min((empData.totalMins || 0) + addMins, 1440);
      updates[`employees/${uid}/status`] = 'outside';
      updates[`employees/${uid}/lastIn`] = null;
    } else {
      updates[`employees/${uid}/totalMins`] = 0;
    }
    updates[`employees/${uid}/checkins`] = 0;
    updates[`employees/${uid}/firstIn`] = null;
    updates[`employees/${uid}/lastReset`] = today();
    await update(ref(db), updates);
  }

  async function requestPermissions() {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') {
      Alert.alert(
        'Location Required',
        'GeoAttend needs location to track attendance. Please allow in Settings.',
        [{ text: 'OK' }]
      );
      setGpsStatus({ state: 'error', msg: 'Location permission denied' });
      return;
    }
    await Notifications.requestPermissionsAsync();

    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (bg === 'granted') {
      await startBackgroundTracking();
    }
    startForegroundGPS();
  }

  async function startForegroundGPS() {
    setGpsStatus({ state: 'searching', msg: 'Finding your location...' });
    try {
      if (watchRef.current) { watchRef.current.remove(); watchRef.current = null; }
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 10,
          timeInterval: 15000,
        },
        onLocationUpdate
      );
    } catch (e) {
      setGpsStatus({ state: 'error', msg: 'GPS error: ' + e.message });
    }
  }

  async function onLocationUpdate(position) {
    const currentEmp = empRef.current;
    const currentLocs = locRef.current;
    const u = usernameRef.current;

    if (!currentEmp || !currentEmp.locationId) {
      setGpsStatus({ state: 'noLoc', msg: 'No office location assigned — contact admin' });
      return;
    }

    const currentLoc = currentLocs?.[currentEmp.locationId];
    if (!currentLoc) return;

    const d = Math.round(haversine(
      position.coords.latitude, position.coords.longitude,
      currentLoc.lat, currentLoc.lng
    ));
    const acc = Math.round(position.coords.accuracy);
    setDist(d);
    setLoc(currentLoc);

    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setGpsStatus({ state: 'live', msg: `● Live · ±${acc}m · ${time}` });

    const wasInside = currentEmp.status === 'inside';
    const now = Date.now();

    // SMART CHECK-IN: need to be within radius
    if (!wasInside) {
      if (acc > currentLoc.radius * 2) {
        setGpsStatus({ state: 'weak', msg: `⚠️ Weak GPS ±${acc}m — waiting...` });
        return;
      }
      if (d <= currentLoc.radius) {
        const logKey = push(ref(db, `employees/${u}/logs`)).key;
        const gKey = push(ref(db, 'logs')).key;
        const updates = {};
        updates[`employees/${u}/status`] = 'inside';
        updates[`employees/${u}/lastIn`] = now;
        updates[`employees/${u}/checkins`] = (currentEmp.checkins || 0) + 1;
        updates[`employees/${u}/logs/${logKey}`] = { type: 'in', time: now };
        if (!currentEmp.firstIn) updates[`employees/${u}/firstIn`] = now;
        updates[`logs/${gKey}`] = { empId: u, empName: currentEmp.name, type: 'in', time: now, locName: currentLoc.name };
        await update(ref(db), updates);
        Notifications.scheduleNotificationAsync({
          content: { title: '✅ Checked In', body: `You are inside ${currentLoc.name}`, sound: true },
          trigger: null,
        });
      }
    } else {
      // SMART CHECK-OUT: must be clearly outside (radius + 50m buffer)
      if (d > currentLoc.radius + 50) {
        const addMins = currentEmp.lastIn ? Math.min(Math.floor((now - currentEmp.lastIn) / 60000), 1440) : 0;
        const logKey = push(ref(db, `employees/${u}/logs`)).key;
        const gKey = push(ref(db, 'logs')).key;
        const updates = {};
        updates[`employees/${u}/status`] = 'outside';
        updates[`employees/${u}/lastIn`] = null;
        updates[`employees/${u}/totalMins`] = Math.min((currentEmp.totalMins || 0) + addMins, 1440);
        updates[`employees/${u}/logs/${logKey}`] = { type: 'out', time: now };
        updates[`logs/${gKey}`] = { empId: u, empName: currentEmp.name, type: 'out', time: now, locName: currentLoc.name };
        await update(ref(db), updates);
        Notifications.scheduleNotificationAsync({
          content: { title: '📤 Checked Out', body: `You left ${currentLoc.name}`, sound: true },
          trigger: null,
        });
      }
    }
  }

  function onAppStateChange(nextState) {
    if (appState.current.match(/inactive|background/) && nextState === 'active') {
      startForegroundGPS();
    }
    appState.current = nextState;
  }

  function cleanup() {
    if (watchRef.current) { watchRef.current.remove(); watchRef.current = null; }
  }

  async function shareLocation() {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const empData = empRef.current;
      await update(ref(db, `pendingShares/${usernameRef.current}`), {
        empId: usernameRef.current,
        empName: empData?.name || usernameRef.current,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
        time: Date.now()
      });
      Alert.alert('✅ Location Shared', 'Your location has been sent to admin. They can now set up your geofence.');
    } catch (e) {
      Alert.alert('Error', 'Could not get location: ' + e.message);
    }
  }

  async function doLogout() {
    await stopBackgroundTracking();
    await AsyncStorage.clear();
    navigation.replace('Login');
  }

  const isInside = emp?.status === 'inside';
  const totalMins = Math.min(
    (emp?.totalMins || 0) + (isInside && emp?.lastIn ? Math.floor((Date.now() - emp.lastIn) / 60000) : 0),
    1440
  );
  const logs = emp?.logs ? Object.values(emp.logs).sort((a, b) => b.time - a.time) : [];
  const gpsColor = gpsStatus.state === 'live' ? COLORS.accent2 : gpsStatus.state === 'weak' ? COLORS.warning : COLORS.warning;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading attendance...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <View style={styles.topbarLeft}>
          <View style={styles.syncDot} />
          <Text style={styles.topbarTitle}>GeoAttend</Text>
        </View>
        <TouchableOpacity onPress={doLogout} style={styles.outBtn}>
          <Text style={styles.outBtnText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>My Attendance</Text>
        <Text style={styles.pageSub}>
          {new Date().toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </Text>

        {/* GPS Status */}
        <View style={[styles.gpsBar, { borderColor: gpsColor + '44' }]}>
          <View style={[styles.gpsDot, { backgroundColor: gpsColor }]} />
          <Text style={[styles.gpsText, { color: gpsColor }]}>{gpsStatus.msg}</Text>
        </View>

        {!emp?.locationId && (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>⚠️ No office location assigned. Contact your admin.</Text>
          </View>
        )}

        {/* Status Card */}
        <View style={[styles.statusCard, isInside ? styles.statusInside : styles.statusOutside]}>
          <Text style={styles.statusEmoji}>{isInside ? '🏢' : '🏠'}</Text>
          <Text style={[styles.statusText, { color: isInside ? COLORS.accent2 : COLORS.danger }]}>
            {isInside ? 'Inside office' : 'Outside office'}
          </Text>
          <Text style={styles.statusSub}>
            {isInside ? `Checked in at ${fmtTime(emp?.lastIn)}` : 'Not checked in'}
          </Text>
          {loc && dist !== null && (
            <View style={styles.distChip}>
              <Text style={styles.distText}>📍 {loc.name} — {dist}m away (need ≤{loc.radius}m)</Text>
            </View>
          )}
        </View>

        {/* Metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricVal}>{minsToStr(totalMins)}</Text>
            <Text style={styles.metricLabel}>HOURS TODAY</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricVal}>{emp?.checkins || 0}</Text>
            <Text style={styles.metricLabel}>CHECK-INS</Text>
          </View>
          <View style={styles.metric}>
            <Text style={[styles.metricVal, { fontSize: 14 }]}>
              {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </Text>
            <Text style={styles.metricLabel}>TODAY</Text>
          </View>
        </View>

        {/* Share location */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📤 SHARE LOCATION WITH ADMIN</Text>
          <Text style={styles.cardSub}>Stand at your office and share your GPS so admin can set up your geofence.</Text>
          <TouchableOpacity style={styles.shareBtn} onPress={shareLocation}>
            <Text style={styles.shareBtnText}>📍 Share my current location</Text>
          </TouchableOpacity>
        </View>

        {/* Logs */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>TODAY'S ACTIVITY</Text>
          {logs.length === 0 ? (
            <Text style={styles.emptyText}>No activity yet today</Text>
          ) : (
            logs.slice(0, 20).map((log, i) => (
              <View key={i} style={styles.logEntry}>
                <View style={[styles.logDot, log.type === 'in' ? styles.logDotIn : styles.logDotOut]} />
                <View>
                  <Text style={[styles.logText, { color: log.type === 'in' ? COLORS.accent2 : COLORS.danger }]}>
                    {log.type === 'in' ? 'Checked in' : 'Left office'}
                  </Text>
                  <Text style={styles.logMeta}>{fmtDateTime(log.time)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: COLORS.text2, marginTop: 12, fontSize: 14 },
  topbar: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 52 : 44, paddingBottom: 12 },
  topbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent2 },
  topbarTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  outBtn: { backgroundColor: COLORS.surface2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border },
  outBtnText: { color: COLORS.text, fontSize: 13 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: COLORS.text2, marginBottom: 16, marginTop: 4 },
  gpsBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1 },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsText: { fontSize: 12, flex: 1 },
  warnBox: { backgroundColor: 'rgba(245,166,35,0.1)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(245,166,35,0.3)', marginBottom: 12 },
  warnText: { color: COLORS.warning, fontSize: 13 },
  statusCard: { borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 12, borderWidth: 1 },
  statusInside: { backgroundColor: 'rgba(79,209,160,0.06)', borderColor: 'rgba(79,209,160,0.3)' },
  statusOutside: { backgroundColor: 'rgba(255,94,94,0.05)', borderColor: 'rgba(255,94,94,0.2)' },
  statusEmoji: { fontSize: 52, marginBottom: 8 },
  statusText: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  statusSub: { fontSize: 13, color: COLORS.text2, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  distChip: { marginTop: 10, backgroundColor: COLORS.surface2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  distText: { fontSize: 12, color: COLORS.text2 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metric: { flex: 1, backgroundColor: COLORS.surface2, borderRadius: 12, padding: 14, alignItems: 'center' },
  metricVal: { fontSize: 18, fontWeight: '700', color: COLORS.accent, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  metricLabel: { fontSize: 10, color: COLORS.text2, marginTop: 4, letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontSize: 11, fontWeight: '700', color: COLORS.text2, letterSpacing: 0.8, marginBottom: 8 },
  cardSub: { fontSize: 13, color: COLORS.text2, marginBottom: 12 },
  shareBtn: { backgroundColor: 'rgba(79,209,160,0.1)', borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(79,209,160,0.3)' },
  shareBtnText: { color: COLORS.accent2, fontSize: 14, fontWeight: '600' },
  emptyText: { color: COLORS.text3, fontSize: 13, textAlign: 'center', padding: 12 },
  logEntry: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  logDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 3 },
  logDotIn: { borderColor: COLORS.accent2, backgroundColor: 'rgba(79,209,160,0.15)' },
  logDotOut: { borderColor: COLORS.danger, backgroundColor: 'rgba(255,94,94,0.1)' },
  logText: { fontSize: 13, fontWeight: '600' },
  logMeta: { fontSize: 11, color: COLORS.text2, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
});
Done
Paste all that → Commit → tell me done!

Progress:

✅ firebase.js
✅ helpers.js
✅ backgroundTask.js
✅ LoginScreen.js
✅ TeamScreen.js
✅ LocationsScreen.js
✅ LogsAndSettingsScreens.js
🔄 AttendanceScreen.js ← doing now
⏳ DashboardScreen.js (fix location — last one!)
Almost done! Just 1 more after this! 🚀


