import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { networkInterfaces } from 'os';
import https from 'https';
import http from 'http';
import dns from 'dns';
import fs from 'fs';
import selfsigned from 'selfsigned';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// WebXR requires a "secure context" — https, or the special-cased
// http://localhost. A plain http:// LAN IP (e.g. http://192.168.x.x) does
// NOT count, so the Quest browser could never start an XR session against
// it. The server therefore always listens over HTTPS (self-signed cert,
// generated on first run).

// Which model backend to use: 'claude' (default) or 'ollama'. Set by run.py
// based on the --ollama / --api-key flags.
const LLM_BACKEND = (process.env.LLM_BACKEND || 'claude').toLowerCase();
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

// Get API key from environment variable (only required for the Claude backend)
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

if (LLM_BACKEND === 'claude' && !CLAUDE_API_KEY) {
	console.error('\x1b[31mError: CLAUDE_API_KEY environment variable is not set.\x1b[0m');
	console.error('Set it before running the server:');
	console.error('  Windows:  set CLAUDE_API_KEY=your-key-here');
	console.error('  Mac/Linux: export CLAUDE_API_KEY=your-key-here');
	console.error('Or run with --ollama to use a local Ollama model instead.');
	process.exit(1);
}

if (LLM_BACKEND === 'ollama') {
	console.log(`\x1b[36mUsing local Ollama model "${OLLAMA_MODEL}" at ${OLLAMA_HOST}\x1b[0m`);
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(__dirname));

// System prompt for VR scene coding assistant
const SYSTEM_PROMPT = `You are a coding assistant embedded in a WebXR VR environment built with Three.js. Your role is to help the user modify the VR scene by writing and injecting code.

## Environment

The scene is a Three.js WebXR application. You have access to these globals when your code runs:
- \`THREE\` — the Three.js library
- \`scene\` — the THREE.Scene instance
- \`camera\` — the THREE.PerspectiveCamera
- \`renderer\` — the THREE.WebGLRenderer (XR-enabled)
- \`document\` — the page DOM (you can inject HTML elements into #overlay-root for DOM overlay UI)
- \`hud\` — a group attached to the camera (head-locked). Add objects here ONLY when the user explicitly asks for a HUD / an element that follows them. Never use it by default.

## Coordinate system (IMPORTANT)

This session requests a \`local-floor\` reference space. In WebXR, the floor position is accessed by requesting a \`local-floor\` or \`bounded-floor\` reference space. These spaces initialize the origin at floor level, where the y-axis is 0 at the ground, x is horizontal, and z is depth. \`local-floor\` provides a stable ground reference, while \`bounded-floor\` includes physical boundaries.

Concretely for this app:
- **y = 0 is the real-world floor** in the user's AR space.
- **y ≈ 1.6** is roughly the user's eye level (standing).
- **z is negative going forward** (away from the user); the user faces \`-z\` by default.

Place objects at heights that match where they belong in real life:
- Floors, rugs, ground planes → y = 0 (NEVER at eye level — this is a common mistake).
- Tabletop objects → y ≈ 0.7–0.9 (table height).
- Wall art / framed objects → y ≈ 1.4–1.7.
- Floating UI panels facing the user → y ≈ 1.4 and z ≈ -1.5.
- Ceiling objects → y ≈ 2.4+.

Do NOT default to y = 1.5 for everything. The chat/input/scene panels already sit there; piling new objects at the same height clutters the user's face. When in doubt about a specific object, think about where it would be in a real room and use that y.

When generating something *the user stands on or walks around* (a floor, a platform, a path), build it at y = 0 and give it explicit width/depth — for example a floor:

\`\`\`vr-exec
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 6),
  new THREE.MeshStandardMaterial({ color: 0x6b7280, side: THREE.DoubleSide })
);
floor.rotation.x = -Math.PI / 2;  // lay flat on the ground plane
floor.position.set(0, 0, 0);       // y = 0 = AR floor
scene.add(floor);
\`\`\`

## Anchoring (IMPORTANT — default behavior)

Objects you add with \`scene.add(...)\` are anchored to the physical room (the larger environmental scene). They stay fixed in world space as the user walks around, turns their head, or looks away — they are NOT attached to the chat window or the user. **This is the default and what you must do unless the user explicitly asks otherwise.** Set a world position once with \`obj.position.set(x, y, z)\` and leave it there.

Do NOT make new objects follow, attach to, or move with the user or the chat window by default:
- Never parent an object to \`camera\` (e.g. \`camera.add(obj)\`).
- Never register a \`window._vrAnimations\` callback that copies \`camera.position\`/rotation onto an object, or calls \`obj.lookAt(camera.position)\` every frame, just to keep it in front of the user.
- Never recompute an object's position from \`camera\` every frame.

Only when the user *explicitly* asks for a head-locked HUD, a "follow me" panel, or an element that always faces them should you make it follow — and in that case add it to the \`hud\` group (\`hud.add(obj)\`), which is attached to the camera and will track the user. Its \`position\` is relative to the camera (e.g. \`obj.position.set(0, 0, -1)\` places it 1m in front). Do NOT parent to \`camera\` directly — objects added straight to \`camera\` are automatically re-anchored to the world. Everything not in \`hud\` stays world-anchored via \`scene.add(...)\`.

## How to modify the scene

When you want to modify the VR scene or inject HTML, wrap your code in a fenced code block with the language tag \`vr-exec\`:

\`\`\`vr-exec
// Example: add a red cube
const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const cube = new THREE.Mesh(geometry, material);
cube.position.set(0, 1.5, -2);
scene.add(cube);
\`\`\`

You can also inject HTML into the DOM overlay:

\`\`\`vr-exec
const panel = document.createElement('div');
panel.id = 'my-info-panel';
panel.style.cssText = 'position:fixed;top:80px;left:20px;padding:16px;background:rgba(0,0,0,0.8);color:white;border-radius:12px;z-index:1000;font-size:14px;';
panel.innerHTML = '<h3>Scene Info</h3><p>Objects: ' + scene.children.length + '</p>';
document.getElementById('overlay-root').appendChild(panel);
\`\`\`

## Rules

1. Always use \`vr-exec\` code blocks for code that should be executed in the scene. Regular code blocks are displayed but NOT executed.
2. You can include multiple \`vr-exec\` blocks in a single response — they execute in order.
3. You can use animation by hooking into the render loop: store functions on \`window._vrAnimations\` (an array) — the app calls each one per frame.
4. Keep explanations concise. Lead with the code, explain after.
5. When removing objects, use \`scene.remove(obj)\` and \`obj.geometry.dispose(); obj.material.dispose();\` to free memory.
6. To reference objects you've previously added, attach them to \`window\` (e.g., \`window.myCube = cube;\`).
7. For embedded <script> tags in injected HTML, they will be executed automatically by the browser.
8. The user is in VR/AR on a Quest 3 headset — keep UI elements readable and appropriately sized.
9. vr-exec blocks run inside an async function, so you can use \`await\` at the top level.
10. By default, anchor new objects to the world with \`scene.add(...)\` and a fixed \`position\`. Do NOT parent them to \`camera\` or add per-frame code that makes them follow the user, unless the user explicitly requests a head-locked or always-facing element (see "Anchoring" above).`;

// System prompt for error-correction requests
const FIX_CODE_PROMPT = `You are an automatic error-correction system for a WebXR VR environment built with Three.js.

A vr-exec code block failed to execute. Your job is to fix the code and return ONLY a corrected version.

## Environment

The code runs inside an \`AsyncFunction('THREE', 'scene', 'camera', 'renderer', 'document', code)\`, so these are the ONLY variables available:
- \`THREE\` — the Three.js library (use THREE.* for all Three.js classes/utilities)
- \`scene\` — THREE.Scene instance
- \`camera\` — THREE.PerspectiveCamera
- \`renderer\` — THREE.WebGLRenderer (XR-enabled)
- \`document\` — the page DOM
- \`window\` — the global window object (use window.* to access/store persistent references)
- \`window._vrAnimations\` — array of per-frame animation callbacks

Top-level \`await\` IS allowed because the function is async.

## Common mistakes to fix

1. Using bare globals that aren't passed in (e.g. \`Math\` is fine since it's on window, but any custom var from a prior block must be accessed via \`window.varName\`)
2. Using Three.js classes without the \`THREE.\` prefix (e.g. \`Vector3\` → \`THREE.Vector3\`, \`MeshStandardMaterial\` → \`THREE.MeshStandardMaterial\`)
3. Referencing variables from other code blocks without \`window.\` prefix
4. Using ES module import syntax (not available inside new Function)
5. Using \`let\`/\`const\` for variables that need to persist across blocks — should use \`window.varName\` instead
6. Accessing Three.js addon classes (like OrbitControls, FontLoader, TextGeometry) that aren't available in the base Three.js build

## Rules

1. Return ONLY a single \`vr-exec\` code block with the fix. No explanation, no commentary.
2. Fix the root cause — don't just wrap in try/catch to silence it.
3. If the code references variables from prior code blocks, access them via \`window.\` (e.g. \`window.myCube\`).
4. If Three.js addon classes are needed but unavailable, replace with equivalent base Three.js code (e.g. replace TextGeometry with canvas texture text, replace CSG with manual geometry).
5. Keep the original intent of the code intact.`;

// Shared function: call Claude API and return parsed response
function callClaudeAPI(systemPrompt, messages, maxTokens = 16384) {
	return new Promise((resolve, reject) => {
		const postBody = JSON.stringify({
			model: 'claude-sonnet-5',
			max_tokens: maxTokens,
			// Thinking is on by default on Sonnet 5; disable it so content[0] stays
			// a text block (the client reads data.content[0].text) and to keep VR latency low.
			thinking: { type: 'disabled' },
			system: systemPrompt,
			messages: messages
		});

		const apiReq = https.request({
			hostname: 'api.anthropic.com',
			path: '/v1/messages',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': CLAUDE_API_KEY,
				'anthropic-version': '2023-06-01',
				'Content-Length': Buffer.byteLength(postBody)
			},
			lookup: (hostname, options, callback) => {
				if (typeof options === 'function') {
					callback = options;
					options = {};
				}
				dns.resolve4(hostname, (err, addresses) => {
					if (err) return callback(err);
					if (options && options.all) {
						callback(null, addresses.map(addr => ({ address: addr, family: 4 })));
					} else {
						callback(null, addresses[0], 4);
					}
				});
			}
		}, (apiRes) => {
			let body = '';
			apiRes.on('data', (chunk) => body += chunk);
			apiRes.on('end', () => {
				try {
					const parsed = JSON.parse(body);
					if (apiRes.statusCode >= 400) {
						resolve({ error: true, status: apiRes.statusCode, data: parsed });
					} else {
						resolve({ error: false, data: parsed });
					}
				} catch (e) {
					reject(new Error(`Invalid JSON response: ${body.slice(0, 200)}`));
				}
			});
		});

		apiReq.on('error', reject);
		apiReq.write(postBody);
		apiReq.end();
	});
}

// Shared function: call a local Ollama model and normalize the response into
// the same { content: [{ text }] } shape the client expects from Claude.
function callOllamaAPI(systemPrompt, messages, maxTokens = 16384) {
	return new Promise((resolve, reject) => {
		const postBody = JSON.stringify({
			model: OLLAMA_MODEL,
			stream: false,
			options: { num_predict: maxTokens },
			messages: [{ role: 'system', content: systemPrompt }, ...messages]
		});

		const url = new URL('/api/chat', OLLAMA_HOST);
		const apiReq = http.request({
			hostname: url.hostname,
			port: url.port,
			path: url.pathname,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(postBody)
			}
		}, (apiRes) => {
			let body = '';
			apiRes.on('data', (chunk) => body += chunk);
			apiRes.on('end', () => {
				try {
					const parsed = JSON.parse(body);
					if (apiRes.statusCode >= 400) {
						resolve({ error: true, status: apiRes.statusCode, data: { error: { message: parsed.error || body } } });
					} else {
						resolve({ error: false, data: { content: [{ text: parsed.message?.content || '' }] } });
					}
				} catch (e) {
					reject(new Error(`Invalid JSON response from Ollama: ${body.slice(0, 200)}`));
				}
			});
		});

		apiReq.on('error', (err) => {
			reject(new Error(`Could not reach Ollama at ${OLLAMA_HOST}: ${err.message}`));
		});
		apiReq.write(postBody);
		apiReq.end();
	});
}

// Dispatches to whichever backend is configured, keeping a uniform response shape.
function callLLM(systemPrompt, messages, maxTokens = 16384) {
	return LLM_BACKEND === 'ollama'
		? callOllamaAPI(systemPrompt, messages, maxTokens)
		: callClaudeAPI(systemPrompt, messages, maxTokens);
}

// Proxy endpoint for Claude API
app.post('/api/chat', async (req, res) => {
	try {
		const { messages } = req.body;

		if (!messages || !Array.isArray(messages)) {
			return res.status(400).json({ error: 'Messages array is required' });
		}

		const data = await callLLM(SYSTEM_PROMPT, messages);

		if (data.error) {
			return res.status(data.status).json({
				error: data.data.error?.message || `API error: ${data.status}`
			});
		}

		res.json(data.data);

	} catch (error) {
		console.error('Proxy error:', error);
		res.status(500).json({ error: error.message });
	}
});

// Error-correction endpoint: takes failing code + error and returns fixed code
app.post('/api/fix-code', async (req, res) => {
	try {
		const { failingCode, errorMessage, errorStack, attempt, priorFixes } = req.body;

		if (!failingCode || !errorMessage) {
			return res.status(400).json({ error: 'failingCode and errorMessage are required' });
		}

		// Build the fix request messages
		let userContent = `The following vr-exec code block failed to execute.\n\n`;
		userContent += `**Error:** \`${errorMessage}\`\n`;
		if (errorStack) {
			userContent += `**Stack:** \`${errorStack}\`\n`;
		}
		userContent += `**Attempt:** ${attempt || 1} of 3\n\n`;
		userContent += `**Failing code:**\n\`\`\`javascript\n${failingCode}\n\`\`\`\n\n`;

		if (priorFixes && priorFixes.length > 0) {
			userContent += `**Previous fix attempts that also failed:**\n`;
			for (const fix of priorFixes) {
				userContent += `\nAttempt ${fix.attempt} error: \`${fix.error}\`\n`;
				userContent += `\`\`\`javascript\n${fix.code}\n\`\`\`\n`;
			}
			userContent += `\nThe prior fixes did not work. Try a different approach.\n`;
		}

		userContent += `\nFix this code. Return ONLY a single \`vr-exec\` code block.`;

		const fixMessages = [{ role: 'user', content: userContent }];
		const data = await callLLM(FIX_CODE_PROMPT, fixMessages, 8192);

		if (data.error) {
			return res.status(data.status).json({
				error: data.data.error?.message || `API error: ${data.status}`
			});
		}

		res.json(data.data);

	} catch (error) {
		console.error('Fix-code error:', error);
		res.status(500).json({ error: error.message });
	}
});

// Scene save/load endpoints. On Vercel the deployment filesystem is
// read-only except /tmp, and /tmp isn't shared or persistent across
// invocations - save/load will only round-trip within the same warm
// function instance there, not indefinitely like the local server.
const SCENE_FILE = process.env.VERCEL
	? join('/tmp', 'saved-scene.vrscene')
	: join(__dirname, 'saved-scene.vrscene');

app.post('/api/save-scene', (req, res) => {
	try {
		const sceneData = req.body;
		if (!sceneData || !sceneData.codeBlocks || !Array.isArray(sceneData.codeBlocks)) {
			return res.status(400).json({ error: 'Invalid scene data: missing codeBlocks array' });
		}
		fs.writeFileSync(SCENE_FILE, JSON.stringify(sceneData, null, 2), 'utf8');
		res.json({ ok: true, file: 'saved-scene.vrscene' });
	} catch (error) {
		console.error('Save scene error:', error);
		res.status(500).json({ error: error.message });
	}
});

app.get('/api/load-scene', (req, res) => {
	try {
		if (!fs.existsSync(SCENE_FILE)) {
			return res.status(404).json({ error: 'No saved scene found' });
		}
		const data = fs.readFileSync(SCENE_FILE, 'utf8');
		res.json(JSON.parse(data));
	} catch (error) {
		console.error('Load scene error:', error);
		res.status(500).json({ error: error.message });
	}
});

// Get local network IP for Quest 3 connection
function getLocalIP() {
	const nets = networkInterfaces();
	for (const name of Object.keys(nets)) {
		for (const net of nets[name]) {
			if (net.family === 'IPv4' && !net.internal) {
				return net.address;
			}
		}
	}
	return 'localhost';
}

// Generate (and cache to disk) a self-signed cert covering localhost + the
// current LAN IP, so a WebXR-capable HTTPS origin is available for the
// Quest browser without needing a real certificate. Re-generated whenever
// the cached cert doesn't cover the machine's current LAN IP (e.g. it
// changed networks) or is missing.
async function getOrCreateCert(localIP) {
	const certDir = join(__dirname, 'certs');
	const keyPath = join(certDir, 'key.pem');
	const certPath = join(certDir, 'cert.pem');
	const metaPath = join(certDir, 'meta.json');

	if (fs.existsSync(keyPath) && fs.existsSync(certPath) && fs.existsSync(metaPath)) {
		try {
			const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
			if (meta.localIP === localIP) {
				return {
					key: fs.readFileSync(keyPath, 'utf8'),
					cert: fs.readFileSync(certPath, 'utf8'),
				};
			}
		} catch {
			// fall through to regenerate
		}
	}

	console.log('\x1b[36mGenerating self-signed HTTPS certificate...\x1b[0m');
	const attrs = [{ name: 'commonName', value: localIP }];
	const notAfterDate = new Date();
	notAfterDate.setFullYear(notAfterDate.getFullYear() + 10);
	const pems = await selfsigned.generate(attrs, {
		notAfterDate,
		algorithm: 'sha256',
		keySize: 2048,
		extensions: [
			{
				name: 'subjectAltName',
				altNames: [
					{ type: 2, value: 'localhost' },   // DNS
					{ type: 7, ip: '127.0.0.1' },       // IP
					{ type: 7, ip: localIP },           // IP
				],
			},
		],
	});

	fs.mkdirSync(certDir, { recursive: true });
	fs.writeFileSync(keyPath, pems.private);
	fs.writeFileSync(certPath, pems.cert);
	fs.writeFileSync(metaPath, JSON.stringify({ localIP }));

	return { key: pems.private, cert: pems.cert };
}

// On Vercel, the platform already terminates TLS with a real (non-self-signed)
// certificate and invokes this file as a request handler directly - there's no
// self-signed cert to generate and nothing to .listen() on. Only do the local
// HTTPS-server dance when actually running via `node server.js` / run.py.
if (!process.env.VERCEL) {
	const localIP = getLocalIP();

	const { key, cert } = await getOrCreateCert(localIP);
	const server = https.createServer({ key, cert }, app);

	server.listen(PORT, '0.0.0.0', () => {
		console.log('\n\x1b[32m=== Claude VR Chat Server ===\x1b[0m\n');
		console.log(`Local:   https://localhost:${PORT}`);
		console.log(`Network: https://${localIP}:${PORT}`);
		console.log('\n\x1b[36mOpen the Network URL on your Quest 3 browser.\x1b[0m');
		console.log('\x1b[33mNote: Both devices must be on the same WiFi network.\x1b[0m');
		console.log('\x1b[33mSelf-signed certificate: the browser will warn on first');
		console.log('visit — accept/proceed once to continue ("Advanced" > "Proceed").\x1b[0m');
		console.log();
	});
}

export default app;
