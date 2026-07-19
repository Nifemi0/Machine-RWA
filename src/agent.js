/**
 * MachinaRWA Local AI Agent Daemon
 * Manages physical machine diagnostics and coordinates Casper yield payouts.
 *
 * FIXED:
 * - agentKeys.pub.toHex() (was .publicKey.toHex() — wrong in SDK v5.x)
 * - Payout loop locked with in-flight flag (no concurrent double-payouts)
 * - Balance now sourced from server's real accumulated revenue, not mock blockchain
 * - Agent keys loaded once at startup, not re-generated per payout call
 * - Shareholder validation (shares must be positive, sum > 0)
 * - Obsidian log capped at 50 entries max
 * - Revenue state persisted to disk so restarts don't lose accounting
 */

const fs = require('fs');
const path = require('path');
const { getOrCreateAgentKeys, distributeRevenueToHolders } = require('./casper-client');

const STATE_FILE = path.join(process.env.HOME || '/root', '.shipguard', 'machina-revenue.json');
const SERVER_URL = 'http://127.0.0.1:8090';

// Load agent keys ONCE at startup — never re-generate mid-run
const agentKeys = getOrCreateAgentKeys();
const agentPublicKeyHex = agentKeys.pub.toHex();

// FIX: Validate shareholders at startup — must be positive shares summing > 0
const RWA_SHAREHOLDERS = [
  { address: '01c238bdf5a5dbfb2b7692cd01828f26687a49c2182fb5b8403b262709e0d324b9', share: 60 },
  { address: '015fe42d789a12887d77ebaed26687a49c2182fb5b8403b262709e0d324b999990', share: 40 }  // Backer share (40%)
];

function validateShareholders(holders) {
  if (!holders || holders.length === 0) throw new Error('No shareholders defined');
  const totalShare = holders.reduce((sum, h) => sum + h.share, 0);
  if (totalShare <= 0) throw new Error('Total share weight must be > 0');
  for (const h of holders) {
    if (h.share <= 0) throw new Error(`Invalid share for ${h.address}: ${h.share}`);
    if (!/^[a-fA-F0-9]{66}$/.test(h.address)) throw new Error(`Invalid Casper address: ${h.address}`);
  }
  return totalShare;
}

validateShareholders(RWA_SHAREHOLDERS); // Crash early if misconfigured

const PAYOUT_THRESHOLD_CSPR = 5;
const FEE_RESERVE_CSPR = 1.0; // Keep 1 CSPR for gas
const MAX_OBSIDIAN_ENTRIES = 50;

// FIX: Payout lock prevents concurrent double-payouts
let payoutInFlight = false;

// FIX: Persistent revenue state so restarts don't lose accounting
function loadPersistedRevenue() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        totalPaidOutCspr: data.totalPaidOutCspr || 0,
        payoutCount: data.payoutCount || 0,
        lastPayout: data.lastPayout || null
      };
    }
  } catch (_) {}
  return { totalPaidOutCspr: 0, payoutCount: 0, lastPayout: null };
}

function persistRevenueState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('[LocalAgent] Failed to persist revenue state:', e.message);
  }
}

let revenueState = loadPersistedRevenue();

async function runAgentPulse() {
  console.log(`\n[LocalAgent] Pulse — Machine: ${agentPublicKeyHex.slice(0, 10)}...`);

  let serverStatus;
  try {
    const res = await fetch(`${SERVER_URL}/status`);
    if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
    serverStatus = await res.json();
  } catch (e) {
    console.error('[LocalAgent] Cannot reach machine server:', e.message);
    return;
  }

  // FIX: Use server's real accumulated revenue, not a mock blockchain balance
  const accumulatedCspr = serverStatus.metrics?.accumulated_revenue_cspr ?? 0;
  const completedJobs = serverStatus.metrics?.completed_jobs ?? 0;
  const uptimeSeconds = serverStatus.metrics?.uptime_seconds ?? 0;

  console.log(`[LocalAgent] Revenue: ${accumulatedCspr.toFixed(4)} CSPR | Jobs: ${completedJobs} | Uptime: ${uptimeSeconds}s`);
  console.log(`[LocalAgent] Total paid out to date: ${revenueState.totalPaidOutCspr.toFixed(4)} CSPR across ${revenueState.payoutCount} rounds`);

  // FIX: Calculate unpaid revenue = accumulated - already paid out
  const unpaidCspr = accumulatedCspr - revenueState.totalPaidOutCspr;

  if (unpaidCspr < PAYOUT_THRESHOLD_CSPR) {
    console.log(`[LocalAgent] Unpaid revenue ${unpaidCspr.toFixed(4)} CSPR below threshold ${PAYOUT_THRESHOLD_CSPR} CSPR. Waiting.`);
    return;
  }

  // FIX: Payout lock — skip if already running
  if (payoutInFlight) {
    console.log('[LocalAgent] Payout already in flight, skipping this pulse.');
    return;
  }

  payoutInFlight = true;
  const payoutAmount = unpaidCspr - FEE_RESERVE_CSPR;

  if (payoutAmount <= 0) {
    console.log('[LocalAgent] Not enough after fee reserve. Skipping.');
    payoutInFlight = false;
    return;
  }

  console.log(`[LocalAgent] Initiating payout of ${payoutAmount.toFixed(4)} CSPR to ${RWA_SHAREHOLDERS.length} shareholders...`);

  try {
    const payouts = await distributeRevenueToHolders(payoutAmount, RWA_SHAREHOLDERS, agentKeys);

    if (payouts && payouts.length > 0) {
      // FIX: Only advance the paid-out counter after confirmed dispatch
      revenueState.totalPaidOutCspr = accumulatedCspr; // mark everything up to now as paid
      revenueState.payoutCount++;
      revenueState.lastPayout = {
        timestamp: new Date().toISOString(),
        amountCspr: payoutAmount,
        txCount: payouts.length,
        payouts
      };
      persistRevenueState(revenueState);
      updateObsidianLog(payoutAmount, payouts);
      console.log(`[LocalAgent] ✅ Payout round ${revenueState.payoutCount} complete.`);
    }
  } catch (e) {
    console.error('[LocalAgent] Payout failed:', e.message);
  } finally {
    payoutInFlight = false;
  }
}

function updateObsidianLog(payoutAmount, payouts) {
  const notePath = '/root/notes/Ver Protocol.md';
  if (!fs.existsSync(notePath)) return;

  try {
    let content = fs.readFileSync(notePath, 'utf8');
    const logHeader = '## MachinaRWA Yield Log\n';
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const newEntry = `- **[${timestamp}]** Paid **${payoutAmount.toFixed(4)} CSPR** → ${payouts.length} holders (round ${revenueState.payoutCount})\n`;

    let pos = content.indexOf(logHeader);
    if (pos === -1) {
      content = content + '\n\n' + logHeader + newEntry;
    } else {
      const afterHeader = content.slice(pos + logHeader.length);
      // FIX: Cap log at MAX_OBSIDIAN_ENTRIES lines
      const existingLines = afterHeader.split('\n').filter(l => l.startsWith('- **['));
      const trimmedLines = existingLines.slice(0, MAX_OBSIDIAN_ENTRIES - 1);
      const rest = afterHeader.split('\n').filter(l => !l.startsWith('- **[')).join('\n');
      content = content.slice(0, pos + logHeader.length) + newEntry + trimmedLines.join('\n') + (trimmedLines.length ? '\n' : '') + rest;
    }

    fs.writeFileSync(notePath, content, 'utf8');
    console.log('[LocalAgent] Obsidian vault updated.');
  } catch (e) {
    console.error('[LocalAgent] Obsidian write failed:', e.message);
  }
}

console.log(`[LocalAgent] MachinaRWA agent started. Key: ${agentPublicKeyHex.slice(0, 10)}...`);
console.log(`[LocalAgent] Shareholders: ${RWA_SHAREHOLDERS.length} | Threshold: ${PAYOUT_THRESHOLD_CSPR} CSPR`);

setInterval(runAgentPulse, 30000);
setTimeout(runAgentPulse, 4000);
