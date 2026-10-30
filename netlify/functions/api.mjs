import crypto from 'node:crypto';

const MACHINE_IDS = [1, 2, 3, 4, 5, 6];
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function respond(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function getAuthConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    throw Object.assign(new Error('Engineer sign-in is not configured.'), { statusCode: 503 });
  }
  return { supabaseUrl, publishableKey };
}

async function isEngineerAuthenticated(request) {
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return false;

  const { supabaseUrl, publishableKey } = getAuthConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return response.ok;
}

async function getEngineerUser(request) {
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return null;
  const { supabaseUrl, publishableKey } = getAuthConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  });
  return response.ok ? response.json() : null;
}

function mapRow(row) {
  return {
    id: row.id,
    machineId: row.machine_id,
    motorId: row.motor_id,
    temperatureC: Number(row.temperature_c),
    currentA: Number(row.current_a),
    vibrationMmS: Number(row.vibration_mm_s),
    timestamp: new Date(row.timestamp).toISOString(),
    receivedAt: new Date(row.received_at).toISOString(),
  };
}

function mapInspection(row) {
  return {
    id: row.id,
    machineId: row.machine_id,
    scheduleDay: row.schedule_day,
    maintenanceDate: row.maintenance_date,
    motorIds: row.motor_ids || [],
    functionalityStatus: row.functionality_status,
    wiringStatus: row.wiring_status,
    sensorStatus: row.sensor_status,
    mountingStatus: row.mounting_status,
    noiseVibrationStatus: row.noise_vibration_status,
    safetyStatus: row.safety_status,
    lubricationStatus: row.lubrication_status,
    comments: row.comments,
    followUpActions: row.follow_up_actions,
    engineerEmail: row.engineer_email,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function validateInspection(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { issues: ['The request body must be a JSON object.'] };
  const machineId = Number(body.machineId);
  const scheduleDay = typeof body.scheduleDay === 'string' ? body.scheduleDay : '';
  const expectedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const date = typeof body.maintenanceDate === 'string' ? body.maintenanceDate : '';
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const parsedDate = datePattern.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  const statuses = ['satisfactory', 'attention', 'not_checked'];
  const fields = {
    functionality_status: body.functionalityStatus,
    wiring_status: body.wiringStatus,
    sensor_status: body.sensorStatus,
    mounting_status: body.mountingStatus,
    noise_vibration_status: body.noiseVibrationStatus,
    safety_status: body.safetyStatus,
    lubrication_status: body.lubricationStatus,
  };
  const expectedDayByMachine = expectedDays[machineId - 1];
  const motorIds = Array.isArray(body.motorIds)
    ? [...new Set(body.motorIds.map(value => typeof value === 'string' ? value.trim() : ''))]
    : [];
  const comments = typeof body.comments === 'string' ? body.comments.trim() : '';
  const followUpActions = typeof body.followUpActions === 'string' ? body.followUpActions.trim() : '';
  const issues = [];

  if (!MACHINE_IDS.includes(machineId)) issues.push('machineId must be a number from 1 to 6.');
  if (!expectedDays.includes(scheduleDay) || scheduleDay !== expectedDayByMachine) issues.push('scheduleDay must match the weekly machine rotation.');
  if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) issues.push('maintenanceDate must be a valid date in YYYY-MM-DD format.');
  if (!motorIds.length || motorIds.length > 10 || motorIds.some(id => !id || id.length > 64)) issues.push('Select at least one valid motor (64 characters or fewer).');
  for (const [field, value] of Object.entries(fields)) {
    if (!statuses.includes(value)) issues.push(`${field} must be satisfactory, attention, or not_checked.`);
  }
  if (comments.length > 3000) issues.push('comments must be 3000 characters or fewer.');
  if (followUpActions.length > 2000) issues.push('followUpActions must be 2000 characters or fewer.');
  if (issues.length) return { issues };
  return { value: {
    machine_id: machineId,
    schedule_day: scheduleDay,
    maintenance_date: date,
    motor_ids: motorIds,
    ...fields,
    comments,
    follow_up_actions: followUpActions,
  } };
}

function hasValidDeviceToken(request, machineId) {
  const expected = process.env[`DEVICE_TOKEN_MACHINE_${machineId}`];
  const supplied = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
}

async function supabase(path, options = {}) {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey) throw Object.assign(new Error('Database configuration is missing.'), { statusCode: 503 });

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const details = await response.text();
    console.error('Database request failed:', response.status, details.slice(0, 1000));
    throw Object.assign(new Error('Database request failed.'), { statusCode: 502 });
  }
  return response.status === 204 ? [] : response.json();
}

function validateReading(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { issues: ['The request body must be a JSON object.'] };

  const machineId = Number(body.machineId);
  const motorId = typeof body.motorId === 'string' ? body.motorId.trim() : '';
  const temperatureC = Number(body.temperatureC);
  const currentA = Number(body.currentA);
  const vibrationMmS = Number(body.vibrationMmS);
  const timestamp = body.timestamp === undefined ? new Date().toISOString() : body.timestamp;
  const issues = [];

  if (!MACHINE_IDS.includes(machineId)) issues.push('machineId must be a number from 1 to 6.');
  if (!motorId || motorId.length > 64) issues.push('motorId is required and must be 64 characters or fewer.');
  if (!Number.isFinite(temperatureC) || temperatureC < -40 || temperatureC > 250) issues.push('temperatureC must be between -40 and 250.');
  if (!Number.isFinite(currentA) || currentA < 0 || currentA > 10000) issues.push('currentA must be between 0 and 10000.');
  if (!Number.isFinite(vibrationMmS) || vibrationMmS < 0 || vibrationMmS > 1000) issues.push('vibrationMmS must be between 0 and 1000.');
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) issues.push('timestamp must be a valid date-time string.');

  if (issues.length) return { issues };
  return {
    value: {
      machine_id: machineId,
      motor_id: motorId,
      temperature_c: temperatureC,
      current_a: currentA,
      vibration_mm_s: vibrationMmS,
      timestamp: new Date(timestamp).toISOString(),
    },
  };
}

export default async function handler(request) {
  const url = new URL(request.url);

  try {
    if (request.method === 'GET' && url.pathname === '/api/auth/config') {
      const { supabaseUrl, publishableKey } = getAuthConfig();
      return respond(200, { supabaseUrl, publishableKey });
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return respond(200, { ok: true, service: 'motor-condition-monitoring-api' });
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/v1/')) {
      const authenticated = await isEngineerAuthenticated(request);
      if (!authenticated) return respond(401, { error: 'Engineer sign-in is required.' });
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/dashboard') {
      const [latestRows, historyRows] = await Promise.all([
        supabase('rpc/latest_motor_readings', { method: 'POST', body: '{}' }),
        supabase('readings?select=*&order=timestamp.desc&limit=500'),
      ]);
      const latestReadings = latestRows.map(mapRow);
      const readings = historyRows.map(mapRow);
      const machines = MACHINE_IDS.map(id => ({
        id,
        name: `Machine ${id}`,
        motorsReporting: latestReadings.filter(reading => reading.machineId === id).length,
        latestReadings: latestReadings.filter(reading => reading.machineId === id),
        readings: readings.filter(reading => reading.machineId === id).slice(0, 100),
      }));
      return respond(200, { machines });
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/maintenance/inspections') {
      const rows = await supabase('maintenance_inspections?select=*&order=maintenance_date.desc,created_at.desc&limit=50');
      return respond(200, { inspections: rows.map(mapInspection) });
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/maintenance/inspections') {
      const engineer = await getEngineerUser(request);
      if (!engineer) return respond(401, { error: 'Engineer sign-in is required.' });
      let body;
      try {
        body = await request.json();
      } catch {
        return respond(400, { error: 'Send a valid JSON request body.' });
      }
      const result = validateInspection(body);
      if (result.issues) return respond(400, { error: 'Inspection record is invalid.', issues: result.issues });
      const inserted = await supabase('maintenance_inspections', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ ...result.value, engineer_id: engineer.id, engineer_email: engineer.email || '' }),
      });
      return respond(201, { saved: true, inspection: mapInspection(inserted[0]) });
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/machines') {
      const rows = await supabase('rpc/latest_motor_readings', { method: 'POST', body: '{}' });
      const latestReadings = rows.map(mapRow);
      const machines = MACHINE_IDS.map(id => {
        const machineReadings = latestReadings.filter(reading => reading.machineId === id);
        return {
          id,
          name: `Machine ${id}`,
          motorsReporting: machineReadings.length,
          latestReadings: machineReadings,
        };
      });
      return respond(200, { machines });
    }

    const machineReadingsMatch = url.pathname.match(/^\/api\/v1\/machines\/([1-6])\/readings$/);
    if (request.method === 'GET' && machineReadingsMatch) {
      const machineId = Number(machineReadingsMatch[1]);
      const limit = Number(url.searchParams.get('limit') || 100);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        return respond(400, { error: 'limit must be a whole number from 1 to 500.' });
      }
      const query = new URLSearchParams({
        select: '*',
        machine_id: `eq.${machineId}`,
        order: 'timestamp.desc',
        limit: String(limit),
      });
      const rows = await supabase(`readings?${query.toString()}`);
      return respond(200, { machineId, readings: rows.map(mapRow) });
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/readings') {
      let body;
      try {
        body = await request.json();
      } catch {
        return respond(400, { error: 'Send a valid JSON request body.' });
      }

      const machineId = Number(body?.machineId);
      if (!MACHINE_IDS.includes(machineId)) return respond(400, { error: 'machineId must be a number from 1 to 6.' });
      if (!process.env[`DEVICE_TOKEN_MACHINE_${machineId}`]) {
        return respond(503, { error: `DEVICE_TOKEN_MACHINE_${machineId} is not set on this server.` });
      }
      if (!hasValidDeviceToken(request, machineId)) {
        return respond(401, { error: 'A valid bearer token for this machine is required.' });
      }

      const result = validateReading(body);
      if (result.issues) return respond(400, { error: 'Reading is invalid.', issues: result.issues });
      const inserted = await supabase('readings', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(result.value),
      });
      return respond(201, { saved: true, reading: mapRow(inserted[0]) });
    }

    return respond(404, { error: 'API route not found.' });
  } catch (error) {
    console.error('API request failed:', error);
    return respond(error.statusCode || 500, { error: error.statusCode === 503 ? error.message : 'Unexpected server error.' });
  }
}

export const config = { path: '/api/*' };
