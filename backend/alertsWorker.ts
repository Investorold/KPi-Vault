import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import { ethers } from 'ethers';

type RawMetricEntry = {
  metricId: bigint | number | string;
  timestamp: bigint | number | string;
  value: string;
  note: string;
};

type AlertRuleRecord = {
  id: string;
  owner: string;
  metricId: string;
  name: string;
  ruleType: string;
  config: Record<string, unknown>;
  encryptedConfig?: unknown;
  commitment: string;
  channels: string[];
  status: string;
  createdAt?: string;
  updatedAt?: string;
  lastTriggeredAt?: string | null;
};

type TriggerPayload = {
  currentValue: number;
  previousValue?: number;
  threshold?: number;
  direction?: string;
  changePercentTarget?: number;
  changePercentActual?: number;
  metricIdHex: string;
  ruleId: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const {
  SEPOLIA_RPC_URL,
  RELAYER_URL,
  KPI_CONTRACT_ADDRESS,
  BACKEND_URL,
  ALERT_WORKER_PRIVATE_KEY,
  ALERT_WORKER_KEY
} = process.env;

const REQUIRED_VARS: Record<string, string | undefined> = {
  SEPOLIA_RPC_URL,
  RELAYER_URL,
  KPI_CONTRACT_ADDRESS,
  BACKEND_URL,
  ALERT_WORKER_PRIVATE_KEY,
  ALERT_WORKER_KEY
};

for (const [key, value] of Object.entries(REQUIRED_VARS)) {
  if (!value) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const VALUE_SCALE = 100;
const CHAIN_ID = 11155111;
const GATEWAY_CHAIN_ID = 10901;

const FHEVM_ADDRESSES = {
  // Official Zama FHEVM Sepolia addresses (updated Nov 2025)
  aclContractAddress: '0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D', // ACL_CONTRACT
  inputVerifierContractAddress: '0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0', // INPUT_VERIFIER_CONTRACT
  kmsContractAddress: '0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A', // KMS_VERIFIER_CONTRACT
  verifyingContractAddressDecryption: '0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478', // DECRYPTION_ADDRESS
  verifyingContractAddressInputVerification: '0x483b9dE06E4E4C7D35CCf5837A1668487406D955' // INPUT_VERIFICATION_ADDRESS
};

const KPI_MANAGER_ABI = [
  'event MetricRecorded(address indexed owner, uint256 indexed metricId, uint64 timestamp, uint256 entryIndex)',
  'function getMetrics(address owner, uint256 metricId) external view returns (tuple(uint256 metricId, uint64 timestamp, bytes32 value, bytes32 note)[])',
  'function logAlertTriggered(address owner, uint256 metricId, uint256 entryIndex, bytes32 ruleCommitment, uint64 timestamp) external'
];

const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL!);
const workerWallet = new ethers.Wallet(ALERT_WORKER_PRIVATE_KEY!, provider);
const contract = new ethers.Contract(KPI_CONTRACT_ADDRESS!, KPI_MANAGER_ABI, workerWallet);

type DecryptResult = {
  value: number;
  rawValue: bigint | number | string;
  note?: string;
};

// Feature flag: Node-side FHE decryption via browser SDK is currently disabled
// due to environment incompatibilities. The worker still listens for events and
// can be extended later once a Node-compatible FHEVM SDK is available.
const ENABLE_NODE_DECRYPT = false;

let fhevmInstance: any | null = null;

const inflightKeys = new Set<string>();
const processedKeys = new Set<string>();

const normalizeAddress = (address?: string | null) => {
  if (!address) return '';
  try {
    return ethers.getAddress(address).toLowerCase();
  } catch {
    return address.toLowerCase?.() ?? '';
  }
};

const encodeMetricId = (metricId: string) => {
  if (!metricId) return '';
  const encoded = ethers.id(metricId);
  return encoded.toLowerCase();
};

const metricIdToHex = (value: bigint | number | string) => {
  if (typeof value === 'bigint') return ethers.toBeHex(value);
  if (typeof value === 'number') return ethers.toBeHex(BigInt(value));
  return ethers.toBeHex(value);
};

const normalizeHandle = (handle: any) => {
  if (!handle) return null;
  const value = typeof handle === 'string' ? handle : handle.toString();
  if (!value || value === ethers.ZeroHash || value === '0x') {
    return null;
  }
  return value;
};

const ensureNodeGlobals = async () => {
  const globalAny = globalThis as any;
  if (!globalAny.window) {
    globalAny.window = globalAny;
  }
  if (!globalAny.self) {
    globalAny.self = globalAny.window;
  }
  // Basic event / messaging shims so the browser-oriented SDK doesn't crash in Node
  if (typeof globalAny.addEventListener !== 'function') {
    globalAny.addEventListener = () => {};
  }
  if (typeof globalAny.removeEventListener !== 'function') {
    globalAny.removeEventListener = () => {};
  }
  if (typeof globalAny.postMessage !== 'function') {
    globalAny.postMessage = () => {};
  }
  if (typeof globalAny.window.addEventListener !== 'function') {
    globalAny.window.addEventListener = globalAny.addEventListener;
  }
  if (typeof globalAny.window.removeEventListener !== 'function') {
    globalAny.window.removeEventListener = globalAny.removeEventListener;
  }
  if (typeof globalAny.window.postMessage !== 'function') {
    globalAny.window.postMessage = globalAny.postMessage;
  }

  // Override fetch so the SDK can load local WASM files (file:// URLs) under Node
  const origFetch = globalAny.fetch;
  const ensureNodeFetch = async () => {
    if (origFetch) {
      return origFetch;
    }
    const { default: nodeFetch } = await import('node-fetch');
    return nodeFetch;
  };

  globalAny.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    if (url.startsWith('file://')) {
      const { readFile } = await import('fs/promises');
      const data = await readFile(new URL(url));
      // Minimal Response-like object with arrayBuffer()/blob() for WASM loader
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        blob: async () => {
          const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          return new Blob([buffer]);
        }
      } as any;
    }
    const fn = await ensureNodeFetch();
    return fn(input, init);
  };

  // Minimal Worker shim using Node's worker_threads so browser SDK can spawn workers
  if (!globalAny.Worker) {
    const { Worker: NodeWorker } = await import('node:worker_threads');

    class BrowserLikeWorker {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      private worker: any;
      // The SDK may pass a string URL or URL-like object; normalise to filesystem path
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(spec: any, _options?: any) {
        let filename: string;
        if (typeof spec === 'string') {
          filename = spec.startsWith('file://') ? new URL(spec).pathname : spec;
        } else if (spec && typeof spec === 'object') {
          const href = (spec as any).href ?? spec.toString?.();
          if (href && typeof href === 'string') {
            filename = href.startsWith('file://') ? new URL(href).pathname : href;
          } else {
            throw new Error('Unsupported Worker script spec');
          }
        } else {
          throw new Error('Unsupported Worker script spec');
        }

        this.worker = new NodeWorker(filename, { stdout: false, stderr: false });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      postMessage(message: any) {
        this.worker.postMessage(message);
      }

      terminate() {
        void this.worker.terminate();
      }

      // Browser-style event listeners
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addEventListener(event: string, handler: any) {
        if (event === 'message') {
          this.worker.on('message', (data: unknown) => handler({ data }));
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      removeEventListener(event: string, handler: any) {
        if (event === 'message') {
          this.worker.off('message', handler);
        }
      }
    }

    globalAny.Worker = BrowserLikeWorker;
    globalAny.window.Worker = BrowserLikeWorker;
  }

  // Patch WebAssembly.instantiate so it also accepts objects with arrayBuffer()
  if (typeof WebAssembly !== 'undefined' && typeof WebAssembly.instantiate === 'function') {
    const origInstantiate = WebAssembly.instantiate;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (WebAssembly as any).instantiate = async (moduleOrResponse: any, importObject?: any) => {
      const candidate = moduleOrResponse as any;
      if (
        candidate &&
        typeof candidate === 'object' &&
        typeof candidate.arrayBuffer === 'function'
      ) {
        const buffer = await candidate.arrayBuffer();
        return origInstantiate(buffer, importObject);
      }
      return origInstantiate(moduleOrResponse as any, importObject);
    };
  }

  if (!globalAny.navigator) {
    globalAny.navigator = { hardwareConcurrency: 4 };
  }
  if (!globalAny.location) {
    globalAny.location = { origin: 'http://localhost:3000' };
  }
  if (!globalAny.crypto) {
    const { webcrypto } = await import('node:crypto');
    globalAny.crypto = webcrypto;
  }
  if (!globalAny.window.crypto) {
    globalAny.window.crypto = globalAny.crypto;
  }
  if (!globalAny.fetch) {
    const { default: nodeFetch } = await import('node-fetch');
    globalAny.fetch = nodeFetch;
  }
};

const loadFhevmInstance = async () => {
  if (fhevmInstance || !ENABLE_NODE_DECRYPT) {
    return fhevmInstance;
  }

  await ensureNodeGlobals();

  const sdkPath = path.resolve(__dirname, '../frontend/public/relayer-sdk/relayer-sdk-js.js');
  const sdkModuleUrl = pathToFileURL(sdkPath).href;

  const sdkModule = await import(sdkModuleUrl);
  const { initSDK, createInstance } = sdkModule;

  if (!initSDK || !createInstance) {
    throw new Error('Failed to load FHEVM SDK exports (initSDK/createInstance)');
  }

  await initSDK();

  const eip1193Provider = {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      return provider.send(method, params ?? []);
    }
  };

  fhevmInstance = await createInstance({
    chainId: CHAIN_ID,
    gatewayChainId: GATEWAY_CHAIN_ID,
    relayerUrl: RELAYER_URL,
    network: eip1193Provider,
    aclContractAddress: FHEVM_ADDRESSES.aclContractAddress,
    inputVerifierContractAddress: FHEVM_ADDRESSES.inputVerifierContractAddress,
    kmsContractAddress: FHEVM_ADDRESSES.kmsContractAddress,
    verifyingContractAddressDecryption: FHEVM_ADDRESSES.verifyingContractAddressDecryption,
    verifyingContractAddressInputVerification: FHEVM_ADDRESSES.verifyingContractAddressInputVerification,
    timeout: 60000,
    retries: 5,
    enableLogging: false
  });

  console.log('FHEVM SDK initialised for alerts worker');
  return fhevmInstance;
};

const unscaleValue = (raw: any): number => {
  if (raw === undefined || raw === null) {
    throw new Error('Decrypt result missing KPI value');
  }

  let numeric: number;
  if (typeof raw === 'bigint') {
    numeric = Number(raw);
  } else if (typeof raw === 'number') {
    numeric = raw;
  } else if (typeof raw === 'string') {
    numeric = Number(raw);
  } else {
    numeric = Number(raw);
  }

  if (Number.isNaN(numeric)) {
    throw new Error(`Failed to parse decrypted KPI value (${raw})`);
  }
  return numeric / VALUE_SCALE;
};

const decryptEntry = async (
  ownerAddress: string,
  metricIdHex: string,
  entryIndex: number,
  entries: RawMetricEntry[]
): Promise<DecryptResult> => {
  if (!ENABLE_NODE_DECRYPT) {
    throw new Error('Node-side decryption disabled (ENABLE_NODE_DECRYPT=false)');
  }

  const entry = entries[entryIndex];
  if (!entry) {
    throw new Error(`Metric entry ${entryIndex} not found for owner ${ownerAddress}`);
  }

  const valueHandle = normalizeHandle(entry.value);
  const noteHandle = normalizeHandle(entry.note);

  if (!valueHandle) {
    throw new Error('Encrypted value handle missing');
  }

  const fheInstance = await loadFhevmInstance();
  const keypair = fheInstance.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000).toString();
  const durationDays = '10';
  const eip712 = fheInstance.createEIP712(
    keypair.publicKey,
    [KPI_CONTRACT_ADDRESS],
    startTimestamp,
    durationDays
  );

  const signature = await workerWallet.signTypedData(
    eip712.domain,
    { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
    eip712.message
  );

  const pairs = [{ handle: valueHandle, contractAddress: KPI_CONTRACT_ADDRESS }];
  if (noteHandle) {
    pairs.push({ handle: noteHandle, contractAddress: KPI_CONTRACT_ADDRESS });
  }

  const decryptResult = await fheInstance.userDecrypt(
    pairs,
    keypair.privateKey,
    keypair.publicKey,
    signature.replace('0x', ''),
    [KPI_CONTRACT_ADDRESS],
    workerWallet.address,
    startTimestamp,
    durationDays
  );

  const value = unscaleValue(decryptResult[valueHandle]);
  let note: string | undefined;
  if (noteHandle && decryptResult[noteHandle] !== undefined) {
    note = String(decryptResult[noteHandle]);
  }

  return {
    value,
    rawValue: decryptResult[valueHandle],
    note
  };
};

const fetchAlertRules = async (owner: string): Promise<AlertRuleRecord[]> => {
  const response = await fetch(`${BACKEND_URL}/alerts/${owner}`);
  if (!response.ok) {
    throw new Error(`Failed to load alert rules (${response.status})`);
  }
  const body = await response.json();
  return Array.isArray(body.alerts) ? body.alerts : [];
};

const postTriggerToBackend = async (
  rule: AlertRuleRecord,
  metricIdHex: string,
  entryIndex: number,
  payload: TriggerPayload
) => {
  const response = await fetch(`${BACKEND_URL}/alerts/${rule.id}/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-alert-worker-key': ALERT_WORKER_KEY || '',
      'x-wallet-address': workerWallet.address
    },
    body: JSON.stringify({
      ownerAddress: rule.owner,
      metricId: rule.metricId,
      entryIndex,
      payload
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Backend trigger request failed (${response.status}): ${text}`);
  }
};

const logAlertOnChain = async (
  owner: string,
  metricId: bigint,
  entryIndex: number,
  commitment: string
) => {
  try {
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    const tx = await contract.logAlertTriggered(owner, metricId, entryIndex, commitment, timestamp);
    await tx.wait(1);
    console.log(`📡 Logged AlertTriggered on-chain (tx: ${tx.hash})`);
  } catch (err: any) {
    if (err?.message?.includes('KpiManager: not authorized to log')) {
      console.warn('Worker is not authorized to call logAlertTriggered yet (set alertBot). Skipping on-chain log.');
      return;
    }
    console.error('Failed to log alert on-chain:', err);
  }
};

const evaluateRule = (
  rule: AlertRuleRecord,
  currentValue: number,
  previousValue?: number
) => {
  const config = rule.config || {};
  const directionRaw = typeof config.direction === 'string' ? config.direction : 'above';
  const direction = directionRaw.toLowerCase();
  const threshold = Number(config.threshold);
  const changePercentTarget =
    config.changePercent !== undefined ? Number(config.changePercent) : undefined;

  if (Number.isFinite(changePercentTarget) && previousValue !== undefined) {
    if (previousValue === 0) {
      return { triggered: false };
    }
    const deltaPercent = ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
    if (Math.abs(deltaPercent) >= Math.abs(changePercentTarget!)) {
      return {
        triggered: true,
        payload: {
          changePercentActual: deltaPercent,
          changePercentTarget,
          previousValue
        }
      };
    }
    return { triggered: false };
  }

  if (!Number.isFinite(threshold)) {
    return { triggered: false };
  }

  if (direction === 'below') {
    return currentValue < threshold
      ? { triggered: true, payload: { threshold, direction } }
      : { triggered: false };
  }

  if (direction === 'equals') {
    return currentValue === threshold
      ? { triggered: true, payload: { threshold, direction } }
      : { triggered: false };
  }

  // default: above
  return currentValue > threshold
    ? { triggered: true, payload: { threshold, direction } }
    : { triggered: false };
};

const handleMetricRecorded = async (
  owner: string,
  metricId: bigint,
  entryIndexRaw: bigint | number
) => {
  const ownerNormalized = normalizeAddress(owner);
  const metricIdHex = metricIdToHex(metricId).toLowerCase();
  const entryIndex = Number(entryIndexRaw);
  const cacheKeyBase = `${ownerNormalized}:${metricIdHex}:${entryIndex}`;

  console.log(
    `📥 MetricRecorded owner=${ownerNormalized} metric=${metricIdHex} entryIndex=${entryIndex}`
  );

  let rules: AlertRuleRecord[] = [];

  try {
    rules = await fetchAlertRules(ownerNormalized);
  } catch (error) {
    console.error('Failed to load alert rules:', error);
    return;
  }

  if (!rules.length) {
    console.log('ℹ️ No alert rules found for owner, skipping.');
    return;
  }

  const matchingRules = rules.filter((rule) => {
    if (rule.status !== 'active') return false;
    const encodedRuleMetric = encodeMetricId(rule.metricId);
    return encodedRuleMetric === metricIdHex;
  });

  if (!matchingRules.length) {
    console.log('ℹ️ No matching alert rules for this metric.');
    return;
  }

  if (!ENABLE_NODE_DECRYPT) {
    console.log(
      'ℹ️ Node-side FHE decryption is currently disabled; worker is running in "listener only" mode.'
    );
    console.log(
      '   The frontend (owner wallet) performs decryption, and this worker can be extended later once a Node SDK is available.'
    );
    return;
  }

  let entries: RawMetricEntry[];
  try {
    entries = await contract.getMetrics(owner, metricId);
  } catch (error) {
    console.error('Failed to fetch metric entries from contract:', error);
    return;
  }

  let currentDecrypt: DecryptResult | null = null;

  for (const rule of matchingRules) {
    const processKey = `${cacheKeyBase}:${rule.id}`;
    if (processedKeys.has(processKey) || inflightKeys.has(processKey)) {
      continue;
    }

    inflightKeys.add(processKey);

    try {
      if (!currentDecrypt) {
        currentDecrypt = await decryptEntry(owner, metricIdHex, entryIndex, entries);
      }

      const needsPrevious = rule.config?.changePercent !== undefined;
      let previousValue: number | undefined;

      if (needsPrevious && entryIndex > 0) {
        try {
          const previousDecrypt = await decryptEntry(owner, metricIdHex, entryIndex - 1, entries);
          previousValue = previousDecrypt.value;
        } catch (prevErr) {
          console.warn('Failed to decrypt previous entry for changePercent rule:', prevErr);
        }
      }

      const evaluation = evaluateRule(rule, currentDecrypt.value, previousValue);
      if (!evaluation.triggered) {
        continue;
      }

      const payload: TriggerPayload = {
        currentValue: currentDecrypt.value,
        previousValue,
        threshold:
          typeof rule.config?.threshold === 'number'
            ? (rule.config.threshold as number)
            : Number(rule.config?.threshold),
        direction:
          typeof rule.config?.direction === 'string'
            ? (rule.config.direction as string)
            : 'above',
        changePercentTarget:
          rule.config?.changePercent !== undefined ? Number(rule.config.changePercent) : undefined,
        changePercentActual: evaluation.payload?.changePercentActual,
        metricIdHex,
        ruleId: rule.id
      };

      try {
        await logAlertOnChain(owner, metricId, entryIndex, rule.commitment);
      } catch (chainErr) {
        console.error('logAlertTriggered failed:', chainErr);
      }

      await postTriggerToBackend(rule, metricIdHex, entryIndex, payload);
      processedKeys.add(processKey);
      console.log(
        `🚨 Alert triggered for rule ${rule.name} | metric ${rule.metricId} | entry ${entryIndex}`
      );
    } catch (error) {
      console.error(`Failed to process alert rule ${rule.id}:`, error);
    } finally {
      inflightKeys.delete(processKey);
    }
  }
};

const startWorker = async () => {
  console.log('🔔 Alert worker starting...');
  console.log(`   Contract: ${KPI_CONTRACT_ADDRESS}`);
  console.log(`   Worker address: ${workerWallet.address}`);
  console.log(`   Backend: ${BACKEND_URL}`);
  console.log(
    `   Node-side decryption: ${
      ENABLE_NODE_DECRYPT ? 'enabled' : 'disabled (frontend handles decrypt)'
    }`
  );

  // Periodic heartbeat so you can see the worker is still alive while it waits for events
  const HEARTBEAT_MS = 30000;
  const heartbeat = setInterval(() => {
    console.log('⏱️ Alert worker heartbeat: still listening for MetricRecorded events...');
  }, HEARTBEAT_MS);

  // Ensure heartbeat is cleared on shutdown
  const stopHeartbeat = () => clearInterval(heartbeat);
  process.once('SIGINT', stopHeartbeat);
  process.once('SIGTERM', stopHeartbeat);

  contract.on(
    'MetricRecorded',
    async (owner: string, metricId: bigint, _timestamp: bigint, entryIndex: bigint) => {
      try {
        await handleMetricRecorded(owner, metricId, entryIndex);
      } catch (error) {
        console.error('Error handling MetricRecorded event:', error);
      }
    }
  );

  console.log('👀 Listening for MetricRecorded events...');
};

startWorker().catch((error) => {
  console.error('Alert worker failed to start:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('🛑 Alert worker shutting down (SIGINT).');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Alert worker shutting down (SIGTERM).');
  process.exit(0);
});

