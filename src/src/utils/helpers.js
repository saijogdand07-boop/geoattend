export const COLORS = {
  bg: '#0a0a0f',
  surface: '#13131a',
  surface2: '#1c1c26',
  surface3: '#242433',
  border: '#2a2a3a',
  accent: '#6c63ff',
  accent2: '#4fd1a0',
  danger: '#ff5e5e',
  warning: '#f5a623',
  text: '#f0f0f5',
  text2: '#8888a0',
  text3: '#44445a',
};

export const LOCATION_TASK = 'GEOATTEND_LOCATION_TASK';

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function minsToStr(m) {
  const capped = Math.min(Math.max(0, m), 1440);
  const h = Math.floor(capped / 60);
  const mn = Math.round(capped % 60);
  return `${h}h ${mn < 10 ? '0' + mn : mn}m`;
}

export function fmtTime(ts) {
  if (!ts) return '--';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function needsDailyReset(emp) {
  if (!emp) return false;
  const lastReset = emp.lastReset || '';
  return lastReset !== today();
}
