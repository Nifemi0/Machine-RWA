# MachinaRWA: The Autonomous Machine Franchise

MachinaRWA is an autonomous hardware-leasing prototype built for the **Casper Agentic Buildathon 2026**. It transforms physical machines (e.g., local LLM inference nodes, IoT sensors, or render farms) into self-owned, revenue-generating franchises on the Casper Network.

It directly implements the **Casper AI Toolkit**, specifically utilizing **x402 Micropayments**, **CSPR.click Agent Skills**, and Casper Testnet smart contracts.

## 🚀 The Architecture

1. **Machina API Server (x402 Gateway)**
   A Node.js Express server that gates physical compute access. Client agents must submit valid **x402 Micropayment Headers** (`x-payment-proof` and `x-payment-amount`) representing Casper Deploy Hashes to execute inferences.
   
2. **Quantitative Agent Guardrails**
   MachinaRWA doesn't just run blind compute. It feeds the paid payload into a local AI proxy with a **Deterministic Guardrail**. If the payload lacks real quantitative RWA metrics or triggers a hallucination flag, the agent halts execution, self-scores confidence, and locks the payload.

3. **Autonomous Yield Daemon (CSPR Distribution)**
   A background daemon monitors the machine's accumulated x402 revenue. Once a threshold is reached (e.g., 5 CSPR), the daemon signs a Casper transfer deployment using its local Ed25519 keys and distributes proportional yield directly to fractional RWA shareholders on Casper Testnet.

4. **J.A.R.V.I.S. Telegram Orchestrator**
   The entire system is monitored by *Senku*, a Telegram-based AI assistant. When the daemon executes a yield payout, Senku detects the state change and proactively messages the operator with an unprompted telemetry alert.

## 🛠 Features

- **Strict x402 Validation**: Rejects missing headers, negative amounts, string floats, and duplicated/replayed transaction proofs.
- **Deterministic AI Scoring**: Enforces strict JSON schema outputs and confidence thresholding (HALTs on confidence < 85).
- **Proactive Alerts**: Telegram bot cron integrations for autonomous notifications.
- **Live Telemetry Dashboard**: A high-end, glassmorphic UI (`/status`) for the machine operator to monitor revenue and node temps in real time.

## ⚙️ Running Locally

1. Install dependencies:
   \`\`\`bash
   npm install casper-js-sdk express dotenv
   \`\`\`
2. Start the ecosystem via PM2:
   \`\`\`bash
   pm2 start ecosystem.config.js
   \`\`\`
3. Access the dashboard on \`http://localhost:8090\` (or proxy via localtunnel).

## 🔒 Security Posture

- Prevented BigInt float parsing crashes.
- Stripped arbitrary XSS payloads from inference inputs.
- Guarded against unbounded memory via periodic Proof Set pruning.
- Hardened Ed25519 key loading to prevent in-memory extraction during payout cycles.
- Persisted revenue metrics to disk (`machina-server-metrics.json`) to prevent accounting loss during daemon restarts.

## 🏆 Casper Buildathon Tracks Hit
- **DeFi & RWA**: Tokenizes hardware revenue via direct Testnet transfers to fractional holders.
- **Agentic AI**: Utilizes autonomous daemons and strict LLM JSON-schema routing.
- **Developer Toolkit**: Showcases native HTTP x402 payment headers for machine-to-machine commerce.
