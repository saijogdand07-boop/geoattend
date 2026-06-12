import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Platform } from 'react-native';
import { ref, onValue, set, remove, update, get } from 'firebase/database';
import { db } from '../firebase';
import { COLORS, minsToStr, initials, today } from '../utils/helpers';

export default function TeamScreen() {
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState({});
  const [modal, setModal] = useState(false);
  const [locModal, setLocModal] = useState(false);
  const [editEmpId, setEditEmpId] = useState(null);
  const [selectedLocId, setSelectedLocId] = useState('');
  const [form, setForm] = useState({ name: '', username: '', password: '', workStart: '09:00', workEnd: '18:00', locationId: '' });

  useEffect(() => {
    const l1 = onValue(ref(db, 'employees'), snap => {
      const data = snap.val() || {};
      // FIXED: Filter out fake entries like @logs, @status, @totalMins
      const valid = Object.entries(data)
        .filter(([uid, emp]) =>
          emp &&
          typeof emp === 'object' &&
          emp.name &&
          typeof emp.name === 'string' &&
          emp.name.trim().length > 0 &&
          emp.username
        )
        .map(([uid, emp]) => ({ ...emp, uid }));
      setEmployees(valid);
    });
    const l2 = onValue(ref(db, 'locations'), snap => setLocations(snap.val() || {}));
    return () => { l1(); l2(); };
  }, []);

  function calcMins(emp) {
    if (emp.lastIn) {
      const lastInDate = new Date(emp.lastIn).toISOString().slice(0, 10);
      if (lastInDate !== today()) return emp.totalMins || 0;
    }
    let m = emp.totalMins || 0;
    if (emp.status === 'inside' && emp.lastIn) m += Math.floor((Date.now() - emp.lastIn) / 60000);
    return Math.max(0, m);
  }

  async function addEmployee() {
    const { name, username, password, workStart, workEnd, locationId } = form;
    if (!name.trim() || !username.trim() || !password) {
      Alert.alert('Missing fields', 'Fill name, username and password');
      return;
    }
    const u = username.trim().toLowerCase();
    // Prevent reserved Firebase keys
    if (['logs', 'status', 'totalMins', 'lastIn', 'firstIn', 'checkins', 'locationId', 'name', 'username', 'password'].includes(u)) {
      Alert.alert('Invalid username', 'Please choose a different username');
      return;
    }
    const snap = await get(ref(db, `employees/${u}`));
    if (snap.exists()) { Alert.alert('Username taken', 'Choose a different username'); return; }
    await set(ref(db, `employees/${u}`), {
      name: name.trim(),
      username: u,
      password,
      workStart,
      workEnd,
      locationId: locationId || null,
      status: 'outside',
      lastIn: null,
      firstIn: null,
      totalMins: 0,
      checkins: 0,
      joinedAt: Date.now(),
      lastReset: today(),
    });
    setModal(false);
    setForm({ name: '', username: '', password: '', workStart: '09:00', workEnd: '18:00', locationId: '' });
    Alert.alert('✅ Employee added', `${name.trim()} can now login with username: ${u}`);
  }

  async function removeEmp(uid) {
    Alert.alert('Remove employee?', 'All their data will be deleted.', [
      { text: 'Cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await remove(ref(db, `employees/${uid}`));
          // Remove their logs too
          const logSnap = await get(ref(db, 'logs'));
          const logs = logSnap.val() || {};
          const updates = {};
          Object.keys(logs).forEach(key => {
            if (logs[key].empId === uid) updates[`logs/${key}`] = null;
          });
          if (Object.keys(updates).length) await update(ref(db), updates);
        }
      }
    ]);
  }

  function openAssignLoc(uid) {
    setEditEmpId(uid);
    const emp = employees.find(e => e.uid === uid);
    setSelectedLocId(emp?.locationId || '');
    setLocModal(true);
  }

  async function saveAssignLoc() {
    await update(ref(db, `employees/${editEmpId}`), { locationId: selectedLocId || null });
    setLocModal(false);
    Alert.alert('✅ Location assigned');
  }

  const locs = Object.entries(locations);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Team</Text>
        <Text style={styles.pageSub}>Manage employees & assign locations</Text>

        <TouchableOpacity style={styles.addBtn} onPress={() => { setForm({ name: '', username: '', password: '', workStart: '09:00', workEnd: '18:00', locationId: '' }); setModal(true); }}>
          <Text style={styles.addBtnText}>+ Add employee</Text>
        </TouchableOpacity>

        {employees.length === 0 ? (
          <Text style={styles.emptyText}>No employees yet.</Text>
        ) : (
          employees.map((emp) => {
            const isIn = emp.status === 'inside';
            const loc = locations[emp.locationId];
            const mins = calcMins(emp);
            return (
              <View key={emp.uid} style={styles.empCard}>
                <View style={styles.empHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(emp.name)}</Text>
                  </View>
                  <View style={styles.empInfo}>
                    <Text style={styles.empName}>{emp.name}</Text>
                    <Text style={styles.empUser}>@{emp.uid}</Text>
                    <Text style={styles.empHours}>{emp.workStart || '--'}–{emp.workEnd || '--'} · {minsToStr(mins)} today</Text>
                  </View>
                  <View style={[styles.badge, isIn ? styles.badgeIn : styles.badgeOut]}>
                    <Text style={[styles.badgeText, { color: isIn ? COLORS.accent2 : COLORS.danger }]}>
                      {isIn ? '● In' : '⬤ Out'}
                    </Text>
                  </View>
                </View>
                <View style={styles.empFooter}>
                  <TouchableOpacity style={styles.locTag} onPress={() => openAssignLoc(emp.uid)}>
                    <Text style={styles.locTagText}>{loc ? '📍 ' + loc.name : '+ Assign location'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeEmp(emp.uid)}>
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Add Employee Modal */}
      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <ScrollView>
            <View style={styles.modalCard}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Add employee</Text>
              {[
                { label: 'FULL NAME', key: 'name', placeholder: 'e.g. Rahul Sharma' },
                { label: 'USERNAME (used for login)', key: 'username', placeholder: 'rahul', autoCapitalize: 'none' },
                { label: 'PASSWORD', key: 'password', placeholder: 'password', secure: true },
                { label: 'WORK START', key: 'workStart', placeholder: '09:00' },
                { label: 'WORK END', key: 'workEnd', placeholder: '18:00' },
              ].map(f => (
                <View key={f.key}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  <TextInput
                    style={styles.input}
                    value={form[f.key]}
                    onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                    placeholder={f.placeholder}
                    placeholderTextColor={COLORS.text3}
                    secureTextEntry={f.secure}
                    autoCapitalize={f.autoCapitalize || 'words'}
                  />
                </View>
              ))}
              <Text style={styles.fieldLabel}>ASSIGN LOCATION</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <TouchableOpacity
                  style={[styles.locChip, !form.locationId && styles.locChipActive]}
                  onPress={() => setForm(p => ({ ...p, locationId: '' }))}>
                  <Text style={styles.locChipText}>None</Text>
                </TouchableOpacity>
                {locs.map(([id, l]) => (
                  <TouchableOpacity key={id}
                    style={[styles.locChip, form.locationId === id && styles.locChipActive]}
                    onPress={() => setForm(p => ({ ...p, locationId: id }))}>
                    <Text style={styles.locChipText}>📍 {l.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.saveBtn} onPress={addEmployee}>
                  <Text style={styles.saveBtnText}>Add employee</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Assign Location Modal */}
      <Modal visible={locModal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Assign location</Text>
            <Text style={styles.pageSub}>{employees.find(e => e.uid === editEmpId)?.name}</Text>
            <TouchableOpacity
              style={[styles.locOption, !selectedLocId && styles.locOptionActive]}
              onPress={() => setSelectedLocId('')}>
              <Text style={styles.locOptionText}>— No location —</Text>
            </TouchableOpacity>
            {locs.map(([id, l]) => (
              <TouchableOpacity key={id}
                style={[styles.locOption, selectedLocId === id && styles.locOptionActive]}
                onPress={() => setSelectedLocId(id)}>
                <Text style={styles.locOptionText}>📍 {l.name}</Text>
                <Text style={styles.locOptionSub}>{l.lat?.toFixed(4)}, {l.lng?.toFixed(4)} · {l.radius}m</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={saveAssignLoc}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setLocModal(false)}>
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
  addBtn: { backgroundColor: COLORS.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 16 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyText: { color: COLORS.text3, fontSize: 13, textAlign: 'center', padding: 20 },
  empCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  empHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empInfo: { flex: 1 },
  empName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  empUser: { fontSize: 12, color: COLORS.text3, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  empHours: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeIn: { backgroundColor: 'rgba(79,209,160,0.12)' },
  badgeOut: { backgroundColor: 'rgba(255,94,94,0.12)' },
  badgeText: { fontSize: 12, fontWeight: '500' },
  empFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locTag: { flex: 1, backgroundColor: 'rgba(108,99,255,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(108,99,255,0.2)' },
  locTagText: { fontSize: 12, color: COLORS.accent },
  removeBtn: { backgroundColor: 'rgba(255,94,94,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,94,94,0.2)' },
  removeBtnText: { color: COLORS.danger, fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: 22, padding: 20, paddingBottom: 40, borderTopWidth: 1, borderColor: COLORS.border },
  modalHandle: { width: 36, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  fieldLabel: { fontSize: 11, color: COLORS.text2, fontWeight: '600', letterSpacing: 0.8, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: COLORS.surface2, borderRadius: 10, padding: 12, fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  locChip: { backgroundColor: COLORS.surface2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 6, borderWidth: 1, borderColor: COLORS.border },
  locChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  locChipText: { color: COLORS.text, fontSize: 13 },
  locOption: { backgroundColor: COLORS.surface2, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  locOptionActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(108,99,255,0.1)' },
  locOptionText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  locOptionSub: { color: COLORS.text2, fontSize: 11, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  saveBtn: { flex: 1, backgroundColor: COLORS.accent, borderRadius: 10, padding: 13, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { flex: 1, backgroundColor: COLORS.surface2, borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { color: COLORS.text, fontSize: 14 },
});
