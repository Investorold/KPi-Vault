import express from 'express';
import cors from 'cors';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.env') });
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3101;
const REQUIRE_SIGNATURE = process.env.REQUIRE_SIGNATURE === 'true';
const ALERT_WORKER_KEY = process.env.ALERT_WORKER_KEY || '';

const DATA_FILE = path.join(__dirname, 'metrics.json');

const defaultStoreShape = () => ({
  metrics: {},
  access: {},
  feedback: {},
  alertRules: {},
  alertRulesByOwner: {},
  alertSubscriptions: {},
  alertTriggers: {},
  shareboards: {},
  shareboardsByOwner: {}
});

const ensureDataFile = () => {
  if (!existsSync(DATA_FILE)) {
    writeFileSync(
      DATA_FILE,
      JSON.stringify(defaultStoreShape(), null, 2),
      'utf8'
    );
  }
};

const loadStore = () => {
  ensureDataFile();
  try {
    const raw = readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const shape = defaultStoreShape();
    return {
      ...shape,
      ...parsed,
      metrics: parsed.metrics || shape.metrics,
      access: parsed.access || shape.access,
      feedback: parsed.feedback || shape.feedback,
      alertRules: parsed.alertRules || shape.alertRules,
      alertRulesByOwner: parsed.alertRulesByOwner || shape.alertRulesByOwner,
      alertSubscriptions: parsed.alertSubscriptions || shape.alertSubscriptions,
      alertTriggers: parsed.alertTriggers || shape.alertTriggers,
      shareboards: parsed.shareboards || shape.shareboards,
      shareboardsByOwner: parsed.shareboardsByOwner || shape.shareboardsByOwner
    };
  } catch (error) {
    console.warn('⚠️ Failed to read metrics.json, starting with empty store.', error);
    return defaultStoreShape();
  }
};

const persistStore = (store) => {
  writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
};

const store = loadStore();

const normaliseAddress = (address) => (address || '').toLowerCase();
const nowIso = () => new Date().toISOString();
const getHeaderAddress = (req) => normaliseAddress(req.headers['x-wallet-address']);

const ensureFeedbackList = (owner, metricId, entryKey) => {
  if (!store.feedback[owner]) {
    store.feedback[owner] = {};
  }
  if (!store.feedback[owner][metricId]) {
    store.feedback[owner][metricId] = {};
  }
  if (!store.feedback[owner][metricId][entryKey]) {
    store.feedback[owner][metricId][entryKey] = [];
  }
  return store.feedback[owner][metricId][entryKey];
};

const findFeedbackById = (feedbackId) => {
  const owners = Object.keys(store.feedback || {});
  for (const owner of owners) {
    const metrics = store.feedback[owner] || {};
    for (const metricId of Object.keys(metrics)) {
      const entries = metrics[metricId] || {};
      for (const entryIndex of Object.keys(entries)) {
        const list = entries[entryIndex] || [];
        const foundIndex = list.findIndex((entry) => entry.id === feedbackId);
        if (foundIndex !== -1) {
          return {
            entry: list[foundIndex],
            entryIndex,
            metricId,
            owner,
            list,
            listIndex: foundIndex
          };
        }
      }
    }
  }
  return null;
};

const ensureAlertOwnerList = (owner) => {
  if (!store.alertRulesByOwner[owner]) {
    store.alertRulesByOwner[owner] = [];
  }
  return store.alertRulesByOwner[owner];
};

const ensureAlertSubscriptions = (alertId) => {
  if (!store.alertSubscriptions[alertId]) {
    store.alertSubscriptions[alertId] = {};
  }
  return store.alertSubscriptions[alertId];
};

const ensureAlertTriggers = (alertId) => {
  if (!store.alertTriggers[alertId]) {
    store.alertTriggers[alertId] = [];
  }
  return store.alertTriggers[alertId];
};

const ensureShareboardsByOwner = (owner) => {
  if (!store.shareboardsByOwner[owner]) {
    store.shareboardsByOwner[owner] = [];
  }
  return store.shareboardsByOwner[owner];
};

const requireMatchingAddress = (res, claimed, headerAddress) => {
  if (claimed && headerAddress && claimed !== headerAddress) {
    res.status(403).json({ error: 'wallet header mismatch' });
    return false;
  }
  return true;
};

const ensureOwnerOrViewer = (res, owner, actor) => {
  if (!actor) {
    res.status(401).json({ error: 'wallet address required' });
    return false;
  }
  if (owner !== actor) {
    res.status(403).json({ error: 'not authorized for this resource' });
    return false;
  }
  return true;
};

const app = express();

// CORS configuration - allow KPI Vault frontend and local development
const corsOptions = {
  origin: [
    'https://kpi-vault.zamataskhub.com', // KPI Vault Frontend (Cloudflare Tunnel)
    'http://localhost:5173', // Local development
    'http://localhost:4173', // Local preview
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    'http://185.197.251.31:4173', // Direct IP access
    /\.vercel\.app$/, // Allow all Vercel deployments (for testing)
    /\.netlify\.app$/, // Allow all Netlify deployments (for testing)
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-wallet-address', 'x-signature', 'x-message', 'x-alert-worker-key', 'x-shareboard-token']
};

app.use(cors(corsOptions));
app.use(express.json());

const verifySignatureMiddleware = (req, res, next) => {
  if (!REQUIRE_SIGNATURE) {
    return next();
  }

  if (req.path === '/health') {
    return next();
  }

  try {
    const walletAddress = req.headers['x-wallet-address'];
    const signature = req.headers['x-signature'];
    const signedMessage = req.headers['x-message'];

    if (!walletAddress || !signature || !signedMessage) {
      return res.status(401).json({ error: 'Signature required' });
    }

    const recovered = ethers.verifyMessage(String(signedMessage), String(signature));
    if (normaliseAddress(recovered) !== normaliseAddress(walletAddress)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    req.verifiedAddress = recovered;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Signature verification failed' });
  }
};

app.use(verifySignatureMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fhe-kpi-vault-backend' });
});

app.get('/metrics/meta/:ownerAddress', (req, res) => {
  const owner = normaliseAddress(req.params.ownerAddress);
  const meta = store.metrics[owner] || {};
  res.json(meta);
});

app.post('/metrics/meta/:ownerAddress', (req, res) => {
  const owner = normaliseAddress(req.params.ownerAddress);
  const { metricId, label, unit, category, description } = req.body || {};

  if (metricId === undefined || metricId === null) {
    return res.status(400).json({ error: 'metricId is required' });
  }

  if (!store.metrics[owner]) {
    store.metrics[owner] = {};
  }

  const record = {
    metricId,
    label: label || '',
    unit: unit || '',
    category: category || '',
    description: description || '',
    updatedAt: new Date().toISOString()
  };

  store.metrics[owner][metricId] = record;
  persistStore(store);

  res.json({ success: true, metadata: record });
});

app.delete('/metrics/meta/:ownerAddress/:metricId', (req, res) => {
  const owner = normaliseAddress(req.params.ownerAddress);
  const { metricId } = req.params;

  if (!store.metrics[owner] || !store.metrics[owner][metricId]) {
    return res.status(404).json({ error: 'Metric metadata not found' });
  }

  delete store.metrics[owner][metricId];
  persistStore(store);

  res.json({ success: true });
});

app.get('/metrics/access/:ownerAddress', (req, res) => {
  const owner = normaliseAddress(req.params.ownerAddress);
  const accessList = store.access[owner] || {};
  res.json(accessList);
});

app.get('/metrics/access/:ownerAddress/:metricId', (req, res) => {
  const owner = normaliseAddress(req.params.ownerAddress);
  const { metricId } = req.params;
  const access = store.access[owner]?.[metricId] || {};
  const viewers = Object.keys(access);
  res.json({ viewers });
});

app.post('/metrics/access/grant', (req, res) => {
  const { ownerAddress, metricId, viewerAddress } = req.body || {};

  if (!ownerAddress || metricId === undefined || metricId === null || !viewerAddress) {
    return res.status(400).json({ error: 'ownerAddress, metricId, and viewerAddress are required' });
  }

  const owner = normaliseAddress(ownerAddress);
  const viewer = normaliseAddress(viewerAddress);

  if (!store.access[owner]) {
    store.access[owner] = {};
  }

  if (!store.access[owner][metricId]) {
    store.access[owner][metricId] = {};
  }

  store.access[owner][metricId][viewer] = {
    viewer,
    grantedAt: new Date().toISOString()
  };

  persistStore(store);

  res.json({ success: true, access: store.access[owner][metricId][viewer] });
});

app.post('/metrics/access/revoke', (req, res) => {
  const { ownerAddress, metricId, viewerAddress } = req.body || {};

  if (!ownerAddress || metricId === undefined || metricId === null || !viewerAddress) {
    return res.status(400).json({ error: 'ownerAddress, metricId, and viewerAddress are required' });
  }

  const owner = normaliseAddress(ownerAddress);
  const viewer = normaliseAddress(viewerAddress);

  if (!store.access[owner] || !store.access[owner][metricId] || !store.access[owner][metricId][viewer]) {
    return res.status(404).json({ error: 'Access grant not found' });
  }

  delete store.access[owner][metricId][viewer];
  persistStore(store);

  res.json({ success: true });
});

/*//////////////////////////////////////////////////////////////
                        INVESTOR FEEDBACK
//////////////////////////////////////////////////////////////*/

app.get('/feedback/:ownerAddress/:metricId/:entryIndex', (req, res) => {
  const owner = normaliseAddress(req.params.ownerAddress);
  const metricId = req.params.metricId;
  const entryIndex = String(req.params.entryIndex ?? '0');
  const includeDeleted = req.query.includeDeleted === 'true';
  const entries = store.feedback[owner]?.[metricId]?.[entryIndex] || [];
  const filtered = includeDeleted ? entries : entries.filter((item) => item.status !== 'deleted');
  res.json({ feedback: filtered });
});

app.post('/feedback', (req, res) => {
  const {
    ownerAddress,
    metricId,
    entryIndex,
    viewerAddress,
    ciphertext,
    commitment,
    noteMetadata,
    timestamp,
    attachments
  } = req.body || {};

  const owner = normaliseAddress(ownerAddress);
  const headerAddress = getHeaderAddress(req);
  const viewer = normaliseAddress(viewerAddress || headerAddress);

  if (!owner || metricId === undefined || metricId === null || entryIndex === undefined || entryIndex === null) {
    return res.status(400).json({ error: 'ownerAddress, metricId, and entryIndex are required' });
  }
  if (!viewer) {
    return res.status(400).json({ error: 'viewerAddress is required' });
  }
  if (!ciphertext || !commitment) {
    return res.status(400).json({ error: 'ciphertext and commitment are required' });
  }

  if (!requireMatchingAddress(res, viewer, headerAddress)) {
    return;
  }

  const entryKey = String(entryIndex);
  const feedbackList = ensureFeedbackList(owner, metricId, entryKey);
  const record = {
    id: randomUUID(),
    owner,
    metricId,
    entryIndex: entryKey,
    viewer,
    ciphertext,
    commitment,
    attachments: attachments || [],
    noteMetadata: noteMetadata || {},
    submittedAt: timestamp || nowIso(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'active'
  };
  feedbackList.push(record);
  persistStore(store);
  res.json({ success: true, feedback: record });
});

app.patch('/feedback/:feedbackId', (req, res) => {
  const feedbackId = req.params.feedbackId;
  const headerAddress = getHeaderAddress(req);
  const { viewerAddress, ciphertext, commitment, noteMetadata, attachments, status } = req.body || {};
  const claimedViewer = normaliseAddress(viewerAddress || headerAddress);
  const result = findFeedbackById(feedbackId);

  if (!result) {
    return res.status(404).json({ error: 'Feedback entry not found' });
  }

  const { entry, owner } = result;
  const actor = claimedViewer || owner;

  if (!actor) {
    return res.status(401).json({ error: 'wallet address required' });
  }

  if (actor !== entry.viewer && actor !== owner) {
    return res.status(403).json({ error: 'Only the author or owner can edit feedback' });
  }

  if (!requireMatchingAddress(res, actor, headerAddress || actor)) {
    return;
  }

  if (ciphertext) {
    entry.ciphertext = ciphertext;
  }
  if (commitment) {
    entry.commitment = commitment;
  }
  if (noteMetadata) {
    entry.noteMetadata = noteMetadata;
  }
  if (attachments) {
    entry.attachments = attachments;
  }
  if (status) {
    entry.status = status;
  }
  entry.updatedAt = nowIso();
  persistStore(store);
  res.json({ success: true, feedback: entry });
});

app.delete('/feedback/:feedbackId', (req, res) => {
  const feedbackId = req.params.feedbackId;
  const headerAddress = getHeaderAddress(req);
  const { actorAddress } = req.body || {};
  const actor = normaliseAddress(actorAddress || headerAddress);
  const result = findFeedbackById(feedbackId);

  if (!result) {
    return res.status(404).json({ error: 'Feedback entry not found' });
  }

  const { entry, owner } = result;

  if (!actor) {
    return res.status(401).json({ error: 'wallet address required' });
  }

  if (actor !== entry.viewer && actor !== owner) {
    return res.status(403).json({ error: 'Only the author or owner can delete feedback' });
  }

  if (!requireMatchingAddress(res, actor, headerAddress || actor)) {
    return;
  }

  entry.status = 'deleted';
  entry.deletedAt = nowIso();
  entry.deletedBy = actor;
  entry.updatedAt = entry.deletedAt;
  persistStore(store);
  res.json({ success: true });
});

/*//////////////////////////////////////////////////////////////
                            ALERT RULES
//////////////////////////////////////////////////////////////*/

app.post('/alerts', (req, res) => {
  const {
    ownerAddress,
    metricId,
    name,
    ruleType,
    config,
    encryptedConfig,
    commitment,
    channels
  } = req.body || {};

  const owner = normaliseAddress(ownerAddress || getHeaderAddress(req));

  if (!owner || metricId === undefined || metricId === null || !commitment) {
    return res.status(400).json({ error: 'ownerAddress, metricId, and commitment are required' });
  }

  const alertId = randomUUID();
  const timestamp = nowIso();
  const rule = {
    id: alertId,
    owner,
    metricId,
    name: name || `Alert ${alertId.slice(0, 6)}`,
    ruleType: ruleType || 'threshold',
    config: config || {},
    encryptedConfig: encryptedConfig || null,
    commitment,
    channels: Array.isArray(channels) ? channels : [],
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    lastTriggeredAt: null
  };

  store.alertRules[alertId] = rule;
  const ownerList = ensureAlertOwnerList(owner);
  ownerList.push(alertId);
  persistStore(store);
  res.json({ success: true, alert: rule });
});

app.get('/alerts/:ownerAddress', (req, res) => {
  const owner = normaliseAddress(req.params.ownerAddress);
  const ids = store.alertRulesByOwner[owner] || [];
  const alerts = ids
    .map((id) => store.alertRules[id])
    .filter(Boolean)
    .filter((rule) => rule.status !== 'deleted');
  res.json({ alerts });
});

app.patch('/alerts/:alertId', (req, res) => {
  const alertId = req.params.alertId;
  const rule = store.alertRules[alertId];
  if (!rule) {
    return res.status(404).json({ error: 'Alert rule not found' });
  }

  const owner = rule.owner;
  const actor = normaliseAddress(req.body?.ownerAddress || getHeaderAddress(req));
  if (!ensureOwnerOrViewer(res, owner, actor)) {
    return;
  }

  const { name, ruleType, config, encryptedConfig, commitment, channels, status } = req.body || {};
  if (name !== undefined) rule.name = name;
  if (ruleType !== undefined) rule.ruleType = ruleType;
  if (config !== undefined) rule.config = config;
  if (encryptedConfig !== undefined) rule.encryptedConfig = encryptedConfig;
  if (commitment) rule.commitment = commitment;
  if (channels !== undefined) rule.channels = Array.isArray(channels) ? channels : [];
  if (status !== undefined) rule.status = status;
  rule.updatedAt = nowIso();
  persistStore(store);
  res.json({ success: true, alert: rule });
});

app.delete('/alerts/:alertId', (req, res) => {
  const alertId = req.params.alertId;
  const rule = store.alertRules[alertId];
  if (!rule) {
    return res.status(404).json({ error: 'Alert rule not found' });
  }
  const actor = normaliseAddress(req.body?.ownerAddress || getHeaderAddress(req));
  if (!ensureOwnerOrViewer(res, rule.owner, actor)) {
    return;
  }
  rule.status = 'deleted';
  rule.deletedAt = nowIso();
  rule.updatedAt = rule.deletedAt;
  persistStore(store);
  res.json({ success: true });
});

app.get('/alerts/:alertId/subscribers', (req, res) => {
  const alertId = req.params.alertId;
  const subscribers = store.alertSubscriptions[alertId] || {};
  res.json({ subscribers });
});

app.post('/alerts/:alertId/subscribe', (req, res) => {
  const alertId = req.params.alertId;
  const rule = store.alertRules[alertId];
  if (!rule) {
    return res.status(404).json({ error: 'Alert rule not found' });
  }

  const { subscriberAddress, channels, email, webhook, pushEndpoint } = req.body || {};
  const headerAddress = getHeaderAddress(req);
  const subscriber = normaliseAddress(subscriberAddress || headerAddress);

  if (!subscriber) {
    return res.status(400).json({ error: 'subscriberAddress is required' });
  }

  const bucket = ensureAlertSubscriptions(alertId);
  bucket[subscriber] = {
    subscriber,
    channels: Array.isArray(channels) ? channels : [],
    email: email || '',
    webhook: webhook || '',
    pushEndpoint: pushEndpoint || '',
    createdAt: bucket[subscriber]?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  persistStore(store);
  res.json({ success: true, subscription: bucket[subscriber] });
});

app.post('/alerts/:alertId/unsubscribe', (req, res) => {
  const alertId = req.params.alertId;
  const { subscriberAddress } = req.body || {};
  const headerAddress = getHeaderAddress(req);
  const subscriber = normaliseAddress(subscriberAddress || headerAddress);

  if (!subscriber) {
    return res.status(400).json({ error: 'subscriberAddress is required' });
  }

  const bucket = store.alertSubscriptions[alertId];
  if (!bucket || !bucket[subscriber]) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  delete bucket[subscriber];
  persistStore(store);
  res.json({ success: true });
});

app.get('/alerts/:alertId/triggers', (req, res) => {
  const alertId = req.params.alertId;
  const triggers = store.alertTriggers[alertId] || [];
  res.json({ triggers });
});

app.post('/alerts/:alertId/trigger', (req, res) => {
  const alertId = req.params.alertId;
  const rule = store.alertRules[alertId];
  if (!rule) {
    return res.status(404).json({ error: 'Alert rule not found' });
  }

  const headerAddress = getHeaderAddress(req);
  const { ownerAddress, metricId, entryIndex, payload } = req.body || {};
  const owner = normaliseAddress(ownerAddress || rule.owner);

  if (owner !== rule.owner) {
    return res.status(400).json({ error: 'owner mismatch' });
  }

  const workerKeyHeader = req.headers['x-alert-worker-key'] || '';
  const actorIsOwner = headerAddress && headerAddress === owner;
  const workerAuthorized = ALERT_WORKER_KEY
    ? workerKeyHeader === ALERT_WORKER_KEY
    : !!workerKeyHeader;

  if (!actorIsOwner && !workerAuthorized) {
    return res.status(403).json({ error: 'Not authorized to log trigger' });
  }

  const bucket = ensureAlertTriggers(alertId);
  const trigger = {
    id: randomUUID(),
    alertId,
    owner,
    metricId: metricId || rule.metricId,
    entryIndex: entryIndex ?? null,
    payload: payload || {},
    triggeredAt: nowIso(),
    source: actorIsOwner ? 'owner' : 'worker'
  };
  bucket.push(trigger);
  rule.lastTriggeredAt = trigger.triggeredAt;
  persistStore(store);
  res.json({ success: true, trigger });
});

/*//////////////////////////////////////////////////////////////
                          SHAREBOARDS
//////////////////////////////////////////////////////////////*/

app.post('/shareboards', (req, res) => {
  const {
    ownerAddress,
    title,
    description,
    metricIds,
    includeHistoryWindow,
    snapshotStrategy,
    accessMode,
    accessToken,
    allowedWallets,
    invitees,
    snapshotEntries,
    metadata
  } = req.body || {};

  const owner = normaliseAddress(ownerAddress || getHeaderAddress(req));
  if (!owner) {
    return res.status(400).json({ error: 'ownerAddress is required' });
  }

  const boardId = randomUUID();
  const timestamp = nowIso();
  const board = {
    id: boardId,
    owner,
    title: title || 'Untitled Shareboard',
    description: description || '',
    metricIds: Array.isArray(metricIds) ? metricIds : [],
    includeHistoryWindow: includeHistoryWindow ?? null,
    snapshotStrategy: snapshotStrategy || 'live',
    access: {
      mode: accessMode || 'walletAllowlist',
      token: accessToken || null,
      allowedWallets: Array.isArray(allowedWallets)
        ? allowedWallets.map(normaliseAddress)
        : [],
      invitees: Array.isArray(invitees) ? invitees : [],
      createdAt: timestamp
    },
    snapshotEntries: Array.isArray(snapshotEntries) ? snapshotEntries : [],
    metadata: metadata || {},
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  };

  store.shareboards[boardId] = board;
  const ownerBoards = ensureShareboardsByOwner(owner);
  ownerBoards.push(boardId);
  persistStore(store);
  res.json({ success: true, shareboard: board });
});

app.get('/shareboards/:ownerAddress', (req, res) => {
  const owner = normaliseAddress(req.params.ownerAddress);
  const ids = store.shareboardsByOwner[owner] || [];
  const shareboards = ids
    .map((id) => store.shareboards[id])
    .filter(Boolean)
    .filter((board) => board.status !== 'revoked');
  res.json({ shareboards });
});

app.patch('/shareboards/:shareboardId', (req, res) => {
  const shareboardId = req.params.shareboardId;
  const board = store.shareboards[shareboardId];
  if (!board) {
    return res.status(404).json({ error: 'Shareboard not found' });
  }

  const actor = normaliseAddress(req.body?.ownerAddress || getHeaderAddress(req));
  if (!ensureOwnerOrViewer(res, board.owner, actor)) {
    return;
  }

  const {
    title,
    description,
    metricIds,
    includeHistoryWindow,
    snapshotStrategy,
    accessMode,
    accessToken,
    allowedWallets,
    invitees,
    snapshotEntries,
    metadata,
    status
  } = req.body || {};

  if (title !== undefined) board.title = title;
  if (description !== undefined) board.description = description;
  if (metricIds !== undefined) board.metricIds = Array.isArray(metricIds) ? metricIds : [];
  if (includeHistoryWindow !== undefined) board.includeHistoryWindow = includeHistoryWindow;
  if (snapshotStrategy !== undefined) board.snapshotStrategy = snapshotStrategy;
  if (accessMode !== undefined) board.access.mode = accessMode;
  if (accessToken !== undefined) board.access.token = accessToken;
  if (allowedWallets !== undefined) {
    board.access.allowedWallets = Array.isArray(allowedWallets)
      ? allowedWallets.map(normaliseAddress)
      : [];
  }
  if (invitees !== undefined) {
    board.access.invitees = Array.isArray(invitees) ? invitees : [];
  }
  if (snapshotEntries !== undefined) {
    board.snapshotEntries = Array.isArray(snapshotEntries) ? snapshotEntries : [];
  }
  if (metadata !== undefined) {
    board.metadata = metadata;
  }
  if (status !== undefined) {
    board.status = status;
  }
  board.updatedAt = nowIso();
  persistStore(store);
  res.json({ success: true, shareboard: board });
});

app.delete('/shareboards/:shareboardId', (req, res) => {
  const shareboardId = req.params.shareboardId;
  const board = store.shareboards[shareboardId];
  if (!board) {
    return res.status(404).json({ error: 'Shareboard not found' });
  }
  const actor = normaliseAddress(req.body?.ownerAddress || getHeaderAddress(req));
  if (!ensureOwnerOrViewer(res, board.owner, actor)) {
    return;
  }
  board.status = 'revoked';
  board.revokedAt = nowIso();
  board.updatedAt = board.revokedAt;
  persistStore(store);
  res.json({ success: true });
});

const validateShareboardAccess = (board, req) => {
  const mode = board.access?.mode || 'walletAllowlist';
  if (mode === 'publicLink') {
    return true;
  }
  if (mode === 'token') {
    const providedToken = req.query.token || req.headers['x-shareboard-token'];
    return providedToken && providedToken === board.access.token;
  }
  if (mode === 'walletAllowlist') {
    const viewer =
      normaliseAddress(req.query.viewer) || normaliseAddress(req.headers['x-wallet-address']);
    if (!viewer) return false;
    return (board.access.allowedWallets || []).includes(viewer);
  }
  return false;
};

app.get('/shareboards/view/:shareboardId', (req, res) => {
  const shareboardId = req.params.shareboardId;
  const board = store.shareboards[shareboardId];
  if (!board || board.status === 'revoked') {
    return res.status(404).json({ error: 'Shareboard unavailable' });
  }

  if (!validateShareboardAccess(board, req)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json({
    shareboard: {
      id: board.id,
      title: board.title,
      description: board.description,
      metricIds: board.metricIds,
      includeHistoryWindow: board.includeHistoryWindow,
      snapshotStrategy: board.snapshotStrategy,
      snapshotEntries: board.snapshotEntries,
      metadata: board.metadata,
      owner: board.owner,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
      status: board.status
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 KPI Vault backend running on http://localhost:${PORT}`);
  console.log('   → Metadata routes at /metrics/meta/:ownerAddress');
  console.log('   → Access routes at /metrics/access/*');
  if (REQUIRE_SIGNATURE) {
    console.log('🔐 Signature verification enabled (REQUIRE_SIGNATURE=true)');
  }
});

