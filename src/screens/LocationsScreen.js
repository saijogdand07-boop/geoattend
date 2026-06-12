import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Platform, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { ref, onValue, push, update, remove, get } from 'firebase/database';
import { db } from '../firebase';
import { COLORS, initials } from '../utils/helpers';

export default function LocationsScreen() {
  const [locations, setLocations] = useState({});
  const [employees, setEmployees] = useState({});
  const [pending, setPending] = useState({});
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('200');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const l1 = onValue(ref(db, 'locations'), snap => setLocations(snap.val() || {}));
    const l2 = onValue(ref(db, 'employees'), snap => setEmployees(snap.val() || {}));
    const l3 = onValue(ref(db, 'pendingShares'), snap => setPending(snap.val() || {}));
    return () => { l1(); l2(); l3(); };
  }, []);

  function openAdd() { setEditId(null); setName(''); setLat(''); setLng(''); setRadius('200'); setModal(true); }
  function openEdit(id, loc) { setEditId(id); setName(loc.name); setLat(String(loc.lat)); setLng(String(loc.lng)); setRadius(String(loc.radius)); setModal(true); }

  async function useMyGPS() {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow location to use GPS'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(pos.coords.latitude.toFixed(6));
      setLng(pos.coords.longitude.toFixed(6));
      Alert.alert('✅ GPS Filled', `Accuracy: ±${Math.round(pos.coords.accuracy)}m\nNow give this location a name and save.`);
    } catch (e) { Alert.alert('GPS Error', e.message); }
    setGpsLoading(false);
  }

  async function save() {
    if (!name || !lat || !lng) { Alert.alert('Missing fields', 'Fill all fields'); return; }
    const r = parseInt(radius) || 200;
    if (r < 100) {
      Alert.alert('Small radius', `${r}m is very small. Recommended: 150–300m for reliable tracking.`);
      return;
    }
    setSaving(true);
    const data = { name, lat: parseFloat(lat), lng: parseFloat(lng), radius: r, updatedAt: Date.now() };
    if (editId) await update(ref(db, `locations/${editId}`), data);
    else await push(ref(db, 'locations'), data);
    setSaving(false);
    setModal(false);
  }

  async function deleteLoc(id) {
    Alert.alert('Delete location?', 'Employees assigned here will be unassigned.', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await remove(ref(db, `locations/${id}`));
        const snap = await get(ref(db, 'employees'));
        const emps = snap.val() || {};
        const updates = {};
        Object.keys(emps).forEach(uid => { if (emps[uid].locationId === id) updates[`employees/${uid}/locationId`] = null; });
        if (Object.keys(updates).length) await update(ref(db), updates);
      }}
    ]);
  }

  async function useShared(empId) {
    const share = pending[empId];
    if (!share) return;
    setName(`${share.empName.split(' ')[0]}'s Office`);
    setLat(share.lat.toFixed(6));
    setLng(share.lng.toFixed(6));
    setRadius('200');
    setEditId(null);
    setModal(true);
    await remove(ref(db, `pendingShares/${empId}`));
  }

  const locs = Object.entries(locations);
  const shares = Object.values(pending);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Office Locations</Text>
        <Text style={styles.pageSub}>Geofence zones — admin only 🔒</Text>

        {/* Pending shares */}
        {shares.length > 0 && (
          <View style={styles.pendingSection}>
            <Text style={styles.pendingTitle}>⏳ Pending location shares</Text>
            {shares.map((s, i) => (
              <View key={i} style={styles.pendingCard}>
                <View style={styles.pendingDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingName}>{s.empName}</Text>
                  <Text style={styles.pendingCoords}>{s.lat.toFixed(5)}, {s.lng.toFixed(5)} · ±{s.accuracy}m</Text>
                </View>
                <TouchableOpacity style={styles.useBtn} onPress={() => useShared(s.empId)}>
                  <Text style={styles.useBtnText}>Use →</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(ref(db, `pendingShares/${s.empId}`))}>
                  <Text style={styles.dismissBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addBtnText}>+ Add location</Text>
        </TouchableOpacity>

        {locs.length === 0 ? (
          <Text style={styles.emptyText}>No locations yet. Add your first office location.</Text>
        ) : (
          locs.map(([id, loc]) => {
            const assigned = Object.values(employees).filter(e => e.locationId === id);
            return (
              <View key={id} style={styles.locCard}>
                <View style={styles.locHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locName}>📍 {loc.name}</Text>
                    <Text style={styles.locCoords}>{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</Text>
                    <Text style={styles.locInfo}>Radius: {loc.radius}m · {assigned.length ? assigned.map(e => e.name).join(', ') : 'No employees'}</Text>
                  </View>
                  <View style={styles.locActions}>
                    <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(id, loc)}>
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.delBtn} onPress={() => deleteLoc(id)}>
                      <Text style={styles.delBtnText}>Del</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editId ? 'Edit location' : 'Add location'}</Text>
            <Text style={styles.fieldLabel}>LOCATION NAME</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Main Office, Pune" placeholderTextColor={COLORS.text3} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>LATITUDE</Text>
                <TextInput style={styles.input} value={lat} onChangeText={setLat} placeholder="18.520400" placeholderTextColor={COLORS.text3} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>LONGITUDE</Text>
                <TextInput style={styles.input} value={lng} onChangeText={setLng} placeholder="73.856700" placeholderTextColor={COLORS.text3} keyboardType="numeric" />
              </View>
            </View>
            <Text style={styles.fieldLabel}>RADIUS (METERS) — Recommended: 150–300m</Text>
            <TextInput style={styles.input} value={radius} onChangeText={setRadius} keyboardType="numeric" placeholderTextColor={COLORS.text3} />
            <TouchableOpacity style={styles.gpsBtn} onPress={useMyGPS} disabled={gpsLoading}>
              {gpsLoading ? <ActivityIndicator color={COLORS.accent2} /> : <Text style={styles.gpsBtnText}>📡 Use my current GPS location</Text>}
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save location</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: COLORS.text2, marginBottom: 16, marginTop: 4 },
  pendingSection: { backgroundColor: 'rgba(108,99,255,0.07)', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(108,99,255,0.2)' },
  pendingTitle: { fontSize: 13, fontWeight: '600', color: COLORS.warning, marginBottom: 10 },
  pendingCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: 10, padding: 10, marginBottom: 6 },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.warning },
  pendingName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  pendingCoords: { fontSize: 11, color: COLORS.accent, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  useBtn: { backgroundColor: COLORS.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  useBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  dismissBtn: { color: COLORS.danger, fontSize: 16, paddingHorizontal: 4 },
  addBtn: { backgroundColor: COLORS.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 16 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyText: { color: COLORS.text3, fontSize: 13, textAlign: 'center', padding: 20 },
  locCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  locHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  locName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  locCoords: { fontSize: 12, color: COLORS.accent, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginTop: 2 },
  locInfo: { fontSize: 12, color: COLORS.text2, marginTop: 4 },
  locActions: { flexDirection: 'row', gap: 6 },
  editBtn: { backgroundColor: COLORS.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.border },
  editBtnText: { color: COLORS.text, fontSize: 12 },
  delBtn: { backgroundColor: 'rgba(255,94,94,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,94,94,0.3)' },
  delBtnText: { color: COLORS.danger, fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: 22, padding: 20, paddingBottom: 40, borderTopWidth: 1, borderColor: COLORS.border },
  modalHandle: { width: 36, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
  fieldLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '600', letterSpacing: 0.8, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: COLORS.surface2, borderRadius: 10, padding: 12, fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  gpsBtn: { backgroundColor: 'rgba(79,209,160,0.1)', borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(79,209,160,0.3)', marginTop: 12 },
  gpsBtnText: { color: COLORS.accent2, fontSize: 14, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  saveBtn: { flex: 1, backgroundColor: COLORS.accent, borderRadius: 10, padding: 13, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { flex: 1, backgroundColor: COLORS.surface2, borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { color: COLORS.text, fontSize: 14 },
});
Done
