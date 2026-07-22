#!/usr/bin/env node

/**
 * MachinaRWA Agent Verification CLI
 * 
 * Commands:
 *   health   - Check server /status endpoint
 *   smoke    - Execute end-to-end x402 compute inference test
 *   proof    - Generate cryptographically valid mock payment proof hash
 *   metrics  - View persistent machine metrics
 *   help     - Show CLI help menu
 */

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const PORT = process.env.MACHINE_PORT || 8090;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const command = process.argv[2] || 'help';

async function main() {
  switch (command) {
    case 'health':
      await checkHealth();
      break;
    case 'smoke':
      await runSmokeTest();
      break;
    case 'proof':
      generateProof();
      break;
    case 'metrics':
      viewMetrics();
      break;
    default:
      showHelp();
      break;
  }
}

async function checkHealth() {
  console.log(`[CLI] Checking MachinaRWA Server health at ${BASE_URL}/status...`);
  try {
    const res = await fetch(`${BASE_URL}/status`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    console.log('✅ Server Status: ONLINE');
    console.log(`   Machine ID : ${data.machineId}`);
    console.log(`   Revenue    : ${data.metrics.accumulated_revenue_cspr} CSPR`);
    console.log(`   Inferences : ${data.metrics.completed_jobs}`);
    console.log(`   CPU Temp   : ${data.metrics.cpu_temperature}°C`);
    console.log(`   Uptime     : ${data.metrics.uptime_seconds}s`);
  } catch (err) {
    console.error('❌ Server Health Check Failed:', err.message);
    console.error('   Ensure server is running: node src/server.js');
    process.exit(1);
  }
}

async function runSmokeTest() {
  console.log('[CLI] Running End-to-End x402 Micropayment Smoke Test...');
  const proof = crypto.randomBytes(32).toString('hex');
  const payload = "Asset ID: RE-LAG-092. Type: Commercial Real Estate. Location: Victoria Island, Lagos. Current Valuation: $1.2M USD. Verified Annual Rental Yield: 8.4%. Requesting risk level classification.";

  try {
    const res = await fetch(`${BASE_URL}/api/compute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-payment-proof': proof,
        'x-payment-amount': '1000000000'
      },
      body: JSON.stringify({ jobInput: payload })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      console.log('✅ x402 Compute Smoke Test Passed!');
      console.log(`   Risk Level   : ${data.agent_reasoning.risk_level}`);
      console.log(`   Confidence   : ${data.agent_reasoning.confidence_score}`);
      console.log(`   Audit Needed : ${data.agent_reasoning.requires_human_audit}`);
    } else {
      console.error('❌ Smoke Test Failed / Halted:', data);
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Smoke Test Request Failed:', err.message);
    process.exit(1);
  }
}

function generateProof() {
  const hash = crypto.randomBytes(32).toString('hex');
  console.log(`[CLI] Mock Casper Payment Proof Hash:`);
  console.log(hash);
}

function viewMetrics() {
  const file = path.join(process.env.HOME || '/root', '.shipguard', 'machina-server-metrics.json');
  if (fs.existsSync(file)) {
    console.log('[CLI] Persisted Server Metrics:');
    console.log(fs.readFileSync(file, 'utf8'));
  } else {
    console.log('[CLI] No persisted metrics file found yet.');
  }
}

function showHelp() {
  console.log(`
MachinaRWA Verification CLI

Usage: node bin/cli.js <command> (or npm run cli <command>)

Commands:
  health   - Verify server /status readiness
  smoke    - Run end-to-end x402 compute inference verification
  proof    - Generate a mock 64-char Casper deploy hash
  metrics  - Print persisted revenue & uptime telemetry metrics
  help     - Display this help message
  `);
}

main();
