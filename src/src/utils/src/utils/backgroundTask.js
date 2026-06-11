import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { ref, get, update, push } from 'firebase/database';
import { db } from '../firebase';
import { haversine, minsToStr, fmtTime } from './helpers';

export const LOCATION_TASK = 'GEOATTEND_LOCATION_TASK';

// Store current user info for background task
let _currentUser = null;
export function setBackgroundUser(username) { _currentUser = username; }

// Define the background location task
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) { console.log('BG Location error:', error); return; }
  if (!data || !_currentUser) return;

  const { locations } = data;
  const pos = locations[0];
  if (!pos) return;

  try {
    // Get employee and location data from Firebase
    const empSnap = await get(ref(db, `employees/${_currentUser}`));
    const emp = empSnap.val();
    if (!emp || !emp.locationId) return;

    const locSnap = await get(ref(db, `locations/${emp.locationId}`));
    const loc = locSnap.val();
    if (!loc) return;

    const dist = Math.round(haversine(
      pos.coords.latitude, pos.coords.longitude,
      loc.lat, loc.lng
    ));
    const acc = Math.round(pos.coords.accuracy);

    // Skip if GPS not accurate enough
    if (acc > loc.radius) return;

    const inside = dist <= loc.radius;
    const wasInside = emp.status === 'inside';
    const now = Date.now();

    if (inside && !wasInside) {
      // CHECK IN
      const logKey = push(ref(db, `employees/${_currentUser}/logs`)).key;
      const globalKey = push(ref(db, 'logs')).key;
      const updates = {};
      updates[`employees/${_currentUser}/status`] = 'inside';
      updates[`employees/${_currentUser}/lastIn`] = now;
      updates[`employees/${_currentUser}/checkins`] = (emp.checkins || 0) + 1;
      updates[`employees/${_currentUser}/logs/${logKey}`] = { type: 'in', time: now };
      if (!emp.firstIn) updates[`employees/${_currentUser}/firstIn`] = now;
      updates[`logs/${globalKey}`] = { empId: _currentUser, empName: emp.name, type: 'in', time: now, locName: loc.name };
      await update(ref(db), updates);

      // Send local notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✅ Checked In',
          body: `You are now inside ${loc.name}. Have a great day!`,
          sound: true,
        },
        trigger: null,
      });

    } else if (!inside && wasInside) {
      // CHECK OUT
      const addMins = emp.lastIn ? Math.floor((now - emp.lastIn) / 60000) : 0;
      const logKey = push(ref(db, `employees/${_currentUser}/logs`)).key;
      const globalKey = push(ref(db, 'logs')).key;
      const updates = {};
      updates[`employees/${_currentUser}/status`] = 'outside';
      updates[`employees/${_currentUser}/lastIn`] = null;
      updates[`employees/${_currentUser}/totalMins`] = (emp.totalMins || 0) + addMins;
      updates[`employees/${_currentUser}/logs/${logKey}`] = { type: 'out', time: now };
      updates[`logs/${globalKey}`] = { empId: _currentUser, empName: emp.name, type: 'out', time: now, locName: loc.name };
      await update(ref(db), updates);

      // Send local notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📤 Checked Out',
          body: `You left ${loc.name}. Time worked: ${minsToStr(addMins)}`,
          sound: true,
        },
        trigger: null,
      });
    }
  } catch (e) {
    console.log('BG task error:', e);
  }
});

export async function startBackgroundTracking() {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') return false;

    const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    if (isRunning) return true;

    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,        // Highest accuracy — like Google Maps
      distanceInterval: 20,                    // Update every 20 meters of movement
      timeInterval: 15000,                     // Or every 15 seconds
      foregroundService: {
        notificationTitle: 'GeoAttend Active',
        notificationBody: 'Tracking your office attendance in background',
        notificationColor: '#6c63ff',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,  // iOS blue bar
      activityType: Location.ActivityType.Other,
    });
    return true;
  } catch (e) {
    console.log('Start BG tracking error:', e);
    return false;
  }
}

export async function stopBackgroundTracking() {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    if (isRunning) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch (e) { console.log('Stop BG error:', e); }
}
