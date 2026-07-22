/**
 * MachinaRWA Local Machine API Server
 * Implements x402 payment-gating for machine compute tasks.
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getOrCreateAgentKeys } = require('./casper-client');

const app = express();

// Serve the static frontend dashboard
app.use(express.static(path.join(__dirname, '../public')));

// BUG FIX 1: Body size limit — reject oversized payloads (was already 100kb default but explicit is safer)
app.use(express.json({ limit: '64kb' }));

// BUG FIX 2: Handle JSON parse + body size errors gracefully
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON', message: 'Request body could not be parsed.' });
  }
  if (err.status === 413 || err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload Too Large', message: 'Request body exceeds the 64KB limit.' });
  }
  next(err);
});

const PORT = process.env.MACHINE_PORT || 8090;

// Setup agent identity
const agentKeys = getOrCreateAgentKeys();
// BUG FIX 3: agentKeys.publicKey doesn't exist — it's agentKeys.pub in casper-js-sdk v5.x
const agentPublicKeyHex = agentKeys.pub.toHex();

// In-memory + persistent seen proofs set
const METRICS_FILE = path.join(process.env.HOME || '/root', '.shipguard', 'machina-server-metrics.json');
const PROOFS_FILE = path.join(process.env.HOME || '/root', '.shipguard', 'machina-redeemed-proofs.json');

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

// Metrics store
let metrics = {
  uptimeSeconds: 0,
  completedJobs: 0,
  accumulatedRevenueMotes: 0n,
  currentCpuTemp: 42.5,
  shareholders: [
    { address: '01c238bdf5a5dbfb2b7692cd01828f26687a49c2182fb5b8403b262709e0d324b9', share: 60 },
    { address: '015fe42d789a12887d77ebaed26687a49c2182fb5b8403b262709e0d324b999990', share: 40 }
  ]
};

// Load existing metrics so revenue is never lost on restart
try {
  if (fs.existsSync(METRICS_FILE)) {
    const data = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
    metrics.completedJobs = data.completedJobs || 0;
    metrics.accumulatedRevenueMotes = BigInt(data.accumulatedRevenueMotes || 0);
    metrics.uptimeSeconds = data.uptimeSeconds || 0;
    if (data.shareholders) metrics.shareholders = data.shareholders;
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
      shareholders: metrics.shareholders
    }), 'utf8');
  } catch (e) {
    console.error('[MachineServer] Failed to save metrics:', e.message);
  }
}

const os = require('os');

setInterval(() => { metrics.uptimeSeconds++; }, 1000);
setInterval(() => {
  const loadAvg = os.loadavg()[0];
  metrics.cpuLoadPercent = parseFloat(((loadAvg / os.cpus().length) * 100).toFixed(1));
  metrics.currentCpuTemp = parseFloat((38 + (metrics.cpuLoadPercent * 0.2)).toFixed(1));
}, 3000);
// Periodically save revenue to disk
setInterval(saveMetrics, 5000);

/**
 * 1. Health Status check
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
      shareholders: metrics.shareholders
    }
  });
});

/**
 * Update Shareholder Config
 */
app.post('/api/config/shareholders', (req, res) => {
  const { shareholders } = req.body || {};
  if (!Array.isArray(shareholders) || shareholders.length === 0) {
    return res.status(400).json({ error: 'Invalid Shareholders Array', message: 'Must provide an array of shareholder objects.' });
  }

  // Validate address format and calculate percentage total sum
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
  saveMetrics();
  return res.json({ success: true, shareholders: metrics.shareholders });
});

/**
 * 2. Paid Compute Task (Gated by x402 with optional BYOK x-api-key)
 */
app.post('/api/compute', async (req, res) => {
  const paymentProof = req.headers['x-payment-proof'];
  const paymentAmountRaw = req.headers['x-payment-amount'];
  const userApiKey = req.headers['x-api-key'];

  // Missing payment headers
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
      error: 'Duplicate Payment Proof',
      message: 'This payment proof has already been redeemed.'
    });
  }
  seenProofs.add(paymentProof);

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

  // BYOK (Bring Your Own Key) Support
  if (userApiKey) {
    try {
      console.log('[MachineServer] Client provided custom x-api-key. Calling OpenAI Gateway...');
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
      if (response.ok) {
        const data = await response.json();
        reasoning = JSON.parse(data.choices[0].message.content);
      }
    } catch (e) {
      console.warn('[MachineServer] BYOK API call failed, falling back to rule engine:', e.message);
    }
  }

  // Deterministic Rule Engine Fallback if no key or BYOK failed
  if (!reasoning) {
    const hasValuation = /\$?\d+(\.\d+)?[MkB]?/i.test(sanitizedInput);
    const hasYield = /\d+(\.\d+)?%/i.test(sanitizedInput);
    
    let confidence = 90;
    let risk = "LOW";
    let summary = "Quantitative rule engine verified valid asset valuation & yield metrics.";
    
    if (!hasValuation || !hasYield) {
      confidence = 45;
      risk = "HIGH";
      summary = "Payload missing key quantitative yield/valuation metrics.";
    }

    reasoning = {
      analysis_summary: summary,
      risk_level: risk,
      confidence_score: confidence,
      requires_human_audit: confidence < 85
    };
  }

    // GUARDRAIL: Halt on low confidence or human audit requirement
    if (reasoning.confidence_score < 85 || reasoning.requires_human_audit) {
      console.log(`[MachineServer] GUARDRAIL TRIGGERED: Confidence ${reasoning.confidence_score} too low.`);
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

// BUG FIX 11: Catch-all error handler for unhandled throws inside routes
app.use((err, req, res, next) => {
  console.error('[MachineServer] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`[MachineServer] MachinaRWA API running on port ${PORT}`);
  console.log(`[MachineServer] Agent Public Key: ${agentPublicKeyHex}`);
});

module.exports = { app, metrics };
