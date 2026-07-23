const express = require('express');
const path = require('path');
const fs = require('fs');
const { getOrCreateAgentKeys, verifyCasperDeployOnChain } = require('./casper-client');

const app = express();

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json({ limit: '64kb' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON', message: 'Request body could not be parsed.' });
  }
  if (err.status === 413 || err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload Too Large', message: 'Request body exceeds the 64KB limit.' });
  }
  next(err);
});

const PORT = process.env.MACHINE_PORT || process.env.PORT || 8090;

const agentKeys = getOrCreateAgentKeys();
const agentPublicKeyHex = agentKeys.pub.toHex();

const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(process.env.HOME || '/root', '.shipguard');
const METRICS_FILE = path.join(DATA_DIR, 'machina-server-metrics.json');
const PROOFS_FILE = path.join(DATA_DIR, 'machina-redeemed-proofs.json');

const seenProofs = new Set();
try {
  if (fs.existsSync(PROOFS_FILE)) {
    const list = JSON.parse(fs.readFileSync(PROOFS_FILE, 'utf8'));
    list.forEach(p => seenProofs.add(p));
  }
} catch (_) {}

function saveRedeemedProofs() {
  try {
    const dir = path.dirname(PROOFS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PROOFS_FILE, JSON.stringify(Array.from(seenProofs).slice(-1000)), 'utf8');
  } catch (e) {
    console.error('[MachineServer] Failed to save redeemed proofs:', e.message);
  }
}

// In-memory node metrics & registry
let metrics = {
  uptimeSeconds: 0,
  completedJobs: 0,
  accumulatedRevenueMotes: 0n,
  currentCpuTemp: 42.5,
  shareholders: [
    { address: '01c238bdf5a5dbfb2b7692cd01828f26687a49c2182fb5b8403b262709e0d324b9', share: 60 },
    { address: '015fe42d789a12887d77ebaed26687a49c2182fb5b8403b262709e0d324b999990', share: 40 }
  ],
  listedNodes: [
    {
      id: 'node-01',
      title: 'Machine-Node-Alpha (CPU Quantitative Inference)',
      type: 'CPU Quantitative Inference Node',
      feeMotes: '1000000000',
      status: 'ACTIVE',
      specs: '16 vCPU • 64GB RAM • Ed25519 Verified',
      shareholders: [
        { address: '01c238bdf5a5dbfb2b7692cd01828f26687a49c2182fb5b8403b262709e0d324b9', share: 60 },
        { address: '015fe42d789a12887d77ebaed26687a49c2182fb5b8403b262709e0d324b999990', share: 40 }
      ]
    },
    {
      id: 'node-02',
      title: 'Solar Telemetry Oracle #04 (Sahara West)',
      type: 'IoT Solar & Sensor Telemetry Oracle',
      feeMotes: '1500000000',
      status: 'ACTIVE',
      specs: '4.2 MW/h Sensor Array • Low Latency IoT Gateway',
      shareholders: [
        { address: '01c238bdf5a5dbfb2b7692cd01828f26687a49c2182fb5b8403b262709e0d324b9', share: 100 }
      ]
    }
  ]
};

try {
  if (fs.existsSync(METRICS_FILE)) {
    const data = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
    metrics.completedJobs = data.completedJobs || 0;
    metrics.accumulatedRevenueMotes = BigInt(data.accumulatedRevenueMotes || 0);
    metrics.uptimeSeconds = data.uptimeSeconds || 0;
    if (data.shareholders) metrics.shareholders = data.shareholders;
    if (data.listedNodes) metrics.listedNodes = data.listedNodes;
  }
} catch (e) {
  console.error('[MachineServer] Could not load persisted metrics, starting fresh.', e.message);
}

function saveMetrics() {
  try {
    const dir = path.dirname(METRICS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(METRICS_FILE, JSON.stringify({
      uptimeSeconds: metrics.uptimeSeconds,
      completedJobs: metrics.completedJobs,
      accumulatedRevenueMotes: metrics.accumulatedRevenueMotes.toString(),
      currentCpuTemp: metrics.currentCpuTemp,
      shareholders: metrics.shareholders,
      listedNodes: metrics.listedNodes
    }), 'utf8');
  } catch (e) {
    console.error('[MachineServer] Failed to save metrics:', e.message);
  }
}

const os = require('os');

setInterval(() => { metrics.uptimeSeconds++; }, 1000);
setInterval(() => {
  const loadAvg = os.loadavg()[0];
  metrics.cpuLoadPercent = parseFloat(((loadAvg / Math.max(1, os.cpus().length)) * 100).toFixed(1));
  metrics.currentCpuTemp = parseFloat((38 + (metrics.cpuLoadPercent * 0.2)).toFixed(1));
}, 3000);
setInterval(saveMetrics, 5000);

// Keep-Alive Self-Ping (Prevents Render from spinning down due to inactivity)
setInterval(() => {
  const pingUrl = process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
  fetch(`${pingUrl}/status`)
    .then(res => {
      if(res.ok) console.log(`[MachineServer] Keep-alive ping successful.`);
    })
    .catch(err => console.log(`[MachineServer] Keep-alive ping failed:`, err.message));
}, 10 * 60 * 1000); // Ping every 10 minutes

/**
 * 1. Health & Status Check Endpoint
 */
app.get('/status', (req, res) => {
  res.json({
    status: 'ONLINE',
    machineId: agentPublicKeyHex,
    metrics: {
      uptime_seconds: metrics.uptimeSeconds,
      completed_jobs: metrics.completedJobs,
      accumulated_revenue_cspr: Number(metrics.accumulatedRevenueMotes / 1000000n) / 1000,
      cpu_temperature: metrics.currentCpuTemp,
      cpu_load_percent: metrics.cpuLoadPercent || 15.0,
      redeemed_proofs_count: seenProofs.size,
      shareholders: metrics.shareholders,
      listedNodes: metrics.listedNodes
    }
  });
});

/**
 * 2. Get Registered DePIN Hardware Nodes
 */
app.get('/api/nodes', (req, res) => {
  res.json({ success: true, nodes: metrics.listedNodes });
});

/**
 * 3. Register / Update Hardware Resource Node
 */
app.post('/api/config/shareholders', (req, res) => {
  const { title, type, feeMotes, shareholders } = req.body || {};
  if (!Array.isArray(shareholders) || shareholders.length === 0) {
    return res.status(400).json({ error: 'Invalid Shareholders Array', message: 'Must provide an array of shareholder objects.' });
  }

  let totalShare = 0;
  for (const s of shareholders) {
    if (!s.address || typeof s.address !== 'string' || !/^[a-fA-F0-9]{66}$/.test(s.address.trim())) {
      return res.status(400).json({
        error: 'Invalid Shareholder Address',
        message: `Address "${s.address}" must be a 66-character hex Casper public key (starting with 01 or 02).`
      });
    }
    const shareNum = Number(s.share);
    if (isNaN(shareNum) || shareNum <= 0 || shareNum > 100) {
      return res.status(400).json({ error: 'Invalid Share Weight', message: 'Each share weight must be between 1 and 100.' });
    }
    totalShare += shareNum;
  }

  if (totalShare !== 100) {
    return res.status(400).json({
      error: 'Share Weight Sum Error',
      message: `Total share percentage sum must equal exactly 100%. Received sum of ${totalShare}%.`
    });
  }

  metrics.shareholders = shareholders;

  if (title) {
    const newNode = {
      id: `node-${Date.now().toString(36)}`,
      title: title.trim(),
      type: type || 'CPU Quantitative Inference Node',
      feeMotes: feeMotes || '1000000000',
      status: 'ACTIVE',
      specs: 'Dynamic Node Instance • Verified Shareholder Pool',
      shareholders: shareholders
    };
    metrics.listedNodes.unshift(newNode);
  }

  saveMetrics();
  return res.json({ success: true, shareholders: metrics.shareholders, listedNodes: metrics.listedNodes });
});

/**
 * 4. Paid Compute Task (x402 Micropayment Gated)
 */
app.post('/api/compute', async (req, res) => {
  const paymentProof = req.headers['x-payment-proof'];
  const paymentAmountRaw = req.headers['x-payment-amount'];
  const userApiKey = req.headers['x-api-key'];

  if (!paymentProof || !paymentAmountRaw) {
    res.setHeader('WWW-Authenticate', 'x402');
    return res.status(402).json({
      error: 'Payment Required',
      message: 'x402 payment headers missing. Include x-payment-proof and x-payment-amount.',
      payment_destination: agentPublicKeyHex,
      required_amount_motes: 1000000000
    });
  }

  if (!/^\d+$/.test(paymentAmountRaw)) {
    return res.status(400).json({
      error: 'Invalid Payment Amount',
      message: 'x-payment-amount must be a positive integer (motes).'
    });
  }

  let amountMotes;
  try {
    amountMotes = BigInt(paymentAmountRaw);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid Payment Amount', message: 'Could not parse mote value.' });
  }

  if (amountMotes < 1000000000n) {
    return res.status(400).json({
      error: 'Insufficient Payment',
      message: `Minimum required fee is 1,000,000,000 motes (1 CSPR). Received ${paymentAmountRaw}.`
    });
  }

  if (!/^[a-fA-F0-9]{64}$/.test(paymentProof)) {
    return res.status(401).json({
      error: 'Invalid Payment Proof',
      message: 'x-payment-proof must be a 64-character hex string (Casper deploy hash).'
    });
  }

  if (seenProofs.has(paymentProof)) {
    return res.status(409).json({
      error: 'Duplicate Payment Proof (Replay Attack Prevented)',
      message: 'This payment proof deploy hash has already been redeemed.'
    });
  }

  // Verify deploy status on Casper Testnet RPC node
  const rpcCheck = await verifyCasperDeployOnChain(paymentProof, amountMotes, agentPublicKeyHex);
  if (!rpcCheck.verified) {
    return res.status(402).json({
      error: 'On-Chain Payment Verification Failed',
      message: rpcCheck.reason
    });
  }

  seenProofs.add(paymentProof);
  saveRedeemedProofs();

  const { jobInput } = req.body || {};
  if (!jobInput || typeof jobInput !== 'string' || jobInput.trim().length === 0) {
    seenProofs.delete(paymentProof);
    return res.status(400).json({
      error: 'Missing Job Input',
      message: 'Request body must include a non-empty "jobInput" string field.'
    });
  }

  const sanitizedInput = jobInput.replace(/<[^>]*>/g, '').slice(0, 1000);

  metrics.completedJobs++;
  metrics.accumulatedRevenueMotes += amountMotes;
  saveMetrics();

  console.log(`[MachineServer] Paid job accepted: "${sanitizedInput.slice(0, 60)}" | proof: ${paymentProof.slice(0, 8)}... | ${amountMotes} motes`);

  let reasoning;

  // BYOK Support
  if (!userApiKey) {
    seenProofs.delete(paymentProof);
    return res.status(401).json({
      error: 'Missing API Key',
      message: 'x-api-key header is required for production inference.'
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Output ONLY JSON: { "analysis_summary": string, "risk_level": "LOW"|"MEDIUM"|"HIGH", "confidence_score": number, "requires_human_audit": boolean }' },
          { role: 'user', content: sanitizedInput }
        ],
        response_format: { type: "json_object" }
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    reasoning = JSON.parse(data.choices[0].message.content);
  } catch (e) {
    console.error('[MachineServer] BYOK API call failed:', e.message);
    return res.status(502).json({
      error: 'AI Inference Failed',
      message: 'Failed to generate quantitative analysis from AI provider.'
    });
  }

  if (reasoning.confidence_score < 85 || reasoning.requires_human_audit) {
    return res.status(200).json({
      success: false,
      status: 'HALTED',
      reason: 'Agent confidence below safety threshold or human audit required.',
      payment_verified: { proof: paymentProof, amount_motes: paymentAmountRaw },
      agent_reasoning: reasoning
    });
  }

  return res.json({
    success: true,
    status: 'COMPLETED',
    payment_verified: { proof: paymentProof, amount_motes: paymentAmountRaw },
    agent_reasoning: reasoning
  });
});

app.use((err, req, res, next) => {
  console.error('[MachineServer] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`[MachineServer] MachinaRWA API running on port ${PORT}`);
    console.log(`[MachineServer] Agent Public Key: ${agentPublicKeyHex}`);
  });
  module.exports = { app, metrics };
}
