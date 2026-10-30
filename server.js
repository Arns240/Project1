const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const READINGS_FILE = path.join(DATA_DIR, 'readings.json');
const INSPECTIONS_FILE = path.join(DATA_DIR, 'maintenance-inspections.json');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 16 * 1024;
const MACHINE_IDS = new Set([1, 2, 3, 4, 5, 6]);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

let writeQueue = Promise.resolve();

async function readReadings() {
  try {
    return JSON.parse(await fs.readFile(READINGS_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(READINGS_FILE, '[]\n', 'utf8');
    return [];
  }
}

async function writeReadings(readings) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporaryFile = `${READINGS_FILE}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(readings, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryFile, READINGS_FILE);
}

async function readInspections() {
  try {
    return JSON.parse(await fs.readFile(INSPECTIONS_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(INSPECTIONS_FILE, '[]\n', 'utf8');
    return [];
  }
}

async function writeInspections(inspections) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporaryFile = `${INSPECTIONS_FILE}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(inspections, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryFile, INSPECTIONS_FILE);
}

function persistReading(reading) {
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const readings = await readReadings();
    readings.push(reading);
    await writeReadings(readings);
  });
  return writeQueue;
}

function persistInspection(inspection) {
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const inspections = await readInspections();
    inspections.unshift(inspection);
    await writeInspections(inspections);
  });
  return writeQueue;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': MIME_TYPES['.json'],
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function getMachineToken(machineId) {
  return process.env[`DEVICE_TOKEN_MACHINE_${machineId}`];
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
  const accessToken = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return false;
  const { supabaseUrl, publishableKey } = getAuthConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  });
  return response.ok;
}

async function getEngineerUser(request) {
  const accessToken = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return null;
  const { supabaseUrl, publishableKey } = getAuthConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  });
  return response.ok ? response.json() : null;
}

function hasValidDeviceToken(request, machineId) {
  const expected = getMachineToken(machineId);
  const supplied = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error('Send a valid JSON request body.'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function validateReading(body) {
  const machineId = Number(body.machineId);
  const motorId = typeof body.motorId === 'string' ? body.motorId.trim() : '';
  const temperatureC = Number(body.temperatureC);
  const currentA = Number(body.currentA);
  const vibrationMmS = Number(body.vibrationMmS);
  const timestamp = body.timestamp === undefined ? new Date().toISOString() : body.timestamp;
  const issues = [];

  if (!MACHINE_IDS.has(machineId)) issues.push('machineId must be a number from 1 to 6.');
  if (!motorId || motorId.length > 64) issues.push('motorId is required and must be 64 characters or fewer.');
  if (!Number.isFinite(temperatureC) || temperatureC < -40 || temperatureC > 250) issues.push('temperatureC must be between -40 and 250.');
  if (!Number.isFinite(currentA) || currentA < 0 || currentA > 10000) issues.push('currentA must be between 0 and 10000.');
  if (!Number.isFinite(vibrationMmS) || vibrationMmS < 0 || vibrationMmS > 1000) issues.push('vibrationMmS must be between 0 and 1000.');
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) issues.push('timestamp must be a valid date-time string.');

  if (issues.length) return { issues };
  return {
    value: {
      id: crypto.randomUUID(),
      machineId,
      motorId,
      temperatureC,
      currentA,
      vibrationMmS,
      timestamp: new Date(timestamp).toISOString(),
      receivedAt: new Date().toISOString(),
    },
  };
}

function validateInspection(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { issues: ['The request body must be a JSON object.'] };
  const machineId = Number(body.machineId);
  const scheduleDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const scheduleDay = typeof body.scheduleDay === 'string' ? body.scheduleDay : '';
  const maintenanceDate = typeof body.maintenanceDate === 'string' ? body.maintenanceDate : '';
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const parsedDate = datePattern.test(maintenanceDate) ? new Date(`${maintenanceDate}T00:00:00Z`) : null;
  const statuses = ['satisfactory', 'attention', 'not_checked'];
  const statusFields = {
    functionalityStatus: body.functionalityStatus,
    wiringStatus: body.wiringStatus,
    sensorStatus: body.sensorStatus,
    mountingStatus: body.mountingStatus,
    noiseVibrationStatus: body.noiseVibrationStatus,
    safetyStatus: body.safetyStatus,
    lubricationStatus: body.lubricationStatus,
  };
  const motorIds = Array.isArray(body.motorIds)
    ? [...new Set(body.motorIds.map(value => typeof value === 'string' ? value.trim() : ''))]
    : [];
  const comments = typeof body.comments === 'string' ? body.comments.trim() : '';
  const followUpActions = typeof body.followUpActions === 'string' ? body.followUpActions.trim() : '';
  const issues = [];

  if (!MACHINE_IDS.has(machineId)) issues.push('machineId must be a number from 1 to 6.');
  if (!scheduleDays.includes(scheduleDay) || scheduleDay !== scheduleDays[machineId - 1]) issues.push('scheduleDay must match the weekly machine rotation.');
  if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== maintenanceDate) issues.push('maintenanceDate must be a valid date in YYYY-MM-DD format.');
  if (!motorIds.length || motorIds.length > 10 || motorIds.some(id => !id || id.length > 64)) issues.push('Select at least one valid motor (64 characters or fewer).');
  for (const [field, value] of Object.entries(statusFields)) {
    if (!statuses.includes(value)) issues.push(`${field} must be satisfactory, attention, or not_checked.`);
  }
  if (comments.length > 3000) issues.push('comments must be 3000 characters or fewer.');
  if (followUpActions.length > 2000) issues.push('followUpActions must be 2000 characters or fewer.');
  if (issues.length) return { issues };
  return { value: {
    machineId, scheduleDay, maintenanceDate, motorIds, ...statusFields, comments, followUpActions,
  } };
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/auth/config') {
    const { supabaseUrl, publishableKey } = getAuthConfig();
    return sendJson(response, 200, { supabaseUrl, publishableKey });
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, 200, { ok: true, service: 'motor-condition-monitoring-api' });
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/v1/')) {
    const authenticated = await isEngineerAuthenticated(request);
    if (!authenticated) return sendJson(response, 401, { error: 'Engineer sign-in is required.' });
  }

  if (request.method === 'GET' && url.pathname === '/api/v1/dashboard') {
    const readings = await readReadings();
    const latestByMachine = new Map();
    for (const id of MACHINE_IDS) {
      const machineReadings = readings
        .filter(reading => reading.machineId === id)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const latestByMotor = new Map();
      for (const reading of machineReadings) {
        if (!latestByMotor.has(reading.motorId)) latestByMotor.set(reading.motorId, reading);
      }
      latestByMachine.set(id, [...latestByMotor.values()]);
    }
    const machines = [...MACHINE_IDS].map(id => ({
      id,
      name: `Machine ${id}`,
      motorsReporting: latestByMachine.get(id).length,
      latestReadings: latestByMachine.get(id),
      readings: readings
        .filter(reading => reading.machineId === id)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 100),
    }));
    return sendJson(response, 200, { machines });
  }

  if (request.method === 'GET' && url.pathname === '/api/v1/maintenance/inspections') {
    const inspections = await readInspections();
    return sendJson(response, 200, { inspections: inspections.slice(0, 50) });
  }

  if (request.method === 'POST' && url.pathname === '/api/v1/maintenance/inspections') {
    const engineer = await getEngineerUser(request);
    if (!engineer) return sendJson(response, 401, { error: 'Engineer sign-in is required.' });
    const body = await readJsonBody(request);
    const result = validateInspection(body);
    if (result.issues) return sendJson(response, 400, { error: 'Inspection record is invalid.', issues: result.issues });
    const inspection = {
      id: crypto.randomUUID(),
      ...result.value,
      engineerEmail: engineer.email || '',
      createdAt: new Date().toISOString(),
    };
    await persistInspection(inspection);
    return sendJson(response, 201, { saved: true, inspection });
  }

  if (request.method === 'GET' && url.pathname === '/api/v1/machines') {
    const readings = await readReadings();
    const machines = [...MACHINE_IDS].map(id => {
      const machineReadings = readings.filter(reading => reading.machineId === id);
      const latestByMotor = new Map();
      for (const reading of machineReadings.sort((a, b) => b.timestamp.localeCompare(a.timestamp))) {
        if (!latestByMotor.has(reading.motorId)) latestByMotor.set(reading.motorId, reading);
      }
      return {
        id,
        name: `Machine ${id}`,
        motorsReporting: [...latestByMotor.keys()].length,
        latestReadings: [...latestByMotor.values()],
      };
    });
    return sendJson(response, 200, { machines });
  }

  const machineReadingsMatch = url.pathname.match(/^\/api\/v1\/machines\/([1-6])\/readings$/);
  if (request.method === 'GET' && machineReadingsMatch) {
    const machineId = Number(machineReadingsMatch[1]);
    const limitValue = Number(url.searchParams.get('limit') || 100);
    if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 500) {
      return sendJson(response, 400, { error: 'limit must be a whole number from 1 to 500.' });
    }
    const readings = await readReadings();
    const filtered = readings
      .filter(reading => reading.machineId === machineId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limitValue);
    return sendJson(response, 200, { machineId, readings: filtered });
  }

  if (request.method === 'POST' && url.pathname === '/api/v1/readings') {
    const body = await readJsonBody(request);
    const machineId = Number(body.machineId);
    if (!MACHINE_IDS.has(machineId)) {
      return sendJson(response, 400, { error: 'machineId must be a number from 1 to 6.' });
    }
    if (!getMachineToken(machineId)) {
      return sendJson(response, 503, { error: `DEVICE_TOKEN_MACHINE_${machineId} is not set on this server.` });
    }
    if (!hasValidDeviceToken(request, machineId)) {
      return sendJson(response, 401, { error: 'A valid bearer token for this machine is required.' });
    }
    const result = validateReading(body);
    if (result.issues) return sendJson(response, 400, { error: 'Reading is invalid.', issues: result.issues });

    await persistReading(result.value);
    return sendJson(response, 201, { saved: true, reading: result.value });
  }

  return sendJson(response, 404, { error: 'API route not found.' });
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return sendJson(response, 405, { error: 'Only GET and HEAD are supported for website files.' });
    }

    const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
    if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
      return sendJson(response, 403, { error: 'File access denied.' });
    }
    const contents = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    if (error.statusCode) return sendJson(response, error.statusCode, { error: error.message });
    if (error.code === 'ENOENT') return sendJson(response, 404, { error: 'Page or file not found.' });
    console.error(error);
    sendJson(response, 500, { error: 'Unexpected server error.' });
  }
}

http.createServer(handleRequest).listen(PORT, HOST, () => {
  console.log(`Motor monitoring prototype running at http://${HOST}:${PORT}`);
  console.log('Local prototype only. Do not expose this server directly to the public internet.');
});
