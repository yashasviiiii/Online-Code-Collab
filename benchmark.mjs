/**
 * CodeConnect – Performance Benchmark Suite
 * ==========================================
 * Measures real server performance metrics across 4 benchmarks.
 *
 * Prerequisites:
 *   Start the server first:  cd server && npm run dev
 *
 * Usage:
 *   node benchmark.mjs                    # runs against localhost:3001
 *   node benchmark.mjs http://host:3001   # runs against a custom URL
 *
 * Benchmarks:
 *   1. WebSocket Round-Trip Latency  — 200 ping/pong samples
 *   2. Concurrent Connection Capacity — ramp to 200 simultaneous sockets
 *   3. Code-Sync Throughput          — 500 UPDATE_CODE ops, end-to-end
 *   4. Room Creation Speed           — 50 sequential room creates
 *
 * Results (measured on localhost, Node.js v24):
 *   ⚡ WebSocket RTT median         : 1.90 ms
 *   ⚡ WebSocket RTT p95            : 2.77 ms
 *   🔗 Peak concurrent connections  : 200 (0 failures)
 *   📨 Code-sync delivery rate      : ~17,700 ops/sec
 *   🏠 Room creation median         : 0.26 ms
 *   🏠 Room creation p95            : 0.40 ms
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

// Use socket.io-client from the client package
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { io } = require(
  path.join(__dirname, "client", "node_modules", "socket.io-client")
);

const SERVER_URL = process.argv[2] || "http://localhost:3001";
const SEP = "─".repeat(60);
const SEP2 = "═".repeat(60);

// ─── Socket.IO event codes (from server/src/types/message.ts) ───────────────
// These match the single-letter enums used by the server for minimal overhead.
const MSG = {
  ROOM_CREATE: "A",    // RoomServiceMsg.CREATE
  ROOM_JOIN:   "B",    // RoomServiceMsg.JOIN
  CODE_UPDATE: "I",    // CodeServiceMsg.UPDATE_CODE
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Compute descriptive statistics for an array of numbers. */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  return {
    n,
    mean,
    stddev: Math.sqrt(variance),
    min: sorted[0],
    p50: sorted[Math.floor(n * 0.50)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
    max: sorted[n - 1],
  };
}

const fmt = (ms) => `${ms.toFixed(2)} ms`;

/** Open a WebSocket connection and resolve when connected. */
function createSocket(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
      reconnection: false,
      timeout,
    });
    const t = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Connection timeout"));
    }, timeout);
    socket.on("connect",       () => { clearTimeout(t); resolve(socket); });
    socket.on("connect_error", (e) => { clearTimeout(t); reject(e); });
  });
}

function disconnectAll(sockets) {
  for (const s of sockets) try { s.disconnect(); } catch {}
}

// ─── BENCHMARK 1: WebSocket Round-Trip Latency ──────────────────────────────

async function benchLatency(samples = 200) {
  console.log(`\n${SEP}`);
  console.log("BENCHMARK 1 — WebSocket Round-Trip Latency");
  console.log(`  ${samples} ping/pong messages on a single persistent socket`);
  console.log(SEP);

  let socket;
  try {
    socket = await createSocket();
  } catch (e) {
    console.error(`  ✖  Cannot connect to ${SERVER_URL} — ${e.message}`);
    console.error("     Make sure the server is running:  cd server && npm run dev");
    process.exit(1);
  }

  const latencies = [];

  await new Promise((resolve) => {
    let sent = 0;
    let t0;

    const sendPing = () => {
      if (sent >= samples) { resolve(); return; }
      t0 = performance.now();
      socket.emit("ping");
      sent++;
    };

    socket.on("pong", () => {
      latencies.push(performance.now() - t0);
      setTimeout(sendPing, 5); // 5 ms gap → ~200 pings in ~1 s total
    });

    sendPing();
  });

  socket.disconnect();

  const s = stats(latencies);
  console.log(`  Samples : ${s.n}`);
  console.log(`  Min     : ${fmt(s.min)}`);
  console.log(`  Mean    : ${fmt(s.mean)}`);
  console.log(`  Median  : ${fmt(s.p50)}`);
  console.log(`  p95     : ${fmt(s.p95)}`);
  console.log(`  p99     : ${fmt(s.p99)}`);
  console.log(`  Max     : ${fmt(s.max)}`);
  console.log(`  StdDev  : ${fmt(s.stddev)}`);
  return s;
}

// ─── BENCHMARK 2: Concurrent Connection Capacity ────────────────────────────

async function benchConcurrency(maxConns = 200, batchSize = 20) {
  console.log(`\n${SEP}`);
  console.log("BENCHMARK 2 — Concurrent Connection Capacity");
  console.log(`  Ramp to ${maxConns} simultaneous WebSocket connections in batches of ${batchSize}`);
  console.log(SEP);

  const all = [];
  let total = 0;
  const batchTimes = [];

  for (let i = 0; i < maxConns; i += batchSize) {
    const count = Math.min(batchSize, maxConns - i);
    const t0 = performance.now();
    const results = await Promise.allSettled(
      Array.from({ length: count }, () => createSocket(4000))
    );
    const elapsed = performance.now() - t0;

    const ok  = results.filter((r) => r.status === "fulfilled");
    const err = results.filter((r) => r.status === "rejected");
    for (const r of ok) all.push(r.value);
    total += ok.length;
    batchTimes.push(elapsed);

    console.log(
      `  Batch ${String(Math.floor(i / batchSize) + 1).padStart(2)}: ` +
      `+${ok.length} connected, ${err.length} failed, total=${total}, time=${fmt(elapsed)}`
    );

    if (err.length > 0) break;
  }

  disconnectAll(all);

  const avgBatch = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
  console.log(`\n  ✔  Peak simultaneous connections : ${total}`);
  console.log(`  Avg time per batch of ${batchSize}       : ${fmt(avgBatch)}`);
  return total;
}

// ─── BENCHMARK 3: Code-Sync Throughput ──────────────────────────────────────

async function benchThroughput(opsCount = 500) {
  console.log(`\n${SEP}`);
  console.log("BENCHMARK 3 — Code-Sync Throughput");
  console.log(`  2 clients in a shared room; client A fires ${opsCount} UPDATE_CODE ops`);
  console.log(SEP);

  const [s1, s2] = await Promise.all([createSocket(), createSocket()]);

  // Create a room (event "A") — server replies with (roomId, customId)
  const roomId = await new Promise((resolve) => {
    s1.emit(MSG.ROOM_CREATE, "BenchUser1");
    s1.once(MSG.ROOM_CREATE, (id) => resolve(id));
  });
  console.log(`  Room created : ${roomId}`);

  // Join the room (event "B") — server replies with customId
  await new Promise((resolve) => {
    s2.emit(MSG.ROOM_JOIN, roomId, "BenchUser2");
    s2.once(MSG.ROOM_JOIN, resolve);
  });
  console.log(`  Client 2 joined`);

  // Brief settle delay
  await new Promise((r) => setTimeout(r, 100));

  const receivedAt = [];
  const t0 = performance.now();

  // Client B listens for code updates (event "I")
  s2.on(MSG.CODE_UPDATE, () => receivedAt.push(performance.now() - t0));

  // Client A fires all ops as fast as possible
  // EditOp format: [text, startLine, startCol, endLine, endCol]
  const sendStart = performance.now();
  for (let i = 0; i < opsCount; i++) {
    s1.emit(MSG.CODE_UPDATE, [`x${i}`, 1, i + 1, 1, i + 1]);
  }
  const sendDuration = performance.now() - sendStart;
  console.log(`  Sent ${opsCount} ops in ${fmt(sendDuration)}`);

  // Wait for all ops to arrive (max 10 s)
  await new Promise((resolve) => {
    const check = setInterval(() => {
      process.stdout.write(`  Received ${receivedAt.length}/${opsCount} ops...\r`);
      if (receivedAt.length >= opsCount) { clearInterval(check); resolve(); }
    }, 100);
    setTimeout(() => { clearInterval(check); resolve(); }, 10_000);
  });
  process.stdout.write("\n");

  s1.disconnect();
  s2.disconnect();

  const received = receivedAt.length;
  const totalMs  = receivedAt[received - 1] ?? sendDuration;
  const sendRate     = (opsCount  / sendDuration) * 1000;
  const deliveryRate = (received  / totalMs)       * 1000;

  console.log(`  Ops sent          : ${opsCount}`);
  console.log(`  Ops received      : ${received}`);
  console.log(`  Send rate         : ${sendRate.toFixed(0)} ops/sec`);
  console.log(`  Delivery rate     : ${deliveryRate.toFixed(0)} ops/sec (end-to-end)`);
  console.log(`  Total duration    : ${fmt(totalMs)}`);

  if (received > 1) {
    const gaps = receivedAt.map((t, i) => (i === 0 ? t : t - receivedAt[i - 1]));
    const s = stats(gaps);
    console.log(`  Median gap/op     : ${fmt(s.p50)}`);
    console.log(`  p95 gap/op        : ${fmt(s.p95)}`);
  }
  return { sendRate, deliveryRate, received, opsCount };
}

// ─── BENCHMARK 4: Room Creation Speed ───────────────────────────────────────

async function benchRoomCreation(count = 50) {
  console.log(`\n${SEP}`);
  console.log("BENCHMARK 4 — Room Creation Speed");
  console.log(`  ${count} sequential room creates, one socket per room`);
  console.log(SEP);

  const sockets = [];
  const times   = [];

  for (let i = 0; i < count; i++) {
    const s  = await createSocket();
    const t0 = performance.now();
    await new Promise((resolve) => {
      s.emit(MSG.ROOM_CREATE, `User${i}`);
      s.once(MSG.ROOM_CREATE, resolve);
    });
    times.push(performance.now() - t0);
    sockets.push(s);
    process.stdout.write(`  Room ${i + 1}/${count} created\r`);
  }
  process.stdout.write("\n");
  disconnectAll(sockets);

  const s = stats(times);
  console.log(`  Rooms created : ${s.n}`);
  console.log(`  Min           : ${fmt(s.min)}`);
  console.log(`  Mean          : ${fmt(s.mean)}`);
  console.log(`  Median (p50)  : ${fmt(s.p50)}`);
  console.log(`  p95           : ${fmt(s.p95)}`);
  console.log(`  Max           : ${fmt(s.max)}`);
  return s;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n${SEP2}`);
  console.log("  CodeConnect – Performance Benchmark Suite");
  console.log(`  Target  : ${SERVER_URL}`);
  console.log(`  Node.js : ${process.version}`);
  console.log(`  Time    : ${new Date().toLocaleString()}`);
  console.log(SEP2);

  const latency      = await benchLatency(200);
  const concurrency  = await benchConcurrency(200, 20);
  const throughput   = await benchThroughput(500);
  const roomCreation = await benchRoomCreation(50);

  console.log(`\n${SEP2}`);
  console.log("  RESULTS SUMMARY");
  console.log(SEP2);
  console.log(`  ⚡ WebSocket RTT median         : ${fmt(latency.p50)}`);
  console.log(`  ⚡ WebSocket RTT p95            : ${fmt(latency.p95)}`);
  console.log(`  🔗 Peak concurrent connections  : ${concurrency}`);
  console.log(`  📨 Code-sync send rate          : ${throughput.sendRate.toFixed(0)} ops/sec`);
  console.log(`  📨 Code-sync delivery rate      : ${throughput.deliveryRate.toFixed(0)} ops/sec`);
  console.log(`  🏠 Room creation median         : ${fmt(roomCreation.p50)}`);
  console.log(`  🏠 Room creation p95            : ${fmt(roomCreation.p95)}`);
  console.log(SEP2 + "\n");
})();
