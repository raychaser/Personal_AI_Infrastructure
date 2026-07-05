#!/usr/bin/env bun
/**
 * LifeOS Pulse Worker — Provisioning Script
 *
 * Sets up a new LifeOS Worker from scratch.
 * Reads DA_IDENTITY.md for worker identity.
 * Generates PULSE.toml, .env, and installs launchd service.
 *
 * Usage: bun run setup.ts
 * Goal: under 30 minutes from bare machine to working worker.
 */

import { join, resolve } from "path"
import { existsSync, mkdirSync } from "fs"

const HOME = process.env.HOME ?? "~"
const LIFEOS_DIR = join(HOME, ".claude", "LIFEOS")
const PULSE_DIR = join(LIFEOS_DIR, "PULSE")

// ── Helpers ──

function prompt(question: string): Promise<string> {
  process.stdout.write(`\n  ${question} `)
  return new Promise((resolve) => {
    const buf: Buffer[] = []
    process.stdin.resume()
    process.stdin.once("data", (data) => {
      process.stdin.pause()
      resolve(data.toString().trim())
    })
  })
}

function heading(text: string): void {
  console.log(`\n${"─".repeat(50)}`)
  console.log(`  ${text}`)
  console.log(`${"─".repeat(50)}`)
}

function ok(text: string): void {
  console.log(`  [ok] ${text}`)
}

function warn(text: string): void {
  console.log(`  [!!] ${text}`)
}

// ── Step 1: Read Identity ──

async function readIdentity(): Promise<{ name: string; description: string }> {
  heading("Step 1: Worker Identity")

  const identityPath = join(LIFEOS_DIR, "USER", "DA_IDENTITY.md")
  if (existsSync(identityPath)) {
    const content = await Bun.file(identityPath).text()
    const nameMatch = content.match(/\*\*Name:\*\*\s*(.+)/i) ?? content.match(/^-\s*\*\*Name:\*\*\s*(.+)/mi)
    const roleMatch = content.match(/\*\*Role:\*\*\s*(.+)/i)
    const name = nameMatch?.[1]?.trim() ?? ""
    const description = roleMatch?.[1]?.trim() ?? ""

    if (name) {
      ok(`Found identity: ${name}`)
      if (description) ok(`Role: ${description}`)
      return { name: name.toLowerCase(), description }
    }
  }

  const name = await prompt("Worker name (e.g., echo, cipher, atlas):")
  const description = await prompt("Worker description (e.g., research specialist):")
  return { name: name.toLowerCase(), description }
}

// ── Step 2: GitHub App Setup ──

async function setupGitHubApp(workerName: string): Promise<{
  appId: string
  installationId: string
  privateKeyPath: string
  repos: string[]
}> {
  heading("Step 2: GitHub App")

  const ghHomepage = process.env.LIFEOS_GITHUB_HOMEPAGE ?? "https://github.com/YOUR-USERNAME";
  console.log(`
  Create a GitHub App for this worker:
  1. Go to: https://github.com/settings/apps/new
  2. App name: pai-worker-${workerName}
  3. Homepage URL: ${ghHomepage}
  4. Uncheck Webhook (Active)
  5. Permissions:
     - Issues: Read & Write
     - Contents: Read & Write
     - Pull requests: Read & Write
     - Metadata: Read-only
  6. Where can this app be installed? → Only on this account
  7. Create GitHub App
  8. Note the App ID
  9. Generate a private key (downloads .pem file)
  10. Install the app on your repos
  `)

  const appId = await prompt("GitHub App ID:")
  const privateKeyPath = await prompt("Path to private key (.pem file):")
  const resolvedKey = resolve(privateKeyPath.replace(/^~/, HOME))

  if (!existsSync(resolvedKey)) {
    warn(`Private key not found at: ${resolvedKey}`)
    warn("You can set this up later in PULSE.toml")
  } else {
    ok(`Private key found: ${resolvedKey}`)
  }

  // Get installation ID
  console.log(`
  Find your installation ID:
  1. Go to: https://github.com/settings/installations
  2. Click "Configure" on pai-worker-${workerName}
  3. The URL ends with /installations/XXXXX — that number is the ID
  `)

  const installationId = await prompt("Installation ID:")

  const reposInput = await prompt("Repos to monitor (comma-separated, e.g., your-org/your-repo):")
  const repos = reposInput.split(",").map((r) => r.trim()).filter(Boolean)

  ok(`GitHub App configured: ${appId}`)
  return { appId, installationId, privateKeyPath: resolvedKey, repos }
}

// ── Step 3: Telegram Setup ──

async function setupTelegram(workerName: string): Promise<{ botToken: string; chatId: string }> {
  heading("Step 3: Telegram Bot")

  console.log(`
  Create a Telegram bot for ${workerName}:
  1. Message @BotFather on Telegram
  2. Send: /newbot
  3. Name: ${workerName} LifeOS Worker
  4. Username: pai_${workerName}_bot
  5. Copy the bot token
  `)

  const botToken = await prompt("Bot token (or press Enter to skip):")
  if (!botToken) {
    warn("Telegram skipped — can configure later in .env")
    return { botToken: "", chatId: "" }
  }

  const chatId = await prompt("Your Telegram chat ID:")
  ok("Telegram configured")
  return { botToken, chatId }
}

// ── Step 4: Generate Config Files ──

async function generateConfigs(opts: {
  name: string
  description: string
  appId: string
  installationId: string
  privateKeyPath: string
  repos: string[]
  botToken: string
  chatId: string
  specialization: string[]
}): Promise<void> {
  heading("Step 4: Generating Config Files")

  // PULSE.toml
  const reposToml = opts.repos.map((r) => `"${r}"`).join(", ")
  const specToml = opts.specialization.map((s) => `"${s}"`).join(", ")

  const pulseToml = `# LifeOS Pulse — ${opts.name} Worker Configuration
#
# type = "script" → runs command, $0 cost
# type = "claude" → spawns claude --print, costs tokens
# output = voice | telegram | ntfy | email | log
# Sentinels: NO_ACTION, NO_URGENT, NO_EVENTS → suppress dispatch

[worker]
name = "${opts.name}"
github_app_id = "${opts.appId}"
github_app_private_key = "${opts.privateKeyPath}"
github_installation_id = "${opts.installationId}"
repos = [${reposToml}]
specialization = [${specToml}]
max_concurrent = 1

[[job]]
name = "github-work"
schedule = "*/2 * * * *"
type = "script"
command = "bun run checks/github-work.ts"
output = "log"
enabled = true

[[job]]
name = "healthcheck"
schedule = "*/5 * * * *"
type = "script"
command = "bun run checks/health.ts"
output = "telegram"
enabled = true

[[job]]
name = "morning-report"
schedule = "0 7 * * *"
type = "claude"
prompt = "You are ${opts.name}, a LifeOS Worker (${opts.description}). Summarize your completed work from the last 24 hours. Check recent git log and closed issues. Be concise."
model = "sonnet"
output = "telegram"
enabled = true
`

  await Bun.write(join(PULSE_DIR, "PULSE.toml"), pulseToml)
  ok("PULSE.toml written")

  // .env
  const envLines = [
    `# LifeOS Worker: ${opts.name}`,
    `# Generated by setup.ts on ${new Date().toISOString()}`,
    ``,
    `# GitHub App`,
    `GITHUB_APP_ID=${opts.appId}`,
    `GITHUB_APP_PRIVATE_KEY_PATH=${opts.privateKeyPath}`,
    `GITHUB_INSTALLATION_ID=${opts.installationId}`,
    ``,
    `# Telegram`,
    opts.botToken ? `TELEGRAM_BOT_TOKEN=${opts.botToken}` : `# TELEGRAM_BOT_TOKEN=`,
    opts.chatId ? `TELEGRAM_PRINCIPAL_CHAT_ID=${opts.chatId}` : `# TELEGRAM_PRINCIPAL_CHAT_ID=`,
    ``,
    `# Anthropic`,
    `# ANTHROPIC_API_KEY=sk-ant-...`,
    ``,
  ]

  const envPath = join(HOME, ".claude", ".env")
  if (existsSync(envPath)) {
    warn(`.env already exists — appending worker config`)
    const existing = await Bun.file(envPath).text()
    await Bun.write(envPath, existing + "\n" + envLines.join("\n"))
  } else {
    await Bun.write(envPath, envLines.join("\n"))
  }
  ok(".env written")
}

// ── Step 5: Local HTTPS Setup (hosts file + mkcert) ──

async function setupLocalHTTPS(): Promise<void> {
  heading("Step 5: Local HTTPS (mkcert)")

  // Check if 'pai' hostname is in /etc/hosts
  const hostsContent = await Bun.file("/etc/hosts").text()
  const hasLifeosHost = /^\s*127\.0\.0\.1\s+.*\bpai\b/m.test(hostsContent)

  if (!hasLifeosHost) {
    console.log(`
  The 'pai' hostname needs to be added to /etc/hosts.
  This requires sudo. The following line will be appended:

    127.0.0.1\tpai
  `)
    const confirm = await prompt("Add 'pai' to /etc/hosts? (y/n):")
    if (confirm.toLowerCase() === "y") {
      const proc = Bun.spawn(["sudo", "bash", "-c", `echo '127.0.0.1\tpai' >> /etc/hosts`], {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
      })
      const code = await proc.exited
      if (code === 0) {
        ok("Added 'pai' to /etc/hosts")
      } else {
        warn("Failed to update /etc/hosts — add manually: 127.0.0.1  pai")
      }
    } else {
      warn("Skipped — add manually: echo '127.0.0.1  pai' | sudo tee -a /etc/hosts")
    }
  } else {
    ok("'pai' hostname already in /etc/hosts")
  }

  // Check for mkcert
  const whichProc = Bun.spawn(["which", "mkcert"], { stdout: "pipe", stderr: "pipe" })
  const whichCode = await whichProc.exited

  if (whichCode !== 0) {
    console.log(`
  mkcert is needed for local HTTPS. Installing via Homebrew...
  `)
    const brewProc = Bun.spawn(["brew", "install", "mkcert"], {
      stdout: "inherit",
      stderr: "inherit",
    })
    const brewCode = await brewProc.exited
    if (brewCode !== 0) {
      warn("Failed to install mkcert — install manually: brew install mkcert")
      warn("Then run: mkcert -install && cd Pulse/certs && mkcert pai localhost 127.0.0.1")
      return
    }
  }
  ok("mkcert available")

  // Install local CA into system trust store
  console.log("\n  Installing local CA into system trust store...")
  const caProc = Bun.spawn(["mkcert", "-install"], {
    stdout: "inherit",
    stderr: "inherit",
  })
  await caProc.exited
  ok("Local CA installed in system trust store")

  // Generate certs
  const certsDir = join(PULSE_DIR, "certs")
  const certPath = join(certsDir, "pai+2.pem")

  if (existsSync(certPath)) {
    ok("TLS certificates already exist")
  } else {
    mkdirSync(certsDir, { recursive: true })
    const certProc = Bun.spawn(["mkcert", "pai", "localhost", "127.0.0.1"], {
      cwd: certsDir,
      stdout: "inherit",
      stderr: "inherit",
    })
    const certCode = await certProc.exited
    if (certCode === 0) {
      ok("TLS certificates generated for: pai, localhost, 127.0.0.1")
      ok(`Cert: ${join(certsDir, "pai+2.pem")}`)
      ok(`Key:  ${join(certsDir, "pai+2-key.pem")}`)
      ok("Expires in 2 years — regenerate with: cd Pulse/certs && mkcert pai localhost 127.0.0.1")
    } else {
      warn("Failed to generate certificates")
    }
  }
}

// ── launchd / bun-path helpers (pure + injectable) ──
// Exported so their invariants are unit-testable without running the interactive
// installer: setup-bun-path.test.ts pins the resolveBunForPlist ordering and
// setup-launchctl.test.ts pins classifyLaunchctlLoad. main() is import.meta.main-
// guarded below so importing this module in a test does not launch setup.

/**
 * Resolve a PERSISTENT bun binary for the RunAtLoad plist. Ordering is
 * load-bearing: canonical install locations FIRST, PATH resolution (`Bun.which`)
 * LAST — inside a `bun install` the child PATH can resolve `bun` to an ephemeral
 * shim under /private/tmp/bun-node-<tmp>, and baking that into a persistent plist
 * yields a service that dies at next login. `process.execPath` is the
 * guaranteed-valid final fallback (this script runs under bun). setup.ts ships
 * standalone into PULSE/ without the Tools/ sibling, so this mirrors
 * InstallEngine.resolveBunPath inline (see install/tests/resolveBunPath.test.ts
 * for the canonical copy's invariant). The returned `source` lets the caller emit
 * the resolved path and warn loudly when resolution falls past the canonical tier
 * — surfacing a likely-non-persistent bun at install time instead of as a dead
 * launchd service at next login.
 */
export function resolveBunForPlist(
  opts: {
    home?: string
    exists?: (p: string) => boolean
    which?: (cmd: string) => string | null
    execPath?: string
  } = {},
): { bunPath: string; source: "canonical" | "path" | "execPath" } {
  const home = opts.home ?? HOME
  const exists = opts.exists ?? existsSync
  const which = opts.which ?? ((cmd: string) => Bun.which(cmd))
  const execPath = opts.execPath ?? process.execPath
  const candidates = [`${home}/.bun/bin/bun`, "/opt/homebrew/bin/bun", "/usr/local/bin/bun"]
  const canonical = candidates.find((p) => exists(p))
  if (canonical) return { bunPath: canonical, source: "canonical" }
  const viaPath = which("bun")
  if (viaPath) return { bunPath: viaPath, source: "path" }
  return { bunPath: execPath, source: "execPath" }
}

/**
 * Classify the result of `launchctl load`. Bun.spawn does NOT throw on a non-zero
 * exit, so the code must be checked explicitly — otherwise a real load failure is
 * silently reported as success (the bug this restores loud failure for). But
 * `launchctl load` (the legacy command) ALSO exits non-zero when the service is
 * already loaded — the normal state on an idempotent re-run of setup.ts — which is
 * benign, not a failure. Classify the two apart so a healthy re-run is reported as
 * ok rather than a scary false negative. Pure so both branches are unit-testable.
 */
export function classifyLaunchctlLoad(
  code: number,
  stderr: string,
  manageHint: string,
): { level: "ok" | "warn"; message: string } {
  const err = (stderr ?? "").trim()
  if (code === 0) return { level: "ok", message: "launchd service installed" }
  if (/already loaded|Operation already in progress/i.test(err)) {
    return { level: "ok", message: "launchd service already loaded (idempotent re-run)" }
  }
  return {
    level: "warn",
    message: `launchctl load exited ${code}${err ? `: ${err}` : ""} — Pulse service may not be running (check ${manageHint})`,
  }
}

// ── Step 6: Install launchd Service ──

async function installService(): Promise<void> {
  heading("Step 6: Installing launchd Service")

  // Create directories
  for (const dir of ["state", "logs"]) {
    const path = join(PULSE_DIR, dir)
    if (!existsSync(path)) mkdirSync(path, { recursive: true })
  }

  const plistSrc = join(PULSE_DIR, "com.lifeos.pulse.plist")
  const plistDst = join(HOME, "Library", "LaunchAgents", "com.lifeos.pulse.plist")

  if (!existsSync(plistSrc)) {
    warn("com.lifeos.pulse.plist not found — create it manually")
    return
  }

  // Read template, substitute __HOME__ with actual user home, write to LaunchAgents.
  // The source plist ships as a template (no hardcoded user paths) so the system
  // file is deny-list clean; the installed copy is per-user materialized.
  const template = await Bun.file(plistSrc).text()
  // Resolve a persistent bun for the plist (canonical locations first, never an
  // ephemeral PATH shim) and surface which tier won it — invisible resolution is
  // the hard-to-debug-6-months-later failure. Emit the path, and warn loudly when
  // it falls past the canonical tier so a likely-non-persistent bun is caught here
  // rather than as a dead launchd service at next login.
  const { bunPath, source } = resolveBunForPlist({ home: HOME })
  ok(`plist bun → ${bunPath}`)
  if (source !== "canonical") {
    warn(
      `bun resolved via ${source === "path" ? "PATH (Bun.which)" : "process.execPath"}, not a canonical install location — ` +
        `if ${bunPath} is ephemeral (e.g. a /private/tmp bun-install shim) the Pulse launchd service will die at next login. ` +
        `Install bun to ~/.bun/bin, /opt/homebrew/bin, or /usr/local/bin for a durable service.`,
    )
  }
  const materialized = template.replaceAll("__BUN_PATH__", bunPath).replaceAll("__HOME__", HOME)
  await Bun.write(plistDst, materialized)
  const proc = Bun.spawn(["launchctl", "load", plistDst], {
    stdout: "pipe",
    stderr: "pipe",
  })
  // Bun.spawn does NOT throw on a non-zero exit, so the exit code must be checked
  // explicitly — otherwise a failed load is swallowed and we falsely report success.
  // classifyLaunchctlLoad also distinguishes the benign already-loaded re-run from a
  // real failure. Step 7's health check confirms the service actually came up.
  const code = await proc.exited
  const stderrText = await new Response(proc.stderr).text()
  const result = classifyLaunchctlLoad(code, stderrText, `${join(PULSE_DIR, "manage.sh")} status`)
  if (result.level === "warn") {
    warn(result.message)
    return
  }
  ok(result.message)
}

// ── Step 7: Health Check ──

async function healthCheck(): Promise<void> {
  heading("Step 7: Health Check")

  // Wait for Pulse to start
  await Bun.sleep(3_000)

  const pidPath = join(PULSE_DIR, "state", "pulse.pid")
  if (existsSync(pidPath)) {
    const pid = (await Bun.file(pidPath).text()).trim()
    const proc = Bun.spawn(["ps", "-p", pid], { stdout: "pipe", stderr: "pipe" })
    const code = await proc.exited
    if (code === 0) {
      ok(`Pulse running (PID ${pid})`)
    } else {
      warn(`Pulse PID ${pid} not running — check logs/pulse-stderr.log`)
    }
  } else {
    warn("No PID file — Pulse may not have started")
  }

  // Check hook server
  try {
    const resp = await fetch("http://localhost:31337/healthz", { signal: AbortSignal.timeout(3_000) })
    if (resp.ok) {
      const data = (await resp.json()) as { status: string; jobs: unknown[] }
      ok(`Hook server responding — ${(data.jobs as unknown[])?.length ?? 0} jobs loaded`)
    }
  } catch {
    warn("Hook server not responding on port 31337")
  }
}

// ── Main ──

async function main() {
  console.log(`
${"═".repeat(50)}
  LifeOS Pulse Worker Setup
  Goal: Working AI employee in under 30 minutes
${"═".repeat(50)}`)

  const startTime = Date.now()

  const identity = await readIdentity()

  const specInput = await prompt("Specialization labels (comma-separated, e.g., research,content — or Enter for none):")
  const specialization = specInput ? specInput.split(",").map((s) => s.trim()).filter(Boolean) : []

  const github = await setupGitHubApp(identity.name)
  const telegram = await setupTelegram(identity.name)

  await generateConfigs({
    ...identity,
    ...github,
    ...telegram,
    specialization,
  })

  await setupLocalHTTPS()
  await installService()
  await healthCheck()

  const elapsed = Math.round((Date.now() - startTime) / 1000)

  console.log(`
${"═".repeat(50)}
  Setup Complete!

  Worker: ${identity.name}
  Time: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s

  Next steps:
  - Verify ANTHROPIC_API_KEY is set in ${join(HOME, ".claude", ".env")}
  - Create a test issue with label "status:ready" in one of your repos
  - Watch: tail -f ${join(PULSE_DIR, "logs", "pulse-stdout.log")}
  - Status: ${join(PULSE_DIR, "manage.sh")} status
${"═".repeat(50)}
`)
}

// Guard the entry point so importing this module (e.g. from the unit tests that
// exercise resolveBunForPlist / classifyLaunchctlLoad) does not launch the
// interactive installer. Only runs when setup.ts is the executed entry.
if (import.meta.main) {
  main().catch((err) => {
    console.error(`Setup failed: ${err}`)
    process.exit(1)
  })
}
