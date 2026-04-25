import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { networkInterfaces } from 'os';
import https from 'https';
import dns from 'dns';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Get API key from environment variable
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

if (!CLAUDE_API_KEY) {
	console.error('\x1b[31mError: CLAUDE_API_KEY environment variable is not set.\x1b[0m');
	console.error('Set it before running the server:');
	console.error('  Windows:  set CLAUDE_API_KEY=your-key-here');
	console.error('  Mac/Linux: export CLAUDE_API_KEY=your-key-here');
	process.exit(1);
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
8. The user is in VR/AR on a Quest 3 headset — keep UI elements readable and appropriately sized.`;

// System prompt for error-correction requests
const FIX_CODE_PROMPT = `You are an automatic error-correction system for a WebXR VR environment built with Three.js.

A vr-exec code block failed to execute. Your job is to fix the code and return ONLY a corrected version.

## Environment

The code runs inside \`new Function('THREE', 'scene', 'camera', 'renderer', 'document', code)\`, so these are the ONLY variables available:
- \`THREE\` — the Three.js library (use THREE.* for all Three.js classes/utilities)
- \`scene\` — THREE.Scene instance
- \`camera\` — THREE.PerspectiveCamera
- \`renderer\` — THREE.WebGLRenderer (XR-enabled)
- \`document\` — the page DOM
- \`window\` — the global window object (use window.* to access/store persistent references)
- \`window._vrAnimations\` — array of per-frame animation callbacks

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
			model: 'claude-sonnet-4-20250514',
			max_tokens: maxTokens,
			temperature: 1,
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

// Proxy endpoint for Claude API
app.post('/api/chat', async (req, res) => {
	try {
		const { messages } = req.body;

		if (!messages || !Array.isArray(messages)) {
			return res.status(400).json({ error: 'Messages array is required' });
		}

		const data = await callClaudeAPI(SYSTEM_PROMPT, messages);

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
		const data = await callClaudeAPI(FIX_CODE_PROMPT, fixMessages, 8192);

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

// Scene save/load endpoints
const SCENE_FILE = join(__dirname, 'saved-scene.vrscene');

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

app.listen(PORT, '0.0.0.0', () => {
	const localIP = getLocalIP();

	console.log('\n\x1b[32m=== Claude VR Chat Server ===\x1b[0m\n');
	console.log(`Local:   http://localhost:${PORT}`);
	console.log(`Network: http://${localIP}:${PORT}`);
	console.log('\n\x1b[36mOpen the Network URL on your Quest 3 browser.\x1b[0m');
	console.log('\x1b[33mNote: Both devices must be on the same WiFi network.\x1b[0m\n');
});
