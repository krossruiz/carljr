import * as THREE from 'three';
import { XRButton } from './threejsAddons/XRButton.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildButtonLayout, drawButtonsToCanvas, hitTestButtons, mountButtonsToDOM } from './menuSystem.js';

// ============================================================================
// Configuration
// ============================================================================
const CHAT_PANEL_WIDTH = 1.2;
const CHAT_PANEL_HEIGHT = 0.8;
const CHAT_PANEL_DISTANCE = 1.5;
const MESSAGE_FONT_SIZE = 24;
const SCROLL_SPEED = 3; // lines per second at full thumbstick deflection
const THUMBSTICK_DEADZONE = 0.15;
const MOVE_SPEED = 1.5;  // metres/second at full left-thumbstick deflection
const TURN_SPEED = 1.8;  // radians/second at full right-thumbstick deflection
const INPUT_PANEL_WIDTH = 1.2;
const INPUT_PANEL_HEIGHT = 0.15;
const INPUT_PANEL_GAP = 0.05;
const KEYBOARD_PANEL_WIDTH = 1.2;
const KEYBOARD_PANEL_HEIGHT = 0.45;
const KEYBOARD_PANEL_GAP = 0.05;
const SIDE_PANEL_WIDTH = 0.3;
const SIDE_PANEL_HEIGHT = 0.8;
const SIDE_PANEL_GAP = 0.06;
const SCENE_PANEL_WIDTH = 0.45;
const SCENE_PANEL_HEIGHT = 0.8;
const SCENE_PANEL_GAP = 0.06;

// ============================================================================
// Scene Setup
// ============================================================================
const appElement = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = null; // transparent for passthrough

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
appElement.appendChild(renderer.domElement);
renderer.setClearColor(0x000000, 0.0);

// Desktop (non-XR) camera controls: orbit/pan/zoom with the mouse. Disabled
// automatically while an XR session is presenting (the headset pose drives
// the camera then) — see setImmersiveUiMode.
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target.set(0, 1.4, -CHAT_PANEL_DISTANCE);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.minDistance = 0.5;
orbitControls.maxDistance = 50;
orbitControls.update();

// ============================================================================
// DOM Elements
// ============================================================================
const overlayRoot = document.getElementById('overlay-root');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const statusElement = document.getElementById('status');
const desktopChat = document.getElementById('desktop-chat');
const desktopChatHeader = document.getElementById('desktop-chat-header');
const desktopChatMessages = document.getElementById('desktop-chat-messages');
const desktopChatInput = document.getElementById('desktop-chat-input');
const desktopSendButton = document.getElementById('desktop-send-button');
const desktopMicButton = document.getElementById('desktop-mic-button');
const desktopAttachButton = document.getElementById('desktop-attach-button');
const desktopAttachInput = document.getElementById('desktop-attach-input');
const desktopAttachmentsRow = document.getElementById('desktop-attachments');
const desktopModelSelect = document.getElementById('desktop-model-select');
const desktopOllamaModelRow = document.getElementById('desktop-ollama-model-row');
const desktopOllamaModelSelect = document.getElementById('desktop-ollama-model-select');
const desktopChatMinimizeBtn = document.getElementById('desktop-chat-minimize');
const desktopChatReopenBtn = document.getElementById('desktop-chat-reopen');
const chatOverlayBar = document.getElementById('chat-overlay');
const dchatEnvModeMount = document.getElementById('dchat-env-mode');
const dchatEnvControls = document.getElementById('dchat-env-controls');
const dchatColorPicker = document.getElementById('dchat-color-picker');
const dchatColorPreview = document.getElementById('dchat-color-preview');
const dchatBrightness = document.getElementById('dchat-brightness');
const dchatResetCameraBtn = document.getElementById('dchat-reset-camera');
const dchatNavType = document.getElementById('dchat-nav-type');
const dchatScenesButtonsMount = document.getElementById('dchat-scenes-buttons');
const dchatSceneList = document.getElementById('dchat-scene-list');
const dchatExportCombinedMount = document.getElementById('dchat-export-combined-mount');
const dchatCommunityButtonsMount = document.getElementById('dchat-community-buttons');
const dchatCommunityList = document.getElementById('dchat-community-list');
const dchatThemesButtonsMount = document.getElementById('dchat-themes-buttons');
const dchatThemesList = document.getElementById('dchat-themes-list');
const dchatThemeChatMessages = document.getElementById('dchat-theme-chat-messages');
const dchatThemeChatInput = document.getElementById('dchat-theme-chat-input');
const dchatThemeChatSend = document.getElementById('dchat-theme-chat-send');
const dchatCodeEditor = document.getElementById('dchat-code-editor');
const dchatCodeLive = document.getElementById('dchat-code-live');
const dchatCodeApply = document.getElementById('dchat-code-apply');
const dchatCodeRevert = document.getElementById('dchat-code-revert');
const dchatCodeStatus = document.getElementById('dchat-code-status');
const dchatCodeHint = document.getElementById('dchat-code-hint');


// ============================================================================
// Shared menu button specs (menuSystem.js) — the single source of truth for
// every button that has to exist in both the desktop DOM menu and the XR
// canvas panels. Add/rename/recolor a button here and both surfaces update:
// desktop mounts these as a live <svg> (mountButtonsToDOM), XR draws the
// exact same boxes onto its canvas texture (drawButtonsToCanvas) and hit-
// tests controller rays against them (hitTestButtons). All click/hit paths
// funnel into handleMenuAction() below, so behavior only needs to be
// written once too.
// ============================================================================
const ENV_MODE_BUTTONS = [
	{ id: 'ar', label: 'AR (passthrough)', action: 'env:ar' },
	{ id: 'vr', label: 'VR (color)', action: 'env:vr' }
];
const SCENES_BUTTONS = [
	{ id: 'export', label: 'Export', action: 'scenes:export', variant: 'accent' },
	{ id: 'importFile', label: 'Import File', action: 'scenes:importFile' },
	{ id: 'importFolder', label: 'Import Folder', action: 'scenes:importFolder' },
	{ id: 'loadSaved', label: 'Load Saved', action: 'scenes:loadSaved', variant: 'success' }
];
const EXPORT_COMBINED_BUTTON = [
	{ id: 'exportCombined', label: 'Export Combined', action: 'scenes:exportCombined', variant: 'warning' }
];
const COMMUNITY_BUTTONS = [
	{ id: 'upload', label: 'Upload Current Scene', action: 'community:upload', variant: 'accent' },
	{ id: 'refresh', label: 'Refresh', action: 'community:refresh' }
];
const THEME_BUTTONS = [
	{ id: 'uploadTheme', label: 'Upload Current Theme', action: 'themes:upload', variant: 'accent' },
	{ id: 'refreshThemes', label: 'Refresh', action: 'themes:refresh' },
	{ id: 'resetTheme', label: 'Reset Default', action: 'themes:reset' }
];
// Mini in-panel tabs drawn at the top of the XR scene panel, since it has
// no separate mesh for Community (unlike desktop's tab bar) - see
// SCENE_PANEL_SUB_TABS usage in renderScenePanel()/handleScenePanelHit().
// Themes is desktop-primary (theme chat + apply); XR gets Apply list only.
const SCENE_PANEL_SUB_TABS = [
	{ id: 'scenes', label: 'Scenes', action: 'panel:scenes' },
	{ id: 'community', label: 'Community', action: 'panel:community' },
	{ id: 'themes', label: 'Themes', action: 'panel:themes' }
];

// Routes both a desktop SVG click and an XR controller-ray/touch hit to the
// same behavior, so the behavior itself is written exactly once.
function handleMenuAction(action) {
	switch (action) {
		case 'env:ar':
			isVRMode = false;
			applyEnvironmentMode();
			renderSidePanel();
			renderDomEnv();
			break;
		case 'env:vr':
			isVRMode = true;
			applyEnvironmentMode();
			renderSidePanel();
			renderDomEnv();
			break;
		case 'scenes:export':
			showExportModal(false);
			break;
		case 'scenes:importFile':
			fileInput.click();
			break;
		case 'scenes:importFolder':
			folderInput.click();
			break;
		case 'scenes:loadSaved':
			loadSceneFromServer();
			break;
		case 'scenes:exportCombined':
			if ((loadedScenes.some(s => s.active) || executedCodeBlocks.length > 0) && loadedScenes.length > 0) {
				showExportModal(true);
			}
			break;
		case 'community:upload':
			uploadCurrentSceneToCommunity();
			break;
		case 'community:refresh':
			refreshCommunityScenes();
			break;
		case 'themes:upload':
			uploadCurrentThemeToCommunity();
			break;
		case 'themes:refresh':
			refreshCommunityThemes();
			break;
		case 'themes:reset':
			applyTheme(DEFAULT_THEME, { announce: true });
			break;
		case 'panel:scenes':
			scenePanelSubTab = 'scenes';
			renderScenePanel();
			break;
		case 'panel:community':
			scenePanelSubTab = 'community';
			refreshCommunityScenes();
			break;
		case 'panel:themes':
			scenePanelSubTab = 'themes';
			refreshCommunityThemes();
			break;
	}
}

// ============================================================================
// State
// ============================================================================
let messages = [];       // Full messages for API context (includes raw code blocks)
let displayMessages = []; // Cleaned messages for canvas display
let isLoading = false;
let selectedBackend = null; // 'claude' | 'fable' | 'openai' | 'ollama' - set once /api/backends resolves
let selectedOllamaModel = null; // e.g. 'llama3.2:latest' - set once the Ollama model list loads
let cachedPrompts = null; // { systemPrompt, fixCodePrompt, themePrompt } - fetched once from /api/prompts
let pendingAttachments = []; // files staged via the 📎 button, sent with the next message - see buildUserContent()

// Ollama always runs on the SAME machine as the browser (this is what makes
// it "local"), regardless of whether this page itself was loaded from
// Vercel or from `python run.py`. So instead of proxying through this app's
// own server (which, when deployed, has no network path to the visitor's
// laptop at all), the browser talks to the user's Ollama directly.
//
// This only actually works when THIS PAGE is also served from localhost
// (i.e. via `python run.py`, not the hosted Vercel site). Reaching a
// loopback address (127.0.0.1/localhost) from a page loaded off a public
// origin is blocked by the browser's Private Network Access policy - unlike
// ordinary CORS, this can't be opted into via Ollama's OLLAMA_ORIGINS
// setting (Ollama doesn't send the special Access-Control-Allow-Private-
// Network response header the preflight requires), so the request just
// hangs/never resolves rather than failing fast. Confirmed empirically:
// identical fetch from https://localhost:PORT succeeds instantly, the same
// fetch from the hosted Vercel origin never settles at all.
const OLLAMA_BASE_URL = 'http://localhost:11434';
const IS_LOCAL_PAGE = ['localhost', '127.0.0.1'].includes(location.hostname);
const OLLAMA_UNAVAILABLE_HOSTED_MSG =
	'Ollama only works when this app is run locally, not from the hosted site: browsers block a ' +
	'public page like this one from reaching a service on your own machine (Private Network Access) - ' +
	'this is a browser security rule, not something Ollama\'s settings can override. Run `python run.py` ' +
	'locally to use Ollama models.';

function fetchWithTimeout(url, options, ms) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function listOllamaModels() {
	if (!IS_LOCAL_PAGE) throw new Error(OLLAMA_UNAVAILABLE_HOSTED_MSG);
	let res;
	try {
		res = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/tags`, {}, 4000);
	} catch (e) {
		throw new Error(`Could not reach Ollama at ${OLLAMA_BASE_URL}. Make sure Ollama is running.`);
	}
	if (!res.ok) throw new Error(`Ollama responded with ${res.status}`);
	const data = await res.json();
	return (data.models || []).map(m => m.name);
}

// Calls Ollama directly from the browser and normalizes the response into
// the same { content: [{ text }] } shape the rest of the chat code expects
// from the server-proxied backends.
async function callOllamaDirect(systemPrompt, chatMessages, model, maxTokens = 16384) {
	if (!IS_LOCAL_PAGE) throw new Error(OLLAMA_UNAVAILABLE_HOSTED_MSG);
	if (!model) throw new Error('No Ollama model selected.');
	let res;
	try {
		res = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				stream: false,
				options: { num_predict: maxTokens },
				messages: [{ role: 'system', content: systemPrompt }, ...chatMessages]
			})
		}, 120000); // generous - local inference can be slow, especially cold-loading a model
	} catch (networkErr) {
		throw new Error(`Could not reach Ollama at ${OLLAMA_BASE_URL}. Make sure Ollama is running.`);
	}
	const text = await res.text();
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error(`Ollama returned non-JSON (${res.status}): ${text.slice(0, 150)}`);
	}
	if (!res.ok) throw new Error(data.error || `Ollama error: ${res.status}`);
	return { content: [{ text: data.message?.content || '' }] };
}
let chatPanel = null;
let chatTexture = null;
let chatCanvas = null;
let chatContext = null;
let inputPanel = null;
let inputTexture = null;
let inputCanvas = null;
let inputContext = null;
let inputText = '';
let keyboardPanel = null;
let keyboardTexture = null;
let keyboardCanvas = null;
let keyboardContext = null;
let keyboardShift = false;    // uppercase next character key
let keyboardSymbols = false;  // symbol layer toggled on
let keyboardKeyRects = [];    // hit rectangles: { x, y, w, h, value, action }
let keyboardCollapsed = false; // keyboard hidden to free up the view
let keyboardHoverIndex = -1;  // index into keyboardKeyRects the pointer is over
let rayVisible = true;        // controller ray lines shown (cursor always shows)
let hudStatusPanel = null;    // head-locked status badge (mirrors DOM #status)
let hudStatusCanvas = null;
let hudStatusContext = null;
let hudStatusTexture = null;
let uiCollapsed = false;      // all main panels hidden for an unobstructed scene
let uiTogglePanel = null;     // head-locked Hide/Show-UI button (never collapses)
let uiToggleCanvas = null;
let uiToggleContext = null;
let uiToggleTexture = null;
let player = null;            // rig holding the camera + controllers (locomotion)
let locomotionMode = 'free';  // 'off' (thumbsticks scroll) | 'planar' (First Person) | 'free' (WASD) - see dchat-nav-type
let _locoPrevTime = 0;        // previous frame timestamp for dt

// Speech-to-text (in-browser Whisper via transformers.js — cross-platform)
let speechSupported = false;   // getUserMedia + MediaRecorder available
let micMode = 'off';           // 'off' | 'always' | 'ptt'
let pttHand = null;            // handedness that started push-to-talk
let sttPipelinePromise = null; // lazy-loaded Whisper ASR pipeline (Promise)
let sttModelReady = false;     // model finished loading at least once
let micStream = null;          // active getUserMedia MediaStream
let mediaRecorder = null;      // MediaRecorder for the current utterance
let recordedChunks = [];       // audio blobs for the current utterance
let sttBusy = false;           // a transcription is in flight
let vadContext = null;         // AudioContext used for voice-activity detection
let vadAnalyser = null;        // AnalyserNode sampled each frame from the XR loop
let vadData = null;            // reusable Float32Array for analyser samples
let vadSpeaking = false;       // VAD currently hears speech
let vadSilenceMs = 0;          // ms of trailing silence after speech
let vadLastTime = 0;           // timestamp of last VAD tick
let chatScrollOffset = 0; // in lines, 0 = scrolled to bottom (newest)
let sidePanel = null;
let sideTexture = null;
let sideCanvas = null;
let sideContext = null;
let isVRMode = false;
let vrBgHue = 220;       // 0-360
let vrBgSat = 0.15;      // 0-1
let vrBgLight = 0.12;    // 0-1
let vrSkybox = null;     // inverted sphere to block passthrough in VR mode
let scenePanel = null;
let sceneTexture = null;
let sceneCanvas = null;
let sceneContext = null;
let executedCodeBlocks = [];  // vr-exec code blocks from current chat session
let loadedScenes = [];        // imported scene files: { id, name, thumbnail, codeBlocks, active, createdAt, _thumbImage }
let sceneScrollOffset = 0;
let sceneFileExtension = 'vrscene';
let scenePanelSubTab = 'scenes'; // 'scenes' | 'community' | 'themes' - see SCENE_PANEL_SUB_TABS
let communityScenesCache = []; // last-fetched list, so the XR panel has something to draw without re-fetching every frame
let communityThemesCache = [];
let communitySection = 'scenes'; // desktop Community tab: 'scenes' | 'themes'
let displayOnlyMode = false; // share URL opened with editor chrome stripped
let pendingShare = null; // share modal payload { id, name, editorUrl, viewUrl }
let codeEditorDirty = false; // user has unsaved edits in Code tab
let codeEditorApplying = false;
let codeEditorLiveTimer = null;
let codeEditorLastApplied = ''; // last successfully applied / synced source
const CODE_EDITOR_LIVE_DEBOUNCE_MS = 500;

let pendingRename = null;
let pendingRenameKind = 'scene'; // 'scene' | 'theme'
let currentTheme = null; // last applied theme object { name, cssVars, customCSS }
let themeChatMessages = []; // API context for /api/theme-chat
let themeChatLoading = false;
// Button hitboxes from the most recent draw of each canvas panel, reused
// by handleSidePanelHit/handleScenePanelHit (see menuSystem.js hitTestButtons).
let sidePanelEnvButtonBoxes = [];
let scenePanelButtonBoxes = [];
let scenePanelSubTabBoxes = [];
let scenePanelListTop = 0; // set by renderScenePanel, reused by handleScenePanelHit
let systemObjectIds = new Set();
let systemOverlayIds = new Set();

// ============================================================================
// Expose globals for vr-exec code injection
// ============================================================================
window.THREE = THREE;
window.scene = scene;
window.camera = camera;
window.renderer = renderer;
window._vrAnimations = [];

// Head-locked anchor for HUD elements the user *explicitly* asks to follow them.
// It is a child of the camera, so its origin matches the camera's translation.
const hud = new THREE.Group();
hud.name = 'hud';
camera.add(hud);

// Player rig ("dolly"): the camera (and, later, the controllers) ride inside it.
// Moving/rotating this group is the WebXR-correct way to move the user — three.js
// composes the rig's transform with the live headset pose. The camera must be in
// the scene graph for the HUD's children to render, which it now is via `player`.
player = new THREE.Group();
player.name = 'player';
player.add(camera);
scene.add(player);

window.hud = hud;

// ============================================================================
// XR Button Setup — AR passthrough on Quest standalone, plain VR fallback
// for PCVR headsets over Link/Air Link/SteamVR (Quest 3 via Link, Index,
// Vive, WMR, ...) that don't expose passthrough to the browser.
// ============================================================================
document.body.appendChild(
	XRButton.createButton(renderer, {
		optionalFeatures: ['hit-test', 'dom-overlay'],
		domOverlay: { root: overlayRoot }
	})
);

// ============================================================================
// Mobile pseudo-XR: Google Cardboard (stereo + gyro) and AR-camera
// passthrough (camera feed + gyro), for phones that can't do real OpenXR -
// iPhone Safari has no WebXR at all, and plenty of Android browsers/devices
// don't support immersive-vr/ar either. Neither mode gets real 6DOF
// position tracking (no SLAM) - the gyro drives look direction and the
// existing locomotion system (see applyLocomotionInput) drives "walking",
// triggered here by a hold-to-walk button instead of a thumbstick/keyboard.
// ============================================================================
let mobileXRMode = null; // null | 'cardboard' | 'ar'
let mobileMoveHeld = false;
let arVideoStream = null;
const stereoCam = new THREE.StereoCamera();
stereoCam.eyeSep = 0.064; // average human interpupillary distance, metres

const cardboardBtn = document.getElementById('cardboard-btn');
const arCameraBtn = document.getElementById('ar-camera-btn');
const mobileXRExitBtn = document.getElementById('mobile-xr-exit');
const mobileXRWalkBtn = document.getElementById('mobile-xr-walk');
const arVideoEl = document.getElementById('ar-camera-feed');

const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Shows Cardboard when no OpenXR VR/AR session type is available at all, and
// AR-camera whenever real WebXR AR isn't (which is always, on iOS).
async function refreshMobileXRButtons() {
	if (!isMobileUA || mobileXRMode) {
		cardboardBtn.hidden = true;
		arCameraBtn.hidden = true;
		return;
	}
	let arOk = false, vrOk = false;
	if ('xr' in navigator) {
		try { arOk = await navigator.xr.isSessionSupported('immersive-ar'); } catch { /* unsupported */ }
		try { vrOk = await navigator.xr.isSessionSupported('immersive-vr'); } catch { /* unsupported */ }
	}
	cardboardBtn.hidden = arOk || vrOk;
	arCameraBtn.hidden = arOk;
}
refreshMobileXRButtons();

// --- Device orientation → camera rotation (standard three.js algorithm) ---
const _doZee = new THREE.Vector3(0, 0, 1);
const _doEuler = new THREE.Euler();
const _doQ0 = new THREE.Quaternion();
const _doQ1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 around X
let _doAlpha = 0, _doBeta = 0, _doGamma = 0, _doOrient = 0;

function onDeviceOrientation(e) {
	_doAlpha = THREE.MathUtils.degToRad(e.alpha || 0);
	_doBeta = THREE.MathUtils.degToRad(e.beta || 0);
	_doGamma = THREE.MathUtils.degToRad(e.gamma || 0);
}
function onScreenOrientationChange() {
	_doOrient = (screen.orientation && typeof screen.orientation.angle === 'number')
		? THREE.MathUtils.degToRad(screen.orientation.angle)
		: 0;
}
function updateCameraFromDeviceOrientation() {
	_doEuler.set(_doBeta, _doAlpha, -_doGamma, 'YXZ');
	camera.quaternion.setFromEuler(_doEuler);
	camera.quaternion.multiply(_doQ1);
	camera.quaternion.multiply(_doQ0.setFromAxisAngle(_doZee, -_doOrient));
}

// iOS 13+ requires an explicit user-gesture-triggered permission prompt for
// motion/orientation events; every other platform just works.
async function requestDeviceOrientationPermission() {
	if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
		try {
			return (await DeviceOrientationEvent.requestPermission()) === 'granted';
		} catch (err) {
			console.error('Device orientation permission error:', err);
			return false;
		}
	}
	return true;
}

async function enterMobileXRMode(mode) {
	const granted = await requestDeviceOrientationPermission();
	if (!granted) {
		updateStatus('Motion access denied - needed to look around', 'error');
		return;
	}

	if (mode === 'ar') {
		try {
			arVideoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
		} catch (err) {
			updateStatus(`Camera access error: ${err.message}`, 'error');
			return;
		}
		arVideoEl.srcObject = arVideoStream;
		await arVideoEl.play().catch(() => {});
		arVideoEl.classList.add('active');
		// Renderer clear alpha is already 0 globally (see setClearColor at the
		// top of this file) so the transparent canvas shows the video behind
		// it - same trick used for real WebXR AR passthrough.
		isVRMode = false;
	} else {
		isVRMode = true;
	}

	window.addEventListener('deviceorientation', onDeviceOrientation);
	window.addEventListener('orientationchange', onScreenOrientationChange);
	onScreenOrientationChange();

	try { await document.documentElement.requestFullscreen(); } catch { /* best-effort */ }
	if (mode === 'cardboard' && screen.orientation && screen.orientation.lock) {
		try { await screen.orientation.lock('landscape'); } catch { /* not all browsers allow this */ }
	}

	orbitControls.enabled = false;
	mobileXRMode = mode;
	cardboardBtn.hidden = true;
	arCameraBtn.hidden = true;
	mobileXRExitBtn.hidden = false;
	mobileXRWalkBtn.hidden = false;
	applyEnvironmentMode();
	renderDomEnv();
	updateStatus(mode === 'cardboard' ? 'Cardboard VR active' : 'AR mode active', 'connected');
}

function exitMobileXRMode() {
	if (!mobileXRMode) return;

	window.removeEventListener('deviceorientation', onDeviceOrientation);
	window.removeEventListener('orientationchange', onScreenOrientationChange);

	if (arVideoStream) {
		for (const track of arVideoStream.getTracks()) track.stop();
		arVideoStream = null;
	}
	arVideoEl.classList.remove('active');
	arVideoEl.srcObject = null;

	if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
	if (screen.orientation && screen.orientation.unlock) {
		try { screen.orientation.unlock(); } catch { /* ignore */ }
	}

	orbitControls.enabled = true;
	mobileXRMode = null;
	mobileMoveHeld = false;
	mobileXRExitBtn.hidden = true;
	mobileXRWalkBtn.hidden = true;
	isVRMode = false;
	applyEnvironmentMode();
	renderDomEnv();
	updateStatus('Ready', '');
	refreshMobileXRButtons();
}

cardboardBtn.addEventListener('click', () => enterMobileXRMode('cardboard'));
arCameraBtn.addEventListener('click', () => enterMobileXRMode('ar'));
mobileXRExitBtn.addEventListener('click', exitMobileXRMode);

// touchstart/touchend (mobile) and mousedown/mouseup (desktop testing) both
// wired so this works whether it's a real touchscreen or a mouse.
mobileXRWalkBtn.addEventListener('touchstart', (e) => { e.preventDefault(); mobileMoveHeld = true; });
mobileXRWalkBtn.addEventListener('touchend', (e) => { e.preventDefault(); mobileMoveHeld = false; });
mobileXRWalkBtn.addEventListener('touchcancel', (e) => { e.preventDefault(); mobileMoveHeld = false; });
mobileXRWalkBtn.addEventListener('mousedown', () => { mobileMoveHeld = true; });
mobileXRWalkBtn.addEventListener('mouseup', () => { mobileMoveHeld = false; });
mobileXRWalkBtn.addEventListener('mouseleave', () => { mobileMoveHeld = false; });

// ============================================================================
// Lighting
// ============================================================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(0, 2, 1);
scene.add(directionalLight);

// VR skybox: large inverted sphere to block passthrough when in VR mode
const skyboxGeo = new THREE.SphereGeometry(50, 32, 16);
const skyboxMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x1a1a2e });
vrSkybox = new THREE.Mesh(skyboxGeo, skyboxMat);
vrSkybox.visible = false;
scene.add(vrSkybox);

// ============================================================================
// Chat Panel (3D Canvas Texture)
// ============================================================================
function createChatPanel() {
	// Create canvas for rendering text
	chatCanvas = document.createElement('canvas');
	chatCanvas.width = 1024;
	chatCanvas.height = 768;
	chatContext = chatCanvas.getContext('2d');

	// Create texture from canvas
	chatTexture = new THREE.CanvasTexture(chatCanvas);
	chatTexture.minFilter = THREE.LinearFilter;
	chatTexture.magFilter = THREE.LinearFilter;

	// Create panel geometry and material
	const geometry = new THREE.PlaneGeometry(CHAT_PANEL_WIDTH, CHAT_PANEL_HEIGHT);
	const material = new THREE.MeshBasicMaterial({
		map: chatTexture,
		transparent: true,
		side: THREE.DoubleSide
	});

	chatPanel = new THREE.Mesh(geometry, material);
	chatPanel.position.set(0, 1.4, -CHAT_PANEL_DISTANCE);
	scene.add(chatPanel);

	// Initial render
	renderChatToCanvas();
}

function renderChatToCanvas() {
	renderDomChat();
	if (!chatContext) return;

	const ctx = chatContext;
	const width = chatCanvas.width;
	const height = chatCanvas.height;
	const lineHeight = 36;
	const padding = 30;
	const maxWidth = width - padding * 2;
	const headerHeight = 60;
	const contentTop = headerHeight + 40; // first line Y
	const contentBottom = height - 20;
	const visibleLineCount = Math.floor((contentBottom - contentTop) / lineHeight);

	// Build all lines from all messages (no limit)
	ctx.font = `${MESSAGE_FONT_SIZE}px -apple-system, BlinkMacSystemFont, sans-serif`;
	const allLines = []; // { text, color, font }
	for (const msg of displayMessages) {
		const isUser = msg.role === 'user';
		// Role header line
		allLines.push({
			text: isUser ? 'You' : 'Claude',
			color: isUser ? '#6366f1' : '#10b981',
			font: `bold ${MESSAGE_FONT_SIZE - 4}px -apple-system, BlinkMacSystemFont, sans-serif`,
			heightScale: 0.7
		});
		// Wrapped message lines
		const wrapped = wrapText(ctx, msg.content, maxWidth);
		for (const line of wrapped) {
			allLines.push({
				text: line,
				color: '#e0e0e0',
				font: `${MESSAGE_FONT_SIZE}px -apple-system, BlinkMacSystemFont, sans-serif`,
				heightScale: 1.0
			});
		}
		// Spacing after message
		allLines.push({ text: '', color: '', font: '', heightScale: 0.5 });
	}

	if (isLoading) {
		allLines.push({
			text: 'Claude is thinking...',
			color: '#8b5cf6',
			font: `italic ${MESSAGE_FONT_SIZE}px -apple-system, BlinkMacSystemFont, sans-serif`,
			heightScale: 1.0
		});
	}

	// Clamp scroll offset: 0 = bottom (newest visible), max = scrolled to top
	const totalLines = allLines.length;
	const maxScroll = Math.max(0, totalLines - visibleLineCount);
	chatScrollOffset = Math.max(0, Math.min(chatScrollOffset, maxScroll));

	// Determine which lines to show: start from bottom by default
	const bottomIndex = totalLines - chatScrollOffset;
	const topIndex = Math.max(0, bottomIndex - visibleLineCount);

	// Clear and draw background
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = 'rgba(20, 20, 30, 0.92)';
	roundRect(ctx, 0, 0, width, height, 24);
	ctx.fill();

	// Draw header
	ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
	roundRect(ctx, 0, 0, width, headerHeight, 24, true);
	ctx.fill();

	ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'center';
	ctx.fillText('Claude Chat', width / 2, 40);

	// Draw scroll indicator if there's content above
	if (chatScrollOffset < maxScroll) {
		ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
		ctx.font = '18px sans-serif';
		ctx.fillText('\u25B2 scroll up', width / 2, headerHeight + 20);
	}

	// Draw visible lines
	ctx.textAlign = 'left';
	let y = contentTop;
	for (let i = topIndex; i < bottomIndex && i < totalLines; i++) {
		const line = allLines[i];
		if (!line.text) {
			y += lineHeight * line.heightScale;
			continue;
		}
		if (y > contentBottom) break;
		ctx.font = line.font;
		ctx.fillStyle = line.color;
		ctx.fillText(line.text, padding, y);
		y += lineHeight * line.heightScale;
	}

	// Draw scroll indicator if there's content below
	if (chatScrollOffset > 0) {
		ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
		ctx.font = '18px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText('\u25BC scroll down', width / 2, height - 8);
		ctx.textAlign = 'left';
	}

	// Scrollbar track
	if (maxScroll > 0) {
		const trackX = width - 14;
		const trackTop = headerHeight + 4;
		const trackHeight = height - headerHeight - 8;
		ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
		roundRect(ctx, trackX, trackTop, 8, trackHeight, 4);
		ctx.fill();

		// Scrollbar thumb
		const thumbRatio = visibleLineCount / totalLines;
		const thumbHeight = Math.max(20, trackHeight * thumbRatio);
		const scrollRatio = maxScroll > 0 ? (maxScroll - chatScrollOffset) / maxScroll : 0;
		const thumbY = trackTop + scrollRatio * (trackHeight - thumbHeight);
		ctx.fillStyle = 'rgba(99, 102, 241, 0.5)';
		roundRect(ctx, trackX, thumbY, 8, thumbHeight, 4);
		ctx.fill();
	}

	chatTexture.needsUpdate = true;
}

// Renders the same message list into the desktop (non-XR) DOM chat window.
function renderDomChat() {
	if (!desktopChatMessages) return;

	desktopChatMessages.innerHTML = '';
	for (const msg of displayMessages) {
		const bubble = document.createElement('div');
		bubble.className = 'dchat-msg ' + (msg.role === 'user' ? 'user' : 'assistant');
		bubble.textContent = msg.content;
		desktopChatMessages.appendChild(bubble);
	}
	if (isLoading) {
		const thinking = document.createElement('div');
		thinking.className = 'dchat-msg thinking';
		thinking.textContent = 'Claude is thinking...';
		desktopChatMessages.appendChild(thinking);
	}
	desktopChatMessages.scrollTop = desktopChatMessages.scrollHeight;
}

function wrapText(ctx, text, maxWidth) {
	const words = text.split(' ');
	const lines = [];
	let currentLine = '';

	for (const word of words) {
		const testLine = currentLine + (currentLine ? ' ' : '') + word;
		const metrics = ctx.measureText(testLine);

		if (metrics.width > maxWidth && currentLine) {
			lines.push(currentLine);
			currentLine = word;
		} else {
			currentLine = testLine;
		}
	}

	if (currentLine) {
		lines.push(currentLine);
	}

	return lines; // no line limit — full message displayed
}

function roundRect(ctx, x, y, w, h, r, topOnly = false) {
	ctx.beginPath();
	if (topOnly) {
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + r);
		ctx.lineTo(x + w, y + h);
		ctx.lineTo(x, y + h);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
	} else {
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + r);
		ctx.lineTo(x + w, y + h - r);
		ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
		ctx.lineTo(x + r, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
	}
	ctx.closePath();
}

// ============================================================================
// 3D Input Panel (for XR text input)
// ============================================================================
function createInputPanel() {
	inputCanvas = document.createElement('canvas');
	inputCanvas.width = 1024;
	inputCanvas.height = 128;
	inputContext = inputCanvas.getContext('2d');

	inputTexture = new THREE.CanvasTexture(inputCanvas);
	inputTexture.minFilter = THREE.LinearFilter;
	inputTexture.magFilter = THREE.LinearFilter;

	const geometry = new THREE.PlaneGeometry(INPUT_PANEL_WIDTH, INPUT_PANEL_HEIGHT);
	const material = new THREE.MeshBasicMaterial({
		map: inputTexture,
		transparent: true,
		side: THREE.DoubleSide
	});

	inputPanel = new THREE.Mesh(geometry, material);
	// Position below chat panel
	const inputY = 1.4 - CHAT_PANEL_HEIGHT / 2 - INPUT_PANEL_GAP - INPUT_PANEL_HEIGHT / 2;
	inputPanel.position.set(0, inputY, -CHAT_PANEL_DISTANCE);
	scene.add(inputPanel);

	renderInputToCanvas();
}

// Shared geometry for the input panel's buttons so rendering and hit-testing
// stay in sync. Layout, left to right: [input area][MIC][KEYS][Send].
function inputPanelLayout() {
	const W = inputCanvas ? inputCanvas.width : 1024;
	const H = inputCanvas ? inputCanvas.height : 128;
	const pad = 12, gap = 8;
	const sendW = 150, kbdW = 100, micW = 100;
	const sendX = W - pad - sendW;
	const kbdX = sendX - gap - kbdW;
	const micX = kbdX - gap - micW;
	const inputAreaX = pad;
	const inputAreaW = micX - gap - inputAreaX;
	return { W, H, pad, gap, sendW, kbdW, micW, sendX, kbdX, micX, inputAreaX, inputAreaW };
}

function renderInputToCanvas() {
	if (!inputContext) return;

	const ctx = inputContext;
	const width = inputCanvas.width;
	const height = inputCanvas.height;

	ctx.clearRect(0, 0, width, height);

	// Background
	ctx.fillStyle = 'rgba(30, 30, 40, 0.95)';
	roundRect(ctx, 0, 0, width, height, 20);
	ctx.fill();

	const L = inputPanelLayout();

	// Input area background
	ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
	roundRect(ctx, L.inputAreaX, 12, L.inputAreaW, height - 24, 12);
	ctx.fill();

	// Input text or placeholder
	ctx.font = '24px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.textAlign = 'left';
	if (inputText) {
		ctx.fillStyle = '#ffffff';
		let displayText = inputText;
		while (ctx.measureText(displayText + '|').width > L.inputAreaW - 32 && displayText.length > 0) {
			displayText = displayText.slice(1);
		}
		ctx.fillText(displayText + '|', L.inputAreaX + 12, height / 2 + 8);
	} else {
		ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
		ctx.fillText('Ask Claude something...', L.inputAreaX + 12, height / 2 + 8);
	}

	ctx.textAlign = 'center';
	ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, sans-serif';

	// Mic button — red while listening (always-on or push-to-talk)
	const micListening = micMode !== 'off';
	ctx.fillStyle = micListening ? '#ef4444' : 'rgba(90, 92, 120, 0.9)';
	roundRect(ctx, L.micX, 12, L.micW, height - 24, 12);
	ctx.fill();
	ctx.fillStyle = '#ffffff';
	ctx.fillText('MIC', L.micX + L.micW / 2, height / 2 + 8);

	// Keyboard show/hide button — indigo when the keyboard is showing
	ctx.fillStyle = keyboardCollapsed ? 'rgba(90, 92, 120, 0.9)' : '#6366f1';
	roundRect(ctx, L.kbdX, 12, L.kbdW, height - 24, 12);
	ctx.fill();
	ctx.fillStyle = '#ffffff';
	ctx.fillText('KEYS', L.kbdX + L.kbdW / 2, height / 2 + 8);

	// Send button
	const gradient = ctx.createLinearGradient(L.sendX, 0, L.sendX + L.sendW, height);
	gradient.addColorStop(0, '#6366f1');
	gradient.addColorStop(1, '#8b5cf6');
	ctx.fillStyle = gradient;
	roundRect(ctx, L.sendX, 12, L.sendW, height - 24, 12);
	ctx.fill();
	ctx.fillStyle = '#ffffff';
	ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.fillText('Send', L.sendX + L.sendW / 2, height / 2 + 8);
	ctx.textAlign = 'left';

	inputTexture.needsUpdate = true;
}

// ============================================================================
// 3D Virtual Keyboard (in-scene text entry for XR)
// ============================================================================
// Text is entered entirely in-scene: the controller raycast presses keys and we
// mutate `inputText` directly. We never focus the DOM input in XR, so the crashy
// Quest system keyboard is never summoned.
//
// Each row is laid out left-to-right; a key's `w` is a relative width weight. A
// plain string is a character key; an object declares a control key or a char key
// with a custom label.
const KB_ROWS_LETTERS = [
	['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
	['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
	['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
	[{ label: '⇧', action: 'shift', w: 1.5 }, 'z', 'x', 'c', 'v', 'b', 'n', 'm', { label: '⌫', action: 'backspace', w: 1.5 }],
	[{ label: '?123', action: 'symbols', w: 2 }, { label: 'space', action: 'space', w: 5 }, '.', { label: 'Send', action: 'enter', w: 2 }]
];
const KB_ROWS_SYMBOLS = [
	['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
	['!', '@', '#', '$', '%', '&', '*', '(', ')', '/'],
	['-', '_', '=', '+', ':', ';', ',', '?', '\''],
	[{ label: '"', action: 'char' }, '[', ']', '{', '}', '<', '>', '~', { label: '⌫', action: 'backspace', w: 1.5 }],
	[{ label: 'abc', action: 'symbols', w: 2 }, { label: 'space', action: 'space', w: 5 }, '.', { label: 'Send', action: 'enter', w: 2 }]
];

function normalizeKey(key) {
	if (typeof key === 'string') {
		return { label: key, value: key, action: 'char', w: 1 };
	}
	return {
		label: key.label,
		value: key.value !== undefined ? key.value : key.label,
		action: key.action || 'char',
		w: key.w || 1
	};
}

function createKeyboardPanel() {
	keyboardCanvas = document.createElement('canvas');
	keyboardCanvas.width = 1024;
	keyboardCanvas.height = 384;
	keyboardContext = keyboardCanvas.getContext('2d');

	keyboardTexture = new THREE.CanvasTexture(keyboardCanvas);
	keyboardTexture.minFilter = THREE.LinearFilter;
	keyboardTexture.magFilter = THREE.LinearFilter;

	const geometry = new THREE.PlaneGeometry(KEYBOARD_PANEL_WIDTH, KEYBOARD_PANEL_HEIGHT);
	const material = new THREE.MeshBasicMaterial({
		map: keyboardTexture,
		transparent: true,
		side: THREE.DoubleSide
	});

	keyboardPanel = new THREE.Mesh(geometry, material);
	const inputY = 1.4 - CHAT_PANEL_HEIGHT / 2 - INPUT_PANEL_GAP - INPUT_PANEL_HEIGHT / 2;
	const kbY = inputY - INPUT_PANEL_HEIGHT / 2 - KEYBOARD_PANEL_GAP - KEYBOARD_PANEL_HEIGHT / 2;
	keyboardPanel.position.set(0, kbY, -CHAT_PANEL_DISTANCE);
	scene.add(keyboardPanel);

	renderKeyboardToCanvas();
}

function renderKeyboardToCanvas() {
	if (!keyboardContext) return;

	const ctx = keyboardContext;
	const W = keyboardCanvas.width;
	const H = keyboardCanvas.height;
	const pad = 12;
	const gap = 8;

	ctx.clearRect(0, 0, W, H);
	ctx.fillStyle = 'rgba(30, 30, 40, 0.95)';
	roundRect(ctx, 0, 0, W, H, 20);
	ctx.fill();

	const rows = keyboardSymbols ? KB_ROWS_SYMBOLS : KB_ROWS_LETTERS;
	keyboardKeyRects = [];

	const rowH = (H - pad * 2 - gap * (rows.length - 1)) / rows.length;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	for (let r = 0; r < rows.length; r++) {
		const keys = rows[r].map(normalizeKey);
		const totalWeight = keys.reduce((s, k) => s + k.w, 0);
		const usableW = W - pad * 2 - gap * (keys.length - 1);
		const unit = usableW / totalWeight;
		const y = pad + r * (rowH + gap);
		let x = pad;

		for (const k of keys) {
			const w = k.w * unit;
			const idx = keyboardKeyRects.length; // this key's index once pushed below

			// Key background: control keys get a solid tint, char keys a faint fill.
			if (k.action === 'enter') {
				const g = ctx.createLinearGradient(x, y, x + w, y + rowH);
				g.addColorStop(0, '#6366f1');
				g.addColorStop(1, '#8b5cf6');
				ctx.fillStyle = g;
			} else if (k.action === 'shift' && keyboardShift) {
				ctx.fillStyle = '#6366f1';
			} else if (k.action !== 'char' && k.action !== 'space') {
				ctx.fillStyle = 'rgba(90, 92, 120, 0.9)';
			} else {
				ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
			}
			roundRect(ctx, x, y, w, rowH, 10);
			ctx.fill();

			// Hover highlight: brighten the key the pointer is currently over.
			if (idx === keyboardHoverIndex) {
				ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
				roundRect(ctx, x, y, w, rowH, 10);
				ctx.fill();
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 3;
				roundRect(ctx, x + 1.5, y + 1.5, w - 3, rowH - 3, 9);
				ctx.stroke();
			}

			// Label
			ctx.fillStyle = '#ffffff';
			ctx.font = (k.action === 'enter' ? 'bold ' : '') + '30px -apple-system, BlinkMacSystemFont, sans-serif';
			let label = k.label;
			if (k.action === 'char' && keyboardShift && /^[a-z]$/.test(label)) {
				label = label.toUpperCase();
			}
			ctx.fillText(label, x + w / 2, y + rowH / 2 + 1);

			keyboardKeyRects.push({ x, y, w, h: rowH, value: k.value, action: k.action });
			x += w + gap;
		}
	}

	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	keyboardTexture.needsUpdate = true;
}

function keyIndexAtUV(uv) {
	const cx = uv.x * keyboardCanvas.width;
	const cy = (1 - uv.y) * keyboardCanvas.height; // UV y is flipped vs canvas y
	for (let i = 0; i < keyboardKeyRects.length; i++) {
		const r = keyboardKeyRects[i];
		if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return i;
	}
	return -1;
}

// Update which key is highlighted; only re-render the canvas when it changes.
function setKeyboardHover(index) {
	if (index === keyboardHoverIndex) return;
	keyboardHoverIndex = index;
	renderKeyboardToCanvas();
}

function handleKeyboardHit(uv) {
	const idx = keyIndexAtUV(uv);
	if (idx >= 0) dispatchKey(keyboardKeyRects[idx]);
}

function dispatchKey(key) {
	switch (key.action) {
		case 'char': {
			let c = key.value;
			if (keyboardShift && /^[a-z]$/.test(c)) c = c.toUpperCase();
			setInputText(inputText + c);
			// Shift auto-resets after one character, like a phone keyboard.
			if (keyboardShift) {
				keyboardShift = false;
				renderKeyboardToCanvas();
			}
			break;
		}
		case 'space':
			setInputText(inputText + ' ');
			break;
		case 'backspace':
			setInputText(inputText.slice(0, -1));
			break;
		case 'shift':
			keyboardShift = !keyboardShift;
			renderKeyboardToCanvas();
			break;
		case 'symbols':
			keyboardSymbols = !keyboardSymbols;
			keyboardShift = false;
			renderKeyboardToCanvas();
			break;
		case 'enter':
			handleXRSend();
			break;
	}
}

// Set the current input text and keep every representation of it in sync:
// the state var, the hidden DOM input (used by the desktop path), and the 3D
// input panel's rendered text.
function setInputText(text) {
	inputText = text;
	chatInput.value = text;
	renderInputToCanvas();
}

// Show/hide the in-scene keyboard. When collapsed it is removed from hit-testing
// (see the render loop) so the pointer passes through to whatever is behind it.
function toggleKeyboard() {
	keyboardCollapsed = !keyboardCollapsed;
	if (keyboardPanel) keyboardPanel.visible = !keyboardCollapsed;
	if (keyboardCollapsed) setKeyboardHover(-1);
	renderInputToCanvas(); // refresh the KEYS button state
}

// ============================================================================
// Pointer Ray Visibility Toggle
// ============================================================================
// Hide the ray *lines* for an unobstructed view while keeping the intersection
// cursor (reticle) so the user can still aim. Bound to the B/Y controller button.
function toggleRayVisibility() {
	rayVisible = !rayVisible;
	for (const ray of controllerRays) {
		if (ray) ray.visible = rayVisible;
	}
	updateStatus(rayVisible ? 'Pointer lines on' : 'Pointer lines off (cursor only)', '');
}

// ============================================================================
// Speech-to-Text (cross-platform: MediaRecorder + in-browser Whisper)
// ============================================================================
// The Web Speech API (SpeechRecognition) only exists in Chrome/Edge desktop, so
// it was dead on the Quest Browser, Firefox, and Safari. Instead we capture audio
// with getUserMedia + MediaRecorder (supported everywhere) and transcribe it
// locally in the browser with Whisper via transformers.js — no API key, no server
// round-trip, works on any platform with a mic and a secure context.
//   • Always-on: toggle the MIC button; a voice-activity detector segments speech
//     and each finished utterance is transcribed and auto-sent.
//   • Push-to-talk: hold the A/X controller button; the utterance is transcribed
//     and sent on release.
// Requires a secure context (HTTPS or localhost) for mic access — the same
// requirement WebXR itself has — plus internet on first run to fetch the model.
const STT_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm';
const STT_MODEL = 'Xenova/whisper-tiny.en';
const VAD_RMS_THRESHOLD = 0.015; // speech vs. silence energy threshold
const VAD_SILENCE_MS = 800;      // trailing silence that ends an utterance

function initSpeech() {
	speechSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

// Lazily download + build the Whisper pipeline (cached in the browser after the
// first run). Returned promise is memoized; on failure it resets so we can retry.
function loadSttPipeline() {
	if (!sttPipelinePromise) {
		updateStatus('Loading speech model… (first time only)', '');
		sttPipelinePromise = import(/* @vite-ignore */ STT_CDN)
			.then(async ({ pipeline, env }) => {
				env.allowLocalModels = false; // fetch from the HF hub, not a local path
				const asr = await pipeline('automatic-speech-recognition', STT_MODEL);
				sttModelReady = true;
				return asr;
			})
			.catch((e) => {
				sttPipelinePromise = null; // allow a later retry
				throw e;
			});
	}
	return sttPipelinePromise;
}

async function ensureMicStream() {
	if (micStream) return micStream;
	micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
	return micStream;
}

// Decode an encoded audio blob (webm/ogg/mp4) to a mono 16 kHz Float32Array,
// which is what Whisper expects.
async function decodeTo16kMono(blob) {
	const AC = window.AudioContext || window.webkitAudioContext;
	const buf = await blob.arrayBuffer();
	const tmp = new AC();
	let decoded;
	try {
		decoded = await tmp.decodeAudioData(buf);
	} finally {
		tmp.close();
	}
	const rate = 16000;
	const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
	const src = offline.createBufferSource();
	src.buffer = decoded;
	src.connect(offline.destination);
	src.start(0);
	const rendered = await offline.startRendering();
	return rendered.getChannelData(0);
}

async function transcribeBlob(blob) {
	if (!blob || blob.size < 1200) return ''; // effectively empty
	const asr = await loadSttPipeline();
	const audio = await decodeTo16kMono(blob);
	if (!audio || audio.length < 1600) return ''; // < ~0.1s
	const out = await asr(audio);
	return (out && out.text ? out.text : '').trim();
}

// One MediaRecorder utterance at a time.
function startUtterance() {
	recordedChunks = [];
	mediaRecorder = new MediaRecorder(micStream);
	mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recordedChunks.push(e.data); };
	mediaRecorder.start();
}

function stopUtterance() {
	return new Promise((resolve) => {
		if (!mediaRecorder || mediaRecorder.state === 'inactive') { resolve(null); return; }
		mediaRecorder.onstop = () => {
			const type = recordedChunks[0] ? recordedChunks[0].type : 'audio/webm';
			resolve(recordedChunks.length ? new Blob(recordedChunks, { type }) : null);
		};
		try { mediaRecorder.stop(); } catch (e) { resolve(null); }
	});
}

async function transcribeAndDeliver(blob, autoSend) {
	if (!blob) return;
	sttBusy = true;
	updateStatus('Transcribing…', '');
	try {
		const text = await transcribeBlob(blob);
		if (text) {
			setInputText(text);
			if (autoSend && !isLoading) handleXRSend();
			else updateStatus(micMode === 'always' ? 'Mic on — listening' : 'Transcribed', micMode === 'always' ? 'connected' : '');
		} else {
			updateStatus(micMode === 'always' ? 'Mic on — listening' : 'No speech detected', micMode === 'always' ? 'connected' : '');
		}
	} catch (e) {
		micError(e);
	} finally {
		sttBusy = false;
	}
}

function micError(e) {
	console.error('Speech error:', e);
	const name = e && e.name ? e.name : '';
	if (name === 'NotAllowedError' || name === 'SecurityError') {
		updateStatus('Microphone blocked — allow mic access (needs HTTPS/localhost)', 'error');
	} else if (name === 'NotFoundError') {
		updateStatus('No microphone found', 'error');
	} else {
		updateStatus('Speech error: ' + (e && e.message ? e.message : name || 'unknown'), 'error');
	}
	renderInputToCanvas();
	updateMicButtonDOM();
}

// --- Voice-activity detection (always-on mode) ---
// IMPORTANT: this is pumped from the main XR animation loop (pumpVad), NOT from
// window.requestAnimationFrame — the latter does not fire during an immersive
// WebXR session, which is why always-on transcription was dead in MR.
function startVad() {
	const AC = window.AudioContext || window.webkitAudioContext;
	vadContext = new AC();
	const source = vadContext.createMediaStreamSource(micStream);
	vadAnalyser = vadContext.createAnalyser();
	vadAnalyser.fftSize = 1024;
	source.connect(vadAnalyser);
	vadData = new Float32Array(vadAnalyser.fftSize);
	vadSpeaking = false;
	vadSilenceMs = 0;
	vadLastTime = performance.now();
}

// One VAD step. Called every frame from renderer.setAnimationLoop so it runs in
// both the windowed view and immersive MR.
function pumpVad() {
	if (micMode !== 'always' || !vadAnalyser) return;
	vadAnalyser.getFloatTimeDomainData(vadData);
	let sum = 0;
	for (let i = 0; i < vadData.length; i++) sum += vadData[i] * vadData[i];
	const rms = Math.sqrt(sum / vadData.length);
	const now = performance.now();
	const dt = now - vadLastTime;
	vadLastTime = now;
	if (rms > VAD_RMS_THRESHOLD) {
		vadSpeaking = true;
		vadSilenceMs = 0;
	} else if (vadSpeaking) {
		vadSilenceMs += dt;
		if (vadSilenceMs >= VAD_SILENCE_MS && !sttBusy) {
			segmentUtterance();
		}
	}
}

function stopVad() {
	if (vadContext) { try { vadContext.close(); } catch (e) { /* ignore */ } vadContext = null; }
	vadAnalyser = null;
	vadData = null;
	vadSpeaking = false;
	vadSilenceMs = 0;
}

// End the current utterance, immediately begin capturing the next, and transcribe
// the finished one in the background.
async function segmentUtterance() {
	sttBusy = true; // close the race with the next VAD tick until transcription starts
	vadSpeaking = false;
	vadSilenceMs = 0;
	const blob = await stopUtterance();
	if (micMode === 'always') startUtterance();
	await transcribeAndDeliver(blob, true);
}

// Always-on listening toggle (MIC button + DOM button).
async function toggleMicAlwaysOn() {
	if (!speechSupported) {
		updateStatus('Microphone not available on this device', 'error');
		return;
	}
	if (micMode === 'always') { stopAlwaysOn(); return; }
	if (micMode === 'ptt') return; // let a push-to-talk finish first
	micMode = 'always';
	renderInputToCanvas();
	updateMicButtonDOM();
	updateStatus(sttModelReady ? 'Mic on — listening' : 'Loading speech model…', 'connected');
	try {
		await ensureMicStream();
		loadSttPipeline(); // warm the model in the background
		if (micMode !== 'always') return; // toggled off during setup
		startVad();
		startUtterance();
		updateStatus('Mic on — listening', 'connected');
	} catch (e) {
		micMode = 'off';
		renderInputToCanvas();
		updateMicButtonDOM();
		micError(e);
	}
}

function stopAlwaysOn() {
	micMode = 'off';
	stopVad();
	if (mediaRecorder && mediaRecorder.state !== 'inactive') {
		try { mediaRecorder.stop(); } catch (e) { /* ignore */ }
	}
	renderInputToCanvas();
	updateMicButtonDOM();
	updateStatus('Mic off', '');
}

// Push-to-talk (controller A/X button). Only engages when always-on is off.
async function startPTT(hand) {
	if (!speechSupported) {
		updateStatus('Microphone not available on this device', 'error');
		return;
	}
	if (micMode !== 'off') return; // busy: already listening (always-on or PTT)
	micMode = 'ptt';
	pttHand = hand;
	renderInputToCanvas();
	updateMicButtonDOM();
	updateStatus(sttModelReady ? 'Listening… (push-to-talk)' : 'Loading speech model…', '');
	try {
		await ensureMicStream();
		if (micMode !== 'ptt') return; // released during setup
		startUtterance();          // capture immediately…
		loadSttPipeline();          // …while the model warms in the background
		updateStatus('Listening… (push-to-talk)', '');
	} catch (e) {
		micMode = 'off';
		pttHand = null;
		micError(e);
	}
}

async function stopPTT(hand) {
	if (micMode !== 'ptt' || hand !== pttHand) return;
	micMode = 'off';
	pttHand = null;
	renderInputToCanvas();
	updateMicButtonDOM();
	const blob = await stopUtterance();
	await transcribeAndDeliver(blob, true);
}

function updateMicButtonDOM() {
	const listening = micMode !== 'off';
	const btn = document.getElementById('mic-button');
	if (btn) btn.classList.toggle('listening', listening);
	if (desktopMicButton) desktopMicButton.classList.toggle('listening', listening);
}

// ============================================================================
// Side Panel (AR/VR Toggle + Color Wheel)
// ============================================================================
function createSidePanel() {
	sideCanvas = document.createElement('canvas');
	sideCanvas.width = 256;
	sideCanvas.height = 768;
	sideContext = sideCanvas.getContext('2d');

	sideTexture = new THREE.CanvasTexture(sideCanvas);
	sideTexture.minFilter = THREE.LinearFilter;
	sideTexture.magFilter = THREE.LinearFilter;

	const geometry = new THREE.PlaneGeometry(SIDE_PANEL_WIDTH, SIDE_PANEL_HEIGHT);
	const material = new THREE.MeshBasicMaterial({
		map: sideTexture,
		transparent: true,
		side: THREE.DoubleSide
	});

	sidePanel = new THREE.Mesh(geometry, material);
	// Position to the right of the chat panel
	const sideX = CHAT_PANEL_WIDTH / 2 + SIDE_PANEL_GAP + SIDE_PANEL_WIDTH / 2;
	sidePanel.position.set(sideX, 1.4, -CHAT_PANEL_DISTANCE);
	scene.add(sidePanel);

	renderSidePanel();
}

function hslToRgbString(h, s, l) {
	return `hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function hslToHex(h, s, l) {
	const c = new THREE.Color();
	c.setHSL(h / 360, s, l);
	return '#' + c.getHexString();
}

// Mirrors the AR/VR + color/brightness controls (canvas side panel, VR-only)
// into the desktop Environment tab. Safe to call before the desktop DOM
// exists (e.g. not yet — guarded by null checks below).
function renderDomEnv() {
	if (!dchatEnvModeMount) return;
	const buttons = ENV_MODE_BUTTONS.map(b => ({
		...b,
		variant: (b.id === 'ar' && !isVRMode) || (b.id === 'vr' && isVRMode) ? 'active' : 'inactiveToggle'
	}));
	mountButtonsToDOM(dchatEnvModeMount, buttons, { width: 256, height: 40, gap: 6, fontSize: 13 }, handleMenuAction);
	const colorEnabled = envColorControlsEnabled();
	if (dchatEnvControls) dchatEnvControls.classList.toggle('disabled', !colorEnabled);
	const note = dchatEnvControls && dchatEnvControls.querySelector('.dchat-disabled-note');
	if (note) {
		note.style.display = colorEnabled ? 'none' : '';
		note.textContent = colorEnabled
			? ''
			: 'Background color is unavailable while AR/VR mode is active.';
	}
	const hex = hslToHex(vrBgHue, vrBgSat, vrBgLight);
	if (dchatColorPicker) dchatColorPicker.value = hex;
	if (dchatColorPreview) dchatColorPreview.style.background = hex;
	if (dchatBrightness) dchatBrightness.value = Math.round(vrBgLight * 100);
}

/** Color picker is for desktop / mobile browser viewing — not while an AR/VR session is active. */
function envColorControlsEnabled() {
	if (typeof mobileXRMode !== 'undefined' && mobileXRMode) return false;
	if (renderer && renderer.xr && renderer.xr.isPresenting) return false;
	return true;
}

function renderSidePanel() {
	renderDomEnv();
	if (!sideContext) return;

	const ctx = sideContext;
	const w = sideCanvas.width;
	const h = sideCanvas.height;

	ctx.clearRect(0, 0, w, h);

	// Background
	ctx.fillStyle = 'rgba(20, 20, 30, 0.92)';
	roundRect(ctx, 0, 0, w, h, 16);
	ctx.fill();

	// --- AR/VR Toggle Button (shared spec - see ENV_MODE_BUTTONS/handleMenuAction) ---
	const envButtons = ENV_MODE_BUTTONS.map(b => ({
		...b,
		variant: (b.id === 'ar' && !isVRMode) || (b.id === 'vr' && isVRMode) ? 'active' : 'inactiveToggle'
	}));
	const envLayout = buildButtonLayout(envButtons, { width: w - 32, x: 16, y: 16, height: 80, perRow: 2, gap: 4 });
	sidePanelEnvButtonBoxes = envLayout.boxes;
	drawButtonsToCanvas(ctx, sidePanelEnvButtonBoxes, { fontSize: 24 });

	// --- Section label ---
	ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.fillStyle = 'rgba(255,255,255,0.4)';
	ctx.textAlign = 'center';
	ctx.fillText('BG Color', w / 2, 130);

	// --- Color Wheel (center area) ---
	const wheelCX = w / 2;
	const wheelCY = 290;
	const wheelR = 95;
	const wheelInnerR = 20;

	// Draw color wheel using arc segments
	for (let angle = 0; angle < 360; angle += 1) {
		const startRad = (angle - 1) * Math.PI / 180;
		const endRad = (angle + 1) * Math.PI / 180;

		// Gradient from white center to full saturation at edge
		const grad = ctx.createRadialGradient(wheelCX, wheelCY, wheelInnerR, wheelCX, wheelCY, wheelR);
		grad.addColorStop(0, hslToRgbString(angle, 0.0, 0.85));
		grad.addColorStop(0.5, hslToRgbString(angle, 0.6, 0.5));
		grad.addColorStop(1, hslToRgbString(angle, 1.0, 0.45));

		ctx.beginPath();
		ctx.moveTo(wheelCX, wheelCY);
		ctx.arc(wheelCX, wheelCY, wheelR, startRad, endRad);
		ctx.closePath();
		ctx.fillStyle = grad;
		ctx.fill();
	}

	// Dark center dot
	ctx.beginPath();
	ctx.arc(wheelCX, wheelCY, wheelInnerR - 2, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(20, 20, 30, 0.9)';
	ctx.fill();

	// Selection indicator on the wheel
	const selAngle = vrBgHue * Math.PI / 180;
	const selDist = wheelInnerR + vrBgSat * (wheelR - wheelInnerR);
	const selX = wheelCX + Math.cos(selAngle) * selDist;
	const selY = wheelCY + Math.sin(selAngle) * selDist;

	ctx.beginPath();
	ctx.arc(selX, selY, 8, 0, Math.PI * 2);
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 3;
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(selX, selY, 8, 0, Math.PI * 2);
	ctx.strokeStyle = '#000000';
	ctx.lineWidth = 1;
	ctx.stroke();

	// --- Brightness Slider (below wheel) ---
	const sliderY = 420;
	const sliderH = 30;
	const sliderPad = 24;
	const sliderW = w - sliderPad * 2;

	ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.fillStyle = 'rgba(255,255,255,0.4)';
	ctx.textAlign = 'center';
	ctx.fillText('Brightness', w / 2, sliderY - 8);

	// Slider track gradient: black to current hue full bright
	const sliderGrad = ctx.createLinearGradient(sliderPad, 0, sliderPad + sliderW, 0);
	sliderGrad.addColorStop(0, hslToRgbString(vrBgHue, vrBgSat, 0.02));
	sliderGrad.addColorStop(0.5, hslToRgbString(vrBgHue, vrBgSat, 0.5));
	sliderGrad.addColorStop(1, hslToRgbString(vrBgHue, vrBgSat, 0.95));
	ctx.fillStyle = sliderGrad;
	roundRect(ctx, sliderPad, sliderY, sliderW, sliderH, 8);
	ctx.fill();

	// Slider thumb
	const thumbX = sliderPad + vrBgLight * sliderW;
	ctx.beginPath();
	ctx.arc(thumbX, sliderY + sliderH / 2, 12, 0, Math.PI * 2);
	ctx.fillStyle = hslToRgbString(vrBgHue, vrBgSat, vrBgLight);
	ctx.fill();
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 2;
	ctx.stroke();

	// --- Color Preview ---
	const prevY = 480;
	const prevH = 50;
	ctx.fillStyle = hslToRgbString(vrBgHue, vrBgSat, vrBgLight);
	roundRect(ctx, sliderPad, prevY, sliderW, prevH, 10);
	ctx.fill();

	// Label
	ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.fillStyle = vrBgLight > 0.5 ? '#000000' : '#ffffff';
	ctx.textAlign = 'center';
	ctx.fillText('Preview', w / 2, prevY + prevH / 2 + 6);

	// Dim overlay if in AR mode (color wheel inactive)
	if (!isVRMode) {
		ctx.fillStyle = 'rgba(20, 20, 30, 0.6)';
		roundRect(ctx, 0, 115, w, h - 115 - 8, 0);
		ctx.fill();
		ctx.font = '18px -apple-system, BlinkMacSystemFont, sans-serif';
		ctx.fillStyle = 'rgba(255,255,255,0.5)';
		ctx.textAlign = 'center';
		ctx.fillText('Switch to VR', w / 2, 545);
		ctx.fillText('to customize', w / 2, 568);
	}

	ctx.textAlign = 'left';
	sideTexture.needsUpdate = true;
}

function applyEnvironmentMode() {
	const color = new THREE.Color();
	color.setHSL(vrBgHue / 360, vrBgSat, vrBgLight);

	const inMobileXR = typeof mobileXRMode !== 'undefined' && !!mobileXRMode;
	const inWebXR = !!(renderer && renderer.xr && renderer.xr.isPresenting);

	// Live AR passthrough (mobile AR camera or WebXR AR): keep transparent.
	if (mobileXRMode === 'ar' || (inWebXR && !isVRMode)) {
		if (vrSkybox) vrSkybox.visible = false;
		scene.background = null;
		renderer.setClearColor(0x000000, 0.0);
		return;
	}

	// Desktop / mobile browser (not in an XR session): solid scene background
	// so Environment tab color changes are visible immediately.
	if (!inWebXR && !inMobileXR) {
		scene.background = color.clone();
		if (vrSkybox) vrSkybox.visible = false;
		renderer.setClearColor(color, 1);
		return;
	}

	// Immersive VR / Cardboard: colored skybox.
	if (vrSkybox) {
		vrSkybox.material.color.copy(color);
		vrSkybox.visible = true;
	}
	scene.background = null;
	renderer.setClearColor(0x000000, 0.0);
}

function handleSidePanelHit(uv) {
	const canvasX = uv.x * 256;
	const canvasY = (1 - uv.y) * 768; // UV y is flipped vs canvas y

	// AR/VR Toggle (shared spec - see ENV_MODE_BUTTONS/handleMenuAction)
	const envHit = hitTestButtons(sidePanelEnvButtonBoxes, canvasX, canvasY);
	if (envHit) {
		handleMenuAction(envHit.action);
		return;
	}

	// Only handle color controls in VR mode
	if (!isVRMode) return;

	// Color Wheel (centered at 128, 290, radius 95)
	const wheelCX = 128;
	const wheelCY = 290;
	const wheelR = 95;
	const wheelInnerR = 20;
	const dx = canvasX - wheelCX;
	const dy = canvasY - wheelCY;
	const dist = Math.sqrt(dx * dx + dy * dy);

	if (dist <= wheelR && dist >= wheelInnerR) {
		vrBgHue = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
		vrBgSat = Math.max(0, Math.min(1, (dist - wheelInnerR) / (wheelR - wheelInnerR)));
		applyEnvironmentMode();
		renderSidePanel();
		return;
	}

	// Brightness slider (y 420-450 on canvas)
	if (canvasY >= 410 && canvasY <= 460) {
		const sliderPad = 24;
		const sliderW = 256 - sliderPad * 2;
		vrBgLight = Math.max(0.02, Math.min(0.95, (canvasX - sliderPad) / sliderW));
		applyEnvironmentMode();
		renderSidePanel();
		return;
	}
}

// ============================================================================
// Scene Manager
// ============================================================================
const fileInput = document.getElementById('scene-file-input');
const folderInput = document.getElementById('scene-folder-input');
const exportModal = document.getElementById('export-modal');
const exportNameInput = document.getElementById('export-name');
const exportExtInput = document.getElementById('export-ext');
const exportPreview = document.getElementById('export-preview');
const exportScreenshotBtn = document.getElementById('export-screenshot-btn');
const exportCancelBtn = document.getElementById('export-cancel-btn');
const exportConfirmBtn = document.getElementById('export-confirm-btn');
const exportDownloadBtn = document.getElementById('export-download-btn');

let pendingExportThumbnail = null;
let pendingExportCombined = false;

function snapshotSystemObjects() {
	systemObjectIds.clear();
	scene.traverse(obj => systemObjectIds.add(obj.uuid));
	systemOverlayIds.clear();
	const overlay = document.getElementById('overlay-root');
	for (const child of overlay.children) {
		if (child.id) systemOverlayIds.add(child.id);
	}
}

function captureScreenshot() {
	const size = 256;
	const rt = new THREE.WebGLRenderTarget(size, size);
	renderer.setRenderTarget(rt);
	renderer.render(scene, camera);
	renderer.setRenderTarget(null);

	const pixels = new Uint8Array(size * size * 4);
	renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);

	const cvs = document.createElement('canvas');
	cvs.width = size;
	cvs.height = size;
	const c = cvs.getContext('2d');
	const imgData = c.createImageData(size, size);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const src = ((size - 1 - y) * size + x) * 4;
			const dst = (y * size + x) * 4;
			imgData.data[dst] = pixels[src];
			imgData.data[dst + 1] = pixels[src + 1];
			imgData.data[dst + 2] = pixels[src + 2];
			imgData.data[dst + 3] = 255;
		}
	}
	c.putImageData(imgData, 0, 0);
	rt.dispose();
	return cvs.toDataURL('image/jpeg', 0.7);
}

function disposeRecursive(obj) {
	if (obj.geometry) obj.geometry.dispose();
	if (obj.material) {
		if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
		else obj.material.dispose();
	}
	for (const child of [...obj.children]) {
		disposeRecursive(child);
	}
}


// ============================================================================
// Code tab — view/edit generated VR program (active scenes + session blocks)
// ============================================================================
function setCodeEditorStatus(text, kind) {
	if (!dchatCodeStatus) return;
	dchatCodeStatus.textContent = text || '';
	dchatCodeStatus.className = kind || '';
}

function buildCodeEditorSource() {
	const chunks = [];
	for (const sc of loadedScenes) {
		if (!sc.active) continue;
		(sc.codeBlocks || []).forEach((code, i) => {
			const name = String(sc.name || 'Scene').replace(/\n/g, ' ');
			chunks.push(`// --- scene[${sc.id}] #${i} ${name} ---\n${String(code).trim()}`);
		});
	}
	executedCodeBlocks.forEach((code, i) => {
		chunks.push(`// --- block ${i} ---\n${String(code).trim()}`);
	});
	return chunks.join('\n\n');
}

function parseCodeEditorSource(text) {
	const sceneUpdates = new Map(); // sceneId -> code[]
	const sessionBlocks = [];
	const trimmed = (text || '').trim();
	if (!trimmed) return { sceneUpdates, sessionBlocks };

	const parts = trimmed.split(/(?=^\/\/ --- .+? ---$)/m);
	for (const part of parts) {
		const m = part.match(/^\/\/ --- (.+?) ---\r?\n?([\s\S]*)$/);
		if (!m) {
			const orphan = part.trim();
			if (orphan) sessionBlocks.push(orphan);
			continue;
		}
		const label = m[1].trim();
		const code = (m[2] || '').trim();
		if (!code) continue;
		const sceneMatch = label.match(/^scene\[([^\]]+)\]/);
		if (sceneMatch) {
			const id = sceneMatch[1];
			if (!sceneUpdates.has(id)) sceneUpdates.set(id, []);
			sceneUpdates.get(id).push(code);
		} else {
			sessionBlocks.push(code);
		}
	}
	return { sceneUpdates, sessionBlocks };
}

function updateCodeEditorHint() {
	if (!dchatCodeHint) return;
	const sceneCount = loadedScenes.filter(s => s.active).reduce((n, s) => n + (s.codeBlocks?.length || 0), 0);
	const sessionCount = executedCodeBlocks.length;
	dchatCodeHint.textContent =
		`Active scenes: ${sceneCount} block${sceneCount === 1 ? '' : 's'} · Session: ${sessionCount} block${sessionCount === 1 ? '' : 's'}. ` +
		`Markers like // --- block N --- separate blocks on Apply.`;
}

function syncCodeEditorFromState({ force = false } = {}) {
	if (!dchatCodeEditor) return;
	if (codeEditorDirty && !force) return;
	const src = buildCodeEditorSource();
	dchatCodeEditor.value = src;
	codeEditorLastApplied = src;
	codeEditorDirty = false;
	updateCodeEditorHint();
	if (!codeEditorApplying) setCodeEditorStatus(src ? 'Synced' : 'Empty', '');
}

function notifyCodeEditorExternalChange() {
	// Refresh when chat/scenes change, unless the user is mid-edit.
	syncCodeEditorFromState({ force: false });
	updateCodeEditorHint();
}

function markCodeEditorDirty() {
	codeEditorDirty = true;
	setCodeEditorStatus('Edited', 'pending');
	if (dchatCodeLive && dchatCodeLive.checked) scheduleLiveCodeApply();
}

function scheduleLiveCodeApply() {
	if (codeEditorLiveTimer) clearTimeout(codeEditorLiveTimer);
	codeEditorLiveTimer = setTimeout(() => {
		codeEditorLiveTimer = null;
		applyCodeFromEditor({ fromLive: true });
	}, CODE_EDITOR_LIVE_DEBOUNCE_MS);
}

async function applyCodeFromEditor({ fromLive = false } = {}) {
	if (!dchatCodeEditor || codeEditorApplying) return;
	codeEditorApplying = true;
	setCodeEditorStatus(fromLive ? 'Live applying…' : 'Applying…', 'pending');
	if (dchatCodeApply) dchatCodeApply.disabled = true;
	try {
		const text = dchatCodeEditor.value;
		const { sceneUpdates, sessionBlocks } = parseCodeEditorSource(text);

		for (const [id, codes] of sceneUpdates) {
			const sc = loadedScenes.find(s => s.id === id);
			if (sc) sc.codeBlocks = codes;
		}
		executedCodeBlocks = sessionBlocks;

		clearUserObjects();
		for (const sc of loadedScenes) {
			if (!sc.active) continue;
			for (const code of sc.codeBlocks || []) {
				await executeVrCode(code);
			}
		}
		for (const code of executedCodeBlocks) {
			await executeVrCode(code);
		}

		const normalized = buildCodeEditorSource();
		codeEditorLastApplied = normalized;
		// Keep caret-friendly: only rewrite textarea if markers/order changed meaningfully
		if (!codeEditorDirty || dchatCodeEditor.value.trim() === text.trim()) {
			dchatCodeEditor.value = normalized;
			codeEditorDirty = false;
		} else {
			codeEditorDirty = false;
		}
		updateCodeEditorHint();
		setCodeEditorStatus(fromLive ? 'Live applied' : 'Applied', 'ok');
		renderScenePanel();
	} catch (err) {
		console.error('Code editor apply error:', err);
		setCodeEditorStatus(`Error: ${err?.message || err}`, 'error');
		// Don't crash the app; scene may be partially rebuilt — leave editor dirty
		codeEditorDirty = true;
	} finally {
		codeEditorApplying = false;
		if (dchatCodeApply) dchatCodeApply.disabled = false;
	}
}

function revertCodeEditor() {
	if (!dchatCodeEditor) return;
	if (codeEditorLiveTimer) {
		clearTimeout(codeEditorLiveTimer);
		codeEditorLiveTimer = null;
	}
	const src = codeEditorLastApplied || buildCodeEditorSource();
	dchatCodeEditor.value = src;
	codeEditorDirty = false;
	updateCodeEditorHint();
	setCodeEditorStatus('Reverted', '');
}

function clearUserObjects() {
	for (let i = scene.children.length - 1; i >= 0; i--) {
		const child = scene.children[i];
		if (!systemObjectIds.has(child.uuid)) {
			scene.remove(child);
			disposeRecursive(child);
		}
	}
	window._vrAnimations = [];
	const overlay = document.getElementById('overlay-root');
	for (let i = overlay.children.length - 1; i >= 0; i--) {
		const child = overlay.children[i];
		if (child.id && !systemOverlayIds.has(child.id)) {
			overlay.removeChild(child);
		}
	}
}

function rebuildSceneFromActive() {
	clearUserObjects();
	// Re-execute loaded scenes first. executeVrCode is async; we
	// fire-and-forget here and just log any rejections.
	for (const sc of loadedScenes) {
		if (sc.active) {
			for (const code of sc.codeBlocks) {
				Promise.resolve(executeVrCode(code)).catch(e => {
					console.error(`Scene "${sc.name}" error:`, e);
				});
			}
		}
	}
	// Then re-execute current session code
	for (const code of executedCodeBlocks) {
		Promise.resolve(executeVrCode(code)).catch(e => {
			console.error('Session code error:', e);
		});
	}
}

function showExportModal(combined) {
	pendingExportCombined = combined;
	exportNameInput.value = combined ? 'Combined Scene' : 'My Scene';
	exportExtInput.value = sceneFileExtension;
	pendingExportThumbnail = null;
	exportPreview.innerHTML = '<span style="color:rgba(255,255,255,0.4);font-size:12px;text-align:center">No screenshot</span>';
	exportModal.style.display = 'flex';
}

function hideExportModal() {
	exportModal.style.display = 'none';
}

// Gathers the current exportable scene (active loaded scenes + this
// session's chat-executed code) into the on-disk/on-wire scene format.
// Shared by "Export" (save to server), "Save to Device" (local download),
// and "Upload Current Scene" (community).
function buildSceneData(name) {
	const codeBlocks = [];
	for (const sc of loadedScenes) {
		if (sc.active) codeBlocks.push(...sc.codeBlocks);
	}
	codeBlocks.push(...executedCodeBlocks);

	return {
		version: 1,
		name,
		createdAt: new Date().toISOString(),
		thumbnail: pendingExportThumbnail || '',
		codeBlocks
	};
}

function doExport() {
	const name = exportNameInput.value.trim() || 'Untitled';
	const ext = exportExtInput.value.trim().replace(/^\./, '') || 'vrscene';
	sceneFileExtension = ext;

	const sceneData = buildSceneData(name);

	fetch('/api/save-scene', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(sceneData)
	}).then(res => res.json()).then(data => {
		if (data.error) {
			updateStatus(`Export error: ${data.error}`, 'error');
		} else {
			updateStatus(`Exported "${name}" to server`, 'connected');
		}
	}).catch(err => {
		updateStatus(`Export error: ${err.message}`, 'error');
	});

	hideExportModal();
}

// Downloads the current scene as a local file (a real save-to-disk, unlike
// "Export" above which only saves to this server's single scene slot).
function doDownloadExport() {
	const name = exportNameInput.value.trim() || 'Untitled';
	const ext = exportExtInput.value.trim().replace(/^\./, '') || 'vrscene';
	sceneFileExtension = ext;

	const sceneData = buildSceneData(name);
	const blob = new Blob([JSON.stringify(sceneData, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${name.replace(/[\\/:*?"<>|]+/g, '_')}.${ext}`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);

	updateStatus(`Saved "${name}" to your device`, 'connected');
	hideExportModal();
}

// Adds a loaded scene's code blocks to the scene, runs them, and refreshes
// the scene list/thumbnails. Shared by file import, folder import, the
// single server-saved scene, and community scenes.
function addLoadedScene(data, fallbackName) {
	if (!data || !data.codeBlocks || !Array.isArray(data.codeBlocks)) {
		throw new Error('Invalid scene data: missing codeBlocks');
	}
	const sc = {
		id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
		name: data.name || fallbackName,
		thumbnail: data.thumbnail || '',
		codeBlocks: data.codeBlocks,
		active: true,
		createdAt: data.createdAt || new Date().toISOString(),
		_thumbImage: null
	};
	loadedScenes.push(sc);

	// Execute the scene's code blocks (async; surface failures via console)
	for (const code of sc.codeBlocks) {
		Promise.resolve(executeVrCode(code)).catch(err => {
			console.error(`Scene "${sc.name}" load error:`, err);
		});
	}

	loadSceneThumbnails();
	renderScenePanel();
	notifyCodeEditorExternalChange();
	return sc;
}

function loadSceneFile(file) {
	const reader = new FileReader();
	reader.onload = (e) => {
		try {
			const data = JSON.parse(e.target.result);
			const sc = addLoadedScene(data, file.name.replace(/\.[^.]+$/, ''));
			updateStatus(`Loaded "${sc.name}"`, 'connected');
		} catch (err) {
			console.error('Error parsing scene file:', err);
			updateStatus(`Load error: ${err.message}`, 'error');
		}
	};
	reader.readAsText(file);
}

fileInput.addEventListener('change', (e) => {
	for (const file of e.target.files) loadSceneFile(file);
	fileInput.value = '';
});

// Whole-folder import: webkitdirectory hands back every file in the tree,
// so only pick up the scene files and ignore anything else that's in there.
folderInput.addEventListener('change', (e) => {
	const files = [...e.target.files].filter(f => /\.(vrscene|json)$/i.test(f.name));
	if (files.length === 0) {
		updateStatus('No .vrscene/.json files found in that folder', 'error');
	} else {
		for (const file of files) loadSceneFile(file);
	}
	folderInput.value = '';
});

function loadSceneFromServer() {
	updateStatus('Loading scene...', 'connecting');
	fetch('/api/load-scene')
		.then(res => {
			if (!res.ok) throw new Error(res.status === 404 ? 'No saved scene found' : 'Server error');
			return res.json();
		})
		.then(data => {
			const sc = addLoadedScene(data, 'Loaded Scene');
			updateStatus(`Loaded "${sc.name}"`, 'connected');
		})
		.catch(err => {
			updateStatus(`Load error: ${err.message}`, 'error');
		});
}

// --- Community scenes (shared, persistent, server-side via /api/community-scenes) ---
// Shareable URLs: /s/:id (display-only) and /e/:id (editor), plus ?scene=&view=1 / ?display=1.

const shareModal = document.getElementById('share-modal');
const shareModalTitle = document.getElementById('share-modal-title');
const shareDisplayOnly = document.getElementById('share-display-only');
const shareUrlInput = document.getElementById('share-url');
const shareCloseBtn = document.getElementById('share-close-btn');
const shareCopyBtn = document.getElementById('share-copy-btn');
const renameModal = document.getElementById('rename-modal');
const renameNameInput = document.getElementById('rename-name');
const renameCancelBtn = document.getElementById('rename-cancel-btn');
const renameConfirmBtn = document.getElementById('rename-confirm-btn');
const editorLink = document.getElementById('editor-link');

function parseShareRoute() {
	const path = window.location.pathname.replace(/\/+$/, '') || '/';
	const params = new URLSearchParams(window.location.search);
	const pathMatch = path.match(/^\/(s|e)\/([A-Za-z0-9_-]+)$/);
	if (pathMatch) {
		return { sceneId: pathMatch[2], displayOnly: pathMatch[1] === 's' };
	}
	return {
		sceneId: params.get('scene'),
		displayOnly: params.get('view') === '1' || params.get('display') === '1'
	};
}

function applyDisplayOnlyMode() {
	displayOnlyMode = true;
	document.body.classList.add('display-only');
	setUiCollapsed(true);
	if (uiTogglePanel) uiTogglePanel.visible = false;
	if (hudStatusPanel) hudStatusPanel.visible = false;
	if (typeof setDesktopChatMinimized === 'function') {
		setDesktopChatMinimized(true);
	} else if (desktopChat) {
		desktopChat.classList.add('hidden');
	}
	if (desktopChatReopenBtn) desktopChatReopenBtn.classList.remove('visible');
	// XRButton injects a bottom-centered <button> without a stable id.
	for (const btn of document.querySelectorAll('#app button, body > button')) {
		const t = (btn.textContent || '').toLowerCase();
		if (t.includes('enter') && (t.includes('ar') || t.includes('vr') || t.includes('xr'))) {
			btn.style.display = 'none';
		}
	}
}

function currentShareUrl() {
	if (!pendingShare) return '';
	return shareDisplayOnly && shareDisplayOnly.checked ? pendingShare.viewUrl : pendingShare.editorUrl;
}

function sharePayloadFromMeta(meta, urls = {}) {
	const origin = window.location.origin;
	const id = meta.id || urls.id;
	return {
		id,
		name: meta.name || 'Untitled',
		editorUrl: urls.editorUrl || meta.editorUrl || (id ? `${origin}/e/${id}` : ''),
		viewUrl: urls.viewUrl || meta.viewUrl || (id ? `${origin}/s/${id}` : '')
	};
}

function showShareModal(share) {
	if (displayOnlyMode) return;
	pendingShare = share;
	if (shareModalTitle) shareModalTitle.textContent = share.name ? `Share "${share.name}"` : 'Share Scene';
	if (shareDisplayOnly) shareDisplayOnly.checked = false;
	if (shareUrlInput) shareUrlInput.value = currentShareUrl();
	if (shareCopyBtn) shareCopyBtn.textContent = 'Copy link';
	if (shareModal) shareModal.classList.add('visible');
	if (shareUrlInput) {
		shareUrlInput.focus();
		shareUrlInput.select();
	}
}

function hideShareModal() {
	if (shareModal) shareModal.classList.remove('visible');
}

function showRenameModal(cs, kind = 'scene') {
	if (displayOnlyMode || !cs) return;
	pendingRename = cs;
	pendingRenameKind = kind === 'theme' ? 'theme' : 'scene';
	if (renameNameInput) renameNameInput.value = cs.name || '';
	if (renameModal) renameModal.classList.add('visible');
	setTimeout(() => {
		if (!renameNameInput) return;
		renameNameInput.focus();
		renameNameInput.select();
	}, 0);
}

function hideRenameModal() {
	if (renameModal) renameModal.classList.remove('visible');
	pendingRename = null;
	pendingRenameKind = 'scene';
}

async function copyText(text) {
	if (!text) return false;
	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// fall through
	}
	const ta = document.createElement('textarea');
	ta.value = text;
	ta.setAttribute('readonly', '');
	ta.style.position = 'fixed';
	ta.style.left = '-9999px';
	document.body.appendChild(ta);
	ta.select();
	let ok = false;
	try { ok = document.execCommand('copy'); } catch { ok = false; }
	document.body.removeChild(ta);
	return ok;
}

function uploadCurrentSceneToCommunity() {
	if (displayOnlyMode) return;
	const name = (loadedScenes.find(s => s.active)?.name) || 'My Scene';
	const sceneData = buildSceneData(name);
	if (sceneData.codeBlocks.length === 0) {
		updateStatus('Nothing to upload - add or load something first', 'error');
		return;
	}
	updateStatus('Uploading to community...', 'connecting');
	fetch('/api/community-scenes', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(sceneData)
	}).then(res => res.json().then(data => ({ ok: res.ok, data }))).then(({ ok, data }) => {
		if (!ok || data.error) throw new Error(data.error || 'Upload failed');
		updateStatus(`Uploaded "${data.scene?.name || name}" to community`, 'connected');
		refreshCommunityScenes();
		showShareModal(sharePayloadFromMeta(data.scene || { name, id: data.id }, data));
	}).catch(err => {
		updateStatus(`Upload error: ${err.message}`, 'error');
	});
}

function refreshCommunityScenes() {
	if (!dchatCommunityList) return;
	dchatCommunityList.innerHTML = '<div class="dchat-scene-empty">Loading...</div>';
	fetch('/api/community-scenes')
		.then(res => res.json().then(data => ({ ok: res.ok, data })))
		.then(({ ok, data }) => {
			if (!ok || data.error) throw new Error(data.error || 'Failed to list community scenes');
			renderCommunitySceneList(data.scenes || []);
		})
		.catch(err => {
			dchatCommunityList.innerHTML = '';
			const empty = document.createElement('div');
			empty.className = 'dchat-scene-empty';
			empty.textContent = err.message;
			dchatCommunityList.appendChild(empty);
		});
}

function renderCommunitySceneList(scenes) {
	communityScenesCache = scenes;
	if (scenePanelSubTab === 'community') renderScenePanel();

	dchatCommunityList.innerHTML = '';
	if (scenes.length === 0) {
		const empty = document.createElement('div');
		empty.className = 'dchat-scene-empty';
		empty.textContent = 'No community scenes yet. Be the first to upload one!';
		dchatCommunityList.appendChild(empty);
		return;
	}
	for (const cs of scenes) {
		const item = document.createElement('div');
		item.className = 'dchat-scene-item';

		const name = document.createElement('div');
		name.className = 'dchat-scene-name';
		name.textContent = cs.name;
		name.title = cs.name + (cs.id ? ` (${cs.id})` : '');

		const actions = document.createElement('div');
		actions.className = 'dchat-scene-actions';

		const load = document.createElement('button');
		load.className = 'dchat-btn';
		load.textContent = 'Load';
		load.addEventListener('click', () => loadCommunityScene(cs));

		const share = document.createElement('button');
		share.className = 'dchat-btn';
		share.textContent = 'Share';
		share.addEventListener('click', () => {
			showShareModal(sharePayloadFromMeta(cs));
		});

		const rename = document.createElement('button');
		rename.className = 'dchat-btn';
		rename.textContent = 'Rename';
		rename.addEventListener('click', () => showRenameModal(cs));

		actions.append(load, share, rename);
		item.append(name, actions);
		dchatCommunityList.appendChild(item);
	}
}

function loadCommunityScene(cs) {
	updateStatus(`Loading "${cs.name}"...`, 'connecting');
	const fetchUrl = cs.id ? `/api/community-scenes/${encodeURIComponent(cs.id)}` : cs.url;
	fetch(fetchUrl)
		.then(res => {
			if (!res.ok) throw new Error('Failed to fetch community scene');
			return res.json();
		})
		.then(data => {
			const sc = addLoadedScene(data, data.name || cs.name);
			updateStatus(`Loaded "${sc.name}"`, 'connected');
			return sc;
		})
		.catch(err => {
			updateStatus(`Load error: ${err.message}`, 'error');
		});
}

async function loadCommunitySceneById(sceneId, { activate = true } = {}) {
	const res = await fetch(`/api/community-scenes/${encodeURIComponent(sceneId)}`);
	const data = await res.json();
	if (!res.ok) throw new Error(data.error || 'Scene not found');
	if (activate) {
		const sc = addLoadedScene(data, data.name || 'Shared Scene');
		return { ...sc, editorUrl: data.editorUrl, viewUrl: data.viewUrl, id: data.id || sceneId };
	}
	return data;
}

async function renameCommunityScene() {
	const cs = pendingRename;
	const kind = pendingRenameKind;
	const name = renameNameInput ? renameNameInput.value.trim() : '';
	if (!cs || !cs.id) {
		hideRenameModal();
		return;
	}
	if (!name) {
		updateStatus('Name cannot be empty', 'error');
		return;
	}
	hideRenameModal();
	try {
		if (kind === 'theme') {
			const res = await fetch(`/api/community-themes/${encodeURIComponent(cs.id)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
			updateStatus(`Renamed theme to "${data.theme?.name || name}"`, 'connected');
			refreshCommunityThemes();
			return;
		}
		const res = await fetch(`/api/community-scenes/${encodeURIComponent(cs.id)}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name })
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
		updateStatus(`Renamed to "${data.scene?.name || name}"`, 'connected');
		refreshCommunityScenes();
	} catch (err) {
		updateStatus(`Rename error: ${err.message}`, 'error');
	}
}


// --- Community themes (editor chrome) + theme restyle chat ---

const DEFAULT_THEME = {
	name: 'Default',
	cssVars: {
		'--dchat-bg': 'rgba(22, 22, 32, 0.82)',
		'--dchat-border': 'rgba(255, 255, 255, 0.08)',
		'--dchat-text': '#ffffff',
		'--dchat-text-muted': 'rgba(255, 255, 255, 0.55)',
		'--dchat-header-bg': 'linear-gradient(135deg, rgba(99, 102, 241, 0.35), rgba(139, 92, 246, 0.25))',
		'--dchat-tabs-bg': 'rgba(255, 255, 255, 0.03)',
		'--dchat-tab-color': 'rgba(255, 255, 255, 0.5)',
		'--dchat-tab-active-bg': 'rgba(255, 255, 255, 0.09)',
		'--dchat-tab-active-color': '#ffffff',
		'--dchat-input-bg': 'rgba(255, 255, 255, 0.1)',
		'--dchat-accent': '#8b5cf6',
		'--dchat-accent-2': '#6366f1',
		'--dchat-radius': '18px',
		'--dchat-font': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
	},
	customCSS: ''
};

function getThemeStyleEl() {
	let el = document.getElementById('dchat-theme-style');
	if (!el) {
		el = document.createElement('style');
		el.id = 'dchat-theme-style';
		document.head.appendChild(el);
	}
	return el;
}

function applyTheme(theme, { announce = false } = {}) {
	if (!desktopChat || !theme || !theme.cssVars) return;
	const vars = theme.cssVars;
	// Clear previous custom vars by resetting known keys to defaults first
	for (const k of Object.keys(DEFAULT_THEME.cssVars)) {
		desktopChat.style.removeProperty(k);
	}
	for (const [k, v] of Object.entries(vars)) {
		if (typeof k === 'string' && k.startsWith('--') && typeof v === 'string') {
			desktopChat.style.setProperty(k, v);
		}
	}
	const styleEl = getThemeStyleEl();
	const custom = typeof theme.customCSS === 'string' ? theme.customCSS : '';
	// Soft-scope: only keep rules that mention #desktop-chat, or wrap bare rules.
	styleEl.textContent = custom ? custom : '';
	currentTheme = {
		name: theme.name || 'Custom',
		cssVars: { ...vars },
		customCSS: custom
	};
	try {
		localStorage.setItem('carljr-theme', JSON.stringify(currentTheme));
	} catch { /* ignore quota */ }
	if (announce) updateStatus(`Theme: ${currentTheme.name}`, 'connected');
}

function snapshotCurrentTheme(name) {
	const cssVars = {};
	const cs = desktopChat ? getComputedStyle(desktopChat) : null;
	for (const k of Object.keys(DEFAULT_THEME.cssVars)) {
		let v = desktopChat?.style?.getPropertyValue(k)?.trim();
		if (!v && cs) v = cs.getPropertyValue(k)?.trim();
		if (!v) v = DEFAULT_THEME.cssVars[k];
		cssVars[k] = v;
	}
	// Also pick up any extra --dchat-* set inline
	if (desktopChat?.style) {
		for (let i = 0; i < desktopChat.style.length; i++) {
			const prop = desktopChat.style.item(i);
			if (prop.startsWith('--') && !(prop in cssVars)) {
				cssVars[prop] = desktopChat.style.getPropertyValue(prop).trim();
			}
		}
	}
	const styleEl = document.getElementById('dchat-theme-style');
	return {
		name: name || currentTheme?.name || 'My Theme',
		cssVars,
		customCSS: styleEl?.textContent || currentTheme?.customCSS || ''
	};
}

function parseThemeJsonBlocks(text) {
	const themes = [];
	const displayText = String(text || '').replace(/```theme-json\n([\s\S]*?)```/g, (match, body) => {
		try {
			const obj = JSON.parse(body.trim());
			if (obj && obj.cssVars && typeof obj.cssVars === 'object') {
				themes.push({
					name: obj.name || 'AI Theme',
					cssVars: obj.cssVars,
					customCSS: typeof obj.customCSS === 'string' ? obj.customCSS : ''
				});
				return `[Applied theme "${obj.name || 'AI Theme'}"]`;
			}
		} catch { /* ignore bad JSON */ }
		return '[Invalid theme-json block]';
	});
	// Also accept ```theme-css fences as customCSS-only overlays
	const withCss = displayText.replace(/```theme-css\n([\s\S]*?)```/g, (match, body) => {
		themes.push({
			name: currentTheme?.name || 'Custom CSS',
			cssVars: { ...(currentTheme?.cssVars || DEFAULT_THEME.cssVars) },
			customCSS: body.trim()
		});
		return '[Applied theme CSS]';
	});
	return { displayText: withCss.trim(), themes };
}

function setCommunitySection(section) {
	communitySection = section === 'themes' ? 'themes' : 'scenes';
	document.querySelectorAll('.dchat-subtab').forEach(btn => {
		btn.classList.toggle('active', btn.dataset.communitySection === communitySection);
	});
	const scenesSec = document.getElementById('dchat-community-section-scenes');
	const themesSec = document.getElementById('dchat-community-section-themes');
	if (scenesSec) scenesSec.classList.toggle('active', communitySection === 'scenes');
	if (themesSec) themesSec.classList.toggle('active', communitySection === 'themes');
	if (communitySection === 'themes') refreshCommunityThemes();
	else refreshCommunityScenes();
}

function uploadCurrentThemeToCommunity() {
	if (displayOnlyMode) return;
	const name = window.prompt('Theme name?', currentTheme?.name || 'My Theme');
	if (name == null) return;
	const theme = snapshotCurrentTheme(name.trim() || 'My Theme');
	updateStatus('Uploading theme...', 'connecting');
	fetch('/api/community-themes', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(theme)
	}).then(res => res.json().then(data => ({ ok: res.ok, data }))).then(({ ok, data }) => {
		if (!ok || data.error) throw new Error(data.error || 'Upload failed');
		updateStatus(`Uploaded theme "${data.theme?.name || theme.name}"`, 'connected');
		refreshCommunityThemes();
	}).catch(err => {
		updateStatus(`Theme upload error: ${err.message}`, 'error');
	});
}

function refreshCommunityThemes() {
	if (scenePanelSubTab === 'themes') {
		// XR will redraw from cache after fetch
	}
	if (!dchatThemesList && scenePanelSubTab !== 'themes') return;
	if (dchatThemesList) dchatThemesList.innerHTML = '<div class="dchat-scene-empty">Loading...</div>';
	fetch('/api/community-themes')
		.then(res => res.json().then(data => ({ ok: res.ok, data })))
		.then(({ ok, data }) => {
			if (!ok || data.error) throw new Error(data.error || 'Failed to list themes');
			renderCommunityThemeList(data.themes || []);
		})
		.catch(err => {
			communityThemesCache = [];
			if (scenePanelSubTab === 'themes') renderScenePanel();
			if (!dchatThemesList) return;
			dchatThemesList.innerHTML = '';
			const empty = document.createElement('div');
			empty.className = 'dchat-scene-empty';
			empty.textContent = err.message;
			dchatThemesList.appendChild(empty);
		});
}

function renderCommunityThemeList(themes) {
	communityThemesCache = themes;
	if (scenePanelSubTab === 'themes') renderScenePanel();
	if (!dchatThemesList) return;
	dchatThemesList.innerHTML = '';
	if (themes.length === 0) {
		const empty = document.createElement('div');
		empty.className = 'dchat-scene-empty';
		empty.textContent = 'No community themes yet. Restyle via chat, then upload!';
		dchatThemesList.appendChild(empty);
		return;
	}
	for (const th of themes) {
		const item = document.createElement('div');
		item.className = 'dchat-scene-item';

		const name = document.createElement('div');
		name.className = 'dchat-scene-name';
		name.textContent = th.name;
		name.title = th.name + (th.id ? ` (${th.id})` : '');

		const actions = document.createElement('div');
		actions.className = 'dchat-scene-actions';

		const apply = document.createElement('button');
		apply.className = 'dchat-btn accent';
		apply.textContent = 'Apply';
		apply.addEventListener('click', () => applyCommunityTheme(th));

		const rename = document.createElement('button');
		rename.className = 'dchat-btn';
		rename.textContent = 'Rename';
		rename.addEventListener('click', () => showRenameModal(th, 'theme'));

		actions.append(apply, rename);
		item.append(name, actions);
		dchatThemesList.appendChild(item);
	}
}

function applyCommunityTheme(th) {
	updateStatus(`Loading theme "${th.name}"...`, 'connecting');
	const fetchUrl = th.id ? `/api/community-themes/${encodeURIComponent(th.id)}` : th.url;
	fetch(fetchUrl)
		.then(res => {
			if (!res.ok) throw new Error('Failed to fetch theme');
			return res.json();
		})
		.then(data => {
			applyTheme(data, { announce: true });
		})
		.catch(err => {
			updateStatus(`Theme load error: ${err.message}`, 'error');
		});
}

function appendThemeChatBubble(role, content) {
	if (!dchatThemeChatMessages) return;
	const div = document.createElement('div');
	div.className = `dchat-theme-msg ${role}`;
	div.textContent = content;
	dchatThemeChatMessages.appendChild(div);
	dchatThemeChatMessages.scrollTop = dchatThemeChatMessages.scrollHeight;
}

async function sendThemeChat() {
	if (themeChatLoading || displayOnlyMode) return;
	const text = (dchatThemeChatInput?.value || '').trim();
	if (!text) return;
	if (dchatThemeChatInput) dchatThemeChatInput.value = '';
	themeChatMessages.push({ role: 'user', content: text });
	appendThemeChatBubble('user', text);
	themeChatLoading = true;
	if (dchatThemeChatSend) dchatThemeChatSend.disabled = true;
	appendThemeChatBubble('system', 'Thinking...');
	try {
		let data;
		if (selectedBackend === 'ollama') {
			data = await callOllamaDirect(
				cachedPrompts?.themePrompt || '',
				themeChatMessages.map(m => ({ role: m.role, content: m.content })),
				selectedOllamaModel,
				4096
			);
		} else {
			const response = await fetch('/api/theme-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: themeChatMessages.map(m => ({ role: m.role, content: m.content })),
					backend: selectedBackend
				})
			});
			const responseText = await response.text();
			try { data = JSON.parse(responseText); }
			catch { throw new Error(`Server returned non-JSON (${response.status}): ${responseText.slice(0, 120)}`); }
			if (!response.ok) throw new Error(data.error || `API error: ${response.status}`);
		}
		const rawText = data.content?.[0]?.text || data.content || 'No response';
		const raw = typeof rawText === 'string' ? rawText : (Array.isArray(rawText) ? rawText.map(p => p.text || '').join('') : String(rawText));
		themeChatMessages.push({ role: 'assistant', content: raw });
		const { displayText, themes } = parseThemeJsonBlocks(raw);
		// Remove "Thinking..." bubble
		if (dchatThemeChatMessages?.lastChild?.classList?.contains('system')) {
			dchatThemeChatMessages.lastChild.remove();
		}
		appendThemeChatBubble('assistant', displayText || '(theme applied)');
		if (themes.length > 0) {
			applyTheme(themes[themes.length - 1], { announce: true });
		}
	} catch (err) {
		if (dchatThemeChatMessages?.lastChild?.classList?.contains('system')) {
			dchatThemeChatMessages.lastChild.remove();
		}
		appendThemeChatBubble('system', `Error: ${err.message}`);
		updateStatus(`Theme chat error: ${err.message}`, 'error');
	} finally {
		themeChatLoading = false;
		if (dchatThemeChatSend) dchatThemeChatSend.disabled = false;
	}
}

async function bootSharedScene() {
	const route = parseShareRoute();
	if (route.displayOnly) applyDisplayOnlyMode();

	try {
		await new Promise((resolve) => {
			// Kick a refresh without blocking forever if Blob isn't configured.
			const p = fetch('/api/community-scenes')
				.then(res => res.json().then(data => ({ ok: res.ok, data })))
				.then(({ ok, data }) => {
					if (ok && !data.error) renderCommunitySceneList(data.scenes || []);
				})
				.catch(() => {})
				.finally(resolve);
			return p;
		});
	} catch {
		// ignore
	}

	if (!route.sceneId) return;

	try {
		updateStatus('Loading scene...', 'connecting');
		const sc = await loadCommunitySceneById(route.sceneId, { activate: true });
		document.title = sc.name ? `${sc.name} — Claude VR` : 'Claude VR Chat';
		if (editorLink) editorLink.href = sc.editorUrl || `/e/${route.sceneId}`;
		updateStatus(route.displayOnly ? '' : `Loaded "${sc.name}"`, route.displayOnly ? '' : 'connected');
	} catch (err) {
		updateStatus(`Load error: ${err.message}`, 'error');
	}
}

if (shareDisplayOnly) {
	shareDisplayOnly.addEventListener('change', () => {
		if (shareUrlInput) shareUrlInput.value = currentShareUrl();
	});
}
if (shareCloseBtn) shareCloseBtn.addEventListener('click', hideShareModal);
if (shareCopyBtn) {
	shareCopyBtn.addEventListener('click', async () => {
		const url = currentShareUrl();
		const ok = await copyText(url);
		shareCopyBtn.textContent = ok ? 'Copied!' : 'Copy failed';
		setTimeout(() => { if (shareCopyBtn) shareCopyBtn.textContent = 'Copy link'; }, 1500);
	});
}
if (shareModal) shareModal.addEventListener('click', (e) => { if (e.target === shareModal) hideShareModal(); });
if (renameCancelBtn) renameCancelBtn.addEventListener('click', hideRenameModal);
if (renameConfirmBtn) renameConfirmBtn.addEventListener('click', renameCommunityScene);
if (renameNameInput) {
	renameNameInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); renameCommunityScene(); }
	});
}
if (renameModal) renameModal.addEventListener('click', (e) => { if (e.target === renameModal) hideRenameModal(); });


exportScreenshotBtn.addEventListener('click', () => {
	pendingExportThumbnail = captureScreenshot();
	exportPreview.innerHTML = `<img src="${pendingExportThumbnail}" style="width:80px;height:80px;border-radius:8px;object-fit:cover;">`;
});
exportCancelBtn.addEventListener('click', hideExportModal);
exportConfirmBtn.addEventListener('click', doExport);
exportDownloadBtn.addEventListener('click', doDownloadExport);

// Scene Manager 3D Panel
function createScenePanel() {
	sceneCanvas = document.createElement('canvas');
	sceneCanvas.width = 384;
	sceneCanvas.height = 768;
	sceneContext = sceneCanvas.getContext('2d');

	sceneTexture = new THREE.CanvasTexture(sceneCanvas);
	sceneTexture.minFilter = THREE.LinearFilter;
	sceneTexture.magFilter = THREE.LinearFilter;

	const geometry = new THREE.PlaneGeometry(SCENE_PANEL_WIDTH, SCENE_PANEL_HEIGHT);
	const material = new THREE.MeshBasicMaterial({
		map: sceneTexture,
		transparent: true,
		side: THREE.DoubleSide
	});

	scenePanel = new THREE.Mesh(geometry, material);
	const sceneX = -(CHAT_PANEL_WIDTH / 2 + SCENE_PANEL_GAP + SCENE_PANEL_WIDTH / 2);
	scenePanel.position.set(sceneX, 1.4, -CHAT_PANEL_DISTANCE);
	scene.add(scenePanel);

	renderScenePanel();
}

// Mirrors the loaded-scenes list (canvas scene panel, VR-only) into the
// desktop Scenes tab: checkbox toggles active, × removes, thumbnail if any.
function renderDomSceneList() {
	if (!dchatSceneList) return;

	dchatSceneList.innerHTML = '';
	if (loadedScenes.length === 0) {
		const empty = document.createElement('div');
		empty.className = 'dchat-scene-empty';
		empty.textContent = 'No scenes loaded. Use Import File or Load Saved.';
		dchatSceneList.appendChild(empty);
	} else {
		for (let i = 0; i < loadedScenes.length; i++) {
			const sc = loadedScenes[i];
			const item = document.createElement('div');
			item.className = 'dchat-scene-item' + (sc.active ? ' active' : '');

			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.checked = sc.active;
			checkbox.addEventListener('change', () => {
				sc.active = checkbox.checked;
				rebuildSceneFromActive();
				renderScenePanel();
				notifyCodeEditorExternalChange();
			});

			const thumb = document.createElement('img');
			thumb.className = 'dchat-scene-thumb';
			if (sc.thumbnail) thumb.src = sc.thumbnail;

			const name = document.createElement('div');
			name.className = 'dchat-scene-name';
			name.textContent = sc.name;
			name.title = sc.name;

			const remove = document.createElement('button');
			remove.className = 'dchat-scene-remove';
			remove.textContent = '×';
			remove.title = 'Remove scene';
			remove.addEventListener('click', () => {
				loadedScenes.splice(i, 1);
				rebuildSceneFromActive();
				renderScenePanel();
				notifyCodeEditorExternalChange();
			});

			item.append(checkbox, thumb, name, remove);
			dchatSceneList.appendChild(item);
		}
	}

	const hasContent = loadedScenes.some(s => s.active) || executedCodeBlocks.length > 0;
	dchatExportCombinedMount.classList.toggle('visible', hasContent && loadedScenes.length > 0);
}

function renderScenePanel() {
	renderDomSceneList();
	if (!sceneContext) return;

	const ctx = sceneContext;
	const w = sceneCanvas.width;
	const h = sceneCanvas.height;

	ctx.clearRect(0, 0, w, h);

	// Background
	ctx.fillStyle = 'rgba(20, 20, 30, 0.92)';
	roundRect(ctx, 0, 0, w, h, 16);
	ctx.fill();

	// Header
	ctx.fillStyle = 'rgba(139, 92, 246, 0.3)';
	roundRect(ctx, 0, 0, w, 50, 16, true);
	ctx.fill();
	ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'center';
	ctx.fillText('Scenes', w / 2, 35);

	// Sub-tabs (Scenes / Community / Themes) - desktop has Community with
	// Scenes|Themes sections; XR uses a third mini-tab for theme Apply.
	const subTabButtons = SCENE_PANEL_SUB_TABS.map(t => ({
		...t,
		variant: scenePanelSubTab === t.id ? 'active' : 'inactiveToggle'
	}));
	const subTabLayout = buildButtonLayout(subTabButtons, { width: w - 24, x: 12, y: 58, height: 36, perRow: 3, gap: 6 });
	scenePanelSubTabBoxes = subTabLayout.boxes;
	drawButtonsToCanvas(ctx, scenePanelSubTabBoxes, { fontSize: 13 });

	const contentTop = 58 + subTabLayout.totalHeight + 10;

	if (scenePanelSubTab === 'scenes') {
		// Button row (shared spec - see SCENES_BUTTONS/handleMenuAction)
		const btnLayout = buildButtonLayout(SCENES_BUTTONS, { width: w - 24, x: 12, y: contentTop, height: 44, minWidth: 100, gap: 8 });
		scenePanelButtonBoxes = btnLayout.boxes;
		drawButtonsToCanvas(ctx, scenePanelButtonBoxes, { fontSize: 15 });

		// Separator
		const sepY = contentTop + btnLayout.totalHeight + 8;
		ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
		ctx.fillRect(12, sepY, w - 24, 1);

		// Scene list
		const listTop = sepY + 8;
		scenePanelListTop = listTop;
		const itemH = 72;
		const listBottom = 688;
		const maxVisible = Math.floor((listBottom - listTop) / itemH);

		if (loadedScenes.length === 0) {
			ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
			ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
			ctx.textAlign = 'center';
			ctx.fillText('No scenes loaded', w / 2, listTop + 40);
			ctx.fillText('Tap Load to import', w / 2, listTop + 65);
		} else {
			const maxScroll = Math.max(0, loadedScenes.length - maxVisible);
			sceneScrollOffset = Math.max(0, Math.min(sceneScrollOffset, maxScroll));

			for (let i = 0; i < maxVisible && (i + sceneScrollOffset) < loadedScenes.length; i++) {
				const sc = loadedScenes[i + sceneScrollOffset];
				const itemY = listTop + i * itemH;

				// Item background
				ctx.fillStyle = sc.active ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)';
				roundRect(ctx, 8, itemY, w - 16, itemH - 4, 8);
				ctx.fill();

				// Checkbox
				const chkX = 16, chkY = itemY + (itemH - 4) / 2 - 12;
				ctx.strokeStyle = sc.active ? '#6366f1' : 'rgba(255,255,255,0.3)';
				ctx.lineWidth = 2;
				roundRect(ctx, chkX, chkY, 24, 24, 4);
				ctx.stroke();
				if (sc.active) {
					ctx.fillStyle = '#6366f1';
					roundRect(ctx, chkX + 2, chkY + 2, 20, 20, 3);
					ctx.fill();
					ctx.strokeStyle = '#ffffff';
					ctx.lineWidth = 2.5;
					ctx.beginPath();
					ctx.moveTo(chkX + 6, chkY + 12);
					ctx.lineTo(chkX + 11, chkY + 18);
					ctx.lineTo(chkX + 19, chkY + 7);
					ctx.stroke();
				}

				// Thumbnail
				const thumbX = 48, thumbY2 = itemY + 8, thumbSize = itemH - 20;
				if (sc._thumbImage) {
					ctx.drawImage(sc._thumbImage, thumbX, thumbY2, thumbSize, thumbSize);
				} else {
					ctx.fillStyle = 'rgba(255,255,255,0.08)';
					roundRect(ctx, thumbX, thumbY2, thumbSize, thumbSize, 6);
					ctx.fill();
					ctx.font = '10px sans-serif';
					ctx.fillStyle = 'rgba(255,255,255,0.25)';
					ctx.textAlign = 'center';
					ctx.fillText('No img', thumbX + thumbSize / 2, thumbY2 + thumbSize / 2 + 4);
				}

				// Scene name
				ctx.textAlign = 'left';
				ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
				ctx.fillStyle = '#ffffff';
				const nameX = thumbX + thumbSize + 10;
				const maxNameW = w - nameX - 40;
				let dName = sc.name;
				while (ctx.measureText(dName).width > maxNameW && dName.length > 3) dName = dName.slice(0, -1);
				if (dName !== sc.name) dName += '\u2026';
				ctx.fillText(dName, nameX, itemY + itemH / 2 + 5);

				// Remove button (X)
				const xX = w - 36, xY = itemY + (itemH - 4) / 2 - 10;
				ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
				roundRect(ctx, xX, xY, 24, 24, 4);
				ctx.fill();
				ctx.font = 'bold 16px sans-serif';
				ctx.fillStyle = '#ef4444';
				ctx.textAlign = 'center';
				ctx.fillText('\u00d7', xX + 12, xY + 18);
			}

			// Scroll indicators
			if (sceneScrollOffset > 0) {
				ctx.fillStyle = 'rgba(255,255,255,0.3)';
				ctx.font = '14px sans-serif';
				ctx.textAlign = 'center';
				ctx.fillText('\u25b2 more', w / 2, listTop - 4);
			}
			if (sceneScrollOffset < maxScroll) {
				ctx.fillStyle = 'rgba(255,255,255,0.3)';
				ctx.font = '14px sans-serif';
				ctx.textAlign = 'center';
				ctx.fillText('\u25bc more', w / 2, listBottom + 14);
			}
		}

		// Export Combined button (shared spec - see EXPORT_COMBINED_BUTTON)
		const hasContent = loadedScenes.some(s => s.active) || executedCodeBlocks.length > 0;
		if (hasContent && loadedScenes.length > 0) {
			drawButtonsToCanvas(ctx, buildButtonLayout(EXPORT_COMBINED_BUTTON, { width: w - 24, x: 12, y: 700, height: 48, perRow: 1 }).boxes, { fontSize: 18 });
		}
	} else if (scenePanelSubTab === 'themes') {
		// Themes sub-tab: upload/refresh/reset + Apply list (theme chat is desktop-only).
		const btnLayout = buildButtonLayout(THEME_BUTTONS, { width: w - 24, x: 12, y: contentTop, height: 40, perRow: 3, gap: 6 });
		scenePanelButtonBoxes = btnLayout.boxes;
		drawButtonsToCanvas(ctx, scenePanelButtonBoxes, { fontSize: 12 });

		const sepY = contentTop + btnLayout.totalHeight + 8;
		ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
		ctx.fillRect(12, sepY, w - 24, 1);

		const listTop = sepY + 8;
		scenePanelListTop = listTop;
		const itemH = 56;
		const listBottom = h - 16;
		const maxVisible = Math.floor((listBottom - listTop) / itemH);

		if (communityThemesCache.length === 0) {
			ctx.font = '15px -apple-system, BlinkMacSystemFont, sans-serif';
			ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
			ctx.textAlign = 'center';
			ctx.fillText('No community themes yet', w / 2, listTop + 40);
			ctx.fillText('(restyle chat is on desktop)', w / 2, listTop + 62);
		} else {
			for (let i = 0; i < maxVisible && i < communityThemesCache.length; i++) {
				const th = communityThemesCache[i];
				const itemY = listTop + i * itemH;

				ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
				roundRect(ctx, 8, itemY, w - 16, itemH - 4, 8);
				ctx.fill();

				ctx.textAlign = 'left';
				ctx.font = '15px -apple-system, BlinkMacSystemFont, sans-serif';
				ctx.fillStyle = '#ffffff';
				const nameX = 16;
				const maxNameW = w - nameX - 80;
				let dName = th.name;
				while (ctx.measureText(dName).width > maxNameW && dName.length > 3) dName = dName.slice(0, -1);
				if (dName !== th.name) dName += '…';
				ctx.fillText(dName, nameX, itemY + itemH / 2 + 5);

				const pillW = 60, pillH = itemH - 16, pillX = w - 16 - pillW, pillY = itemY + 8;
				ctx.fillStyle = 'rgba(16, 185, 129, 0.45)';
				roundRect(ctx, pillX, pillY, pillW, pillH, 8);
				ctx.fill();
				ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif';
				ctx.fillStyle = '#ffffff';
				ctx.textAlign = 'center';
				ctx.fillText('Apply', pillX + pillW / 2, pillY + pillH / 2 + 4);
			}
		}
	} else {
		// Community sub-tab: shared button spec + a simple name/Load list.
		const btnLayout = buildButtonLayout(COMMUNITY_BUTTONS, { width: w - 24, x: 12, y: contentTop, height: 44, perRow: 2, gap: 8 });
		scenePanelButtonBoxes = btnLayout.boxes;
		drawButtonsToCanvas(ctx, scenePanelButtonBoxes, { fontSize: 15 });

		const sepY = contentTop + btnLayout.totalHeight + 8;
		ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
		ctx.fillRect(12, sepY, w - 24, 1);

		const listTop = sepY + 8;
		scenePanelListTop = listTop;
		const itemH = 56;
		const listBottom = h - 16;
		const maxVisible = Math.floor((listBottom - listTop) / itemH);

		if (communityScenesCache.length === 0) {
			ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
			ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
			ctx.textAlign = 'center';
			ctx.fillText('No community scenes yet', w / 2, listTop + 40);
		} else {
			for (let i = 0; i < maxVisible && i < communityScenesCache.length; i++) {
				const cs = communityScenesCache[i];
				const itemY = listTop + i * itemH;

				ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
				roundRect(ctx, 8, itemY, w - 16, itemH - 4, 8);
				ctx.fill();

				ctx.textAlign = 'left';
				ctx.font = '15px -apple-system, BlinkMacSystemFont, sans-serif';
				ctx.fillStyle = '#ffffff';
				const nameX = 16;
				const maxNameW = w - nameX - 80;
				let dName = cs.name;
				while (ctx.measureText(dName).width > maxNameW && dName.length > 3) dName = dName.slice(0, -1);
				if (dName !== cs.name) dName += '…';
				ctx.fillText(dName, nameX, itemY + itemH / 2 + 5);

				// High-contrast Load pill
				const pillW = 60, pillH = itemH - 16, pillX = w - 16 - pillW, pillY = itemY + 8;
				ctx.fillStyle = '#f4f4f8';
				roundRect(ctx, pillX, pillY, pillW, pillH, 8);
				ctx.fill();
				ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif';
				ctx.fillStyle = '#12121a';
				ctx.textAlign = 'center';
				ctx.fillText('Load', pillX + pillW / 2, pillY + pillH / 2 + 4);
			}
		}
	}


	ctx.textAlign = 'left';
	sceneTexture.needsUpdate = true;
}

function loadSceneThumbnails() {
	for (const sc of loadedScenes) {
		if (sc.thumbnail && !sc._thumbImage) {
			const img = new Image();
			img.onload = () => { sc._thumbImage = img; renderScenePanel(); };
			img.src = sc.thumbnail;
		}
	}
}

function handleScenePanelHit(uv) {
	const canvasX = uv.x * 384;
	const canvasY = (1 - uv.y) * 768;

	// Sub-tabs (Scenes / Community)
	const subTabHit = hitTestButtons(scenePanelSubTabBoxes, canvasX, canvasY);
	if (subTabHit) {
		handleMenuAction(subTabHit.action);
		return;
	}

	// Button row (shared spec - see SCENES_BUTTONS/COMMUNITY_BUTTONS/handleMenuAction)
	const btnHit = hitTestButtons(scenePanelButtonBoxes, canvasX, canvasY);
	if (btnHit) {
		handleMenuAction(btnHit.action);
		return;
	}

	if (scenePanelSubTab === 'scenes') {
		// Scene list
		const listTop = scenePanelListTop, itemH = 72, listBottom = 688;
		const maxVisible = Math.floor((listBottom - listTop) / itemH);
		if (canvasY >= listTop && canvasY < listTop + maxVisible * itemH) {
			const idx = Math.floor((canvasY - listTop) / itemH) + sceneScrollOffset;
			if (idx >= 0 && idx < loadedScenes.length) {
				if (canvasX >= 384 - 36) {
					// Remove
					loadedScenes.splice(idx, 1);
					rebuildSceneFromActive();
					renderScenePanel();
					notifyCodeEditorExternalChange();
				} else if (canvasX < 48) {
					// Toggle active
					loadedScenes[idx].active = !loadedScenes[idx].active;
					rebuildSceneFromActive();
					renderScenePanel();
					notifyCodeEditorExternalChange();
				}
			}
			return;
		}

		// Export Combined button
		const combHit = hitTestButtons(buildButtonLayout(EXPORT_COMBINED_BUTTON, { width: 384 - 24, x: 12, y: 700, height: 48, perRow: 1 }).boxes, canvasX, canvasY);
		if (combHit) handleMenuAction(combHit.action);
	} else if (scenePanelSubTab === 'themes') {
		const listTop = scenePanelListTop, itemH = 56;
		const idx = Math.floor((canvasY - listTop) / itemH);
		if (canvasY >= listTop && idx >= 0 && idx < communityThemesCache.length) {
			applyCommunityTheme(communityThemesCache[idx]);
		}
	} else {
		// Community list - each row is name + a "Load" pill, see renderScenePanel
		const listTop = scenePanelListTop, itemH = 56;
		const idx = Math.floor((canvasY - listTop) / itemH);
		if (canvasY >= listTop && idx >= 0 && idx < communityScenesCache.length) {
			loadCommunityScene(communityScenesCache[idx]);
		}
	}
}

// ============================================================================
// XR Controller Input & Raycasting
// ============================================================================
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

function createControllerRay() {
	const rayLength = 5;
	const points = [
		new THREE.Vector3(0, 0, 0),
		new THREE.Vector3(0, 0, -rayLength)
	];
	const geometry = new THREE.BufferGeometry().setFromPoints(points);

	// Gradient ray: bright at hand, fades out
	const colors = new Float32Array([
		0.4, 0.4, 1.0,  // start: soft blue-indigo
		0.0, 0.0, 0.0   // end: fades to nothing
	]);
	geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

	const material = new THREE.LineBasicMaterial({
		vertexColors: true,
		transparent: true,
		opacity: 0.6,
		blending: THREE.AdditiveBlending,
		depthWrite: false
	});

	return new THREE.Line(geometry, material);
}

// Small reticle dot at the end of the ray for aiming feedback
function createReticle() {
	const geometry = new THREE.RingGeometry(0.005, 0.012, 24);
	const material = new THREE.MeshBasicMaterial({
		color: 0x6366f1,
		transparent: true,
		opacity: 0.8,
		side: THREE.DoubleSide,
		depthTest: false
	});
	const ring = new THREE.Mesh(geometry, material);
	ring.visible = false;
	scene.add(ring);
	return ring;
}

const controllerRays = [];
const reticles = [];

function setupXRControllers() {
	for (let i = 0; i < 2; i++) {
		const controller = renderer.xr.getController(i);
		controller.addEventListener('selectstart', onXRSelectStart);

		// Attach ray line to controller
		const ray = createControllerRay();
		controller.add(ray);
		controllerRays.push(ray);

		// Create a reticle for hit feedback
		reticles.push(createReticle());

		// Controllers ride in the player rig so their rays stay correct as the
		// user moves/turns via locomotion.
		player.add(controller);
	}
}

function onXRSelectStart(event) {
	const controller = event.target;

	tempMatrix.identity().extractRotation(controller.matrixWorld);
	raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
	raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

	// UI collapse toggle — head-locked, always available (even when collapsed).
	if (uiTogglePanel) {
		const tHits = raycaster.intersectObject(uiTogglePanel);
		if (tHits.length > 0) {
			toggleUi();
			return;
		}
	}
	// When collapsed, the panels are hidden — nothing else is interactable.
	if (uiCollapsed) return;

	// Check scene manager panel hit
	if (scenePanel) {
		const sceneHits = raycaster.intersectObject(scenePanel);
		if (sceneHits.length > 0 && sceneHits[0].uv) {
			handleScenePanelHit(sceneHits[0].uv);
			return;
		}
	}

	// Check side panel hit first (toggle + color wheel)
	if (sidePanel) {
		const sideHits = raycaster.intersectObject(sidePanel);
		if (sideHits.length > 0 && sideHits[0].uv) {
			handleSidePanelHit(sideHits[0].uv);
			return;
		}
	}

	// Check input panel hit: [input area][MIC][KEYS][Send]
	if (inputPanel) {
		const intersects = raycaster.intersectObject(inputPanel);
		if (intersects.length > 0 && intersects[0].uv) {
			const L = inputPanelLayout();
			const cx = intersects[0].uv.x * L.W;
			if (cx >= L.sendX) {
				handleXRSend();
			} else if (cx >= L.kbdX && cx < L.kbdX + L.kbdW) {
				toggleKeyboard();
			} else if (cx >= L.micX && cx < L.micX + L.micW) {
				toggleMicAlwaysOn();
			}
			// The input area itself is a no-op in XR: text comes from the in-scene
			// keyboard or the mic, never from focusing the crash-prone DOM input.
			return;
		}
	}

	// Check virtual keyboard hit (only when it's showing)
	if (keyboardPanel && !keyboardCollapsed) {
		const kbHits = raycaster.intersectObject(keyboardPanel);
		if (kbHits.length > 0 && kbHits[0].uv) {
			handleKeyboardHit(kbHits[0].uv);
			return;
		}
	}
}

function handleXRSend() {
	const message = inputText.trim();
	if (message) {
		sendMessage(message);
		chatInput.value = '';
		inputText = '';
		renderInputToCanvas();
	}
}

setupXRControllers();

// Sync DOM input to 3D input panel
chatInput.addEventListener('input', () => {
	inputText = chatInput.value;
	renderInputToCanvas();
});

// ============================================================================
// VR Code Execution Engine
// ============================================================================

/**
 * Parse Claude's response to extract vr-exec code blocks.
 * Returns display text (with code blocks replaced by markers) and the code blocks.
 */
function parseVrExecBlocks(text) {
	const codeBlocks = [];
	const displayText = text.replace(/```vr-exec\n([\s\S]*?)```/g, (match, code) => {
		codeBlocks.push(code.trim());
		return `[Executed code block ${codeBlocks.length}]`;
	});
	return { displayText: displayText.trim(), codeBlocks };
}

/**
 * Execute a code string with access to scene globals.
 * Runs as an AsyncFunction so vr-exec blocks can use top-level await.
 * Returns a Promise that resolves once the code finishes.
 */
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function executeVrCode(code) {
	const fn = new AsyncFunction('THREE', 'scene', 'camera', 'renderer', 'document', 'hud', code);
	// Re-anchor stray HUD objects once the block finishes (success or failure).
	return Promise.resolve(fn(THREE, scene, camera, renderer, document, hud)).finally(reanchorStrayObjects);
}

// Safety net: an object that ends up parented to the camera or to a UI panel
// would move/rotate with the user's view or the chat window. After each block we
// move any such stray back into the world, preserving its current world transform
// so it stays put in the room. Objects the model was *directed* to make
// head-locked go under `hud` (a child of the camera) and are left alone.
function reanchorStrayObjects() {
	// Camera: strays follow the head; the intentional `hud` group is exempt.
	for (let i = camera.children.length - 1; i >= 0; i--) {
		const child = camera.children[i];
		if (child === hud) continue;
		scene.attach(child); // reparent to the scene root, keeping world transform
	}
	// UI panels never legitimately have child meshes, so anything parented to one
	// is a stray object that would ride along with the window — re-anchor it.
	const panels = [chatPanel, inputPanel, keyboardPanel, sidePanel, scenePanel];
	for (const panel of panels) {
		if (!panel) continue;
		for (let i = panel.children.length - 1; i >= 0; i--) {
			scene.attach(panel.children[i]);
		}
	}
}

const MAX_FIX_ATTEMPTS = 3;

/**
 * Attempt to fix a failing code block via the error-correction API.
 * Returns { success, code, error } — the final fixed code if successful.
 */
async function attemptAutoFix(failingCode, errorMessage, errorStack) {
	const priorFixes = [];

	for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
		updateStatus(`Fixing code (attempt ${attempt}/${MAX_FIX_ATTEMPTS})...`, '');
		renderChatToCanvas();

		const thisFailingCode = attempt === 1 ? failingCode : priorFixes[priorFixes.length - 1].code;

		try {
			let data;
			if (selectedBackend === 'ollama') {
				// Built to match the server's /api/fix-code prompt exactly (see
				// server.js) - kept client-side too so no code/error content has
				// to transit the server just to reach the user's own local model.
				let userContent = `The following vr-exec code block failed to execute.\n\n`;
				userContent += `**Error:** \`${errorMessage}\`\n`;
				if (errorStack) userContent += `**Stack:** \`${errorStack}\`\n`;
				userContent += `**Attempt:** ${attempt} of ${MAX_FIX_ATTEMPTS}\n\n`;
				userContent += `**Failing code:**\n\`\`\`javascript\n${thisFailingCode}\n\`\`\`\n\n`;
				if (priorFixes.length > 0) {
					userContent += `**Previous fix attempts that also failed:**\n`;
					for (const fix of priorFixes) {
						userContent += `\nAttempt ${fix.attempt} error: \`${fix.error}\`\n`;
						userContent += `\`\`\`javascript\n${fix.code}\n\`\`\`\n`;
					}
					userContent += `\nThe prior fixes did not work. Try a different approach.\n`;
				}
				userContent += `\nFix this code. Return ONLY a single \`vr-exec\` code block.`;

				data = await callOllamaDirect(
					cachedPrompts?.fixCodePrompt || '',
					[{ role: 'user', content: userContent }],
					selectedOllamaModel,
					8192
				);
			} else {
				const response = await fetch('/api/fix-code', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						failingCode: thisFailingCode,
						errorMessage,
						errorStack,
						attempt,
						priorFixes,
						backend: selectedBackend
					})
				});

				const responseText = await response.text();
				try {
					data = JSON.parse(responseText);
				} catch (e) {
					throw new Error(`Fix API returned non-JSON: ${responseText.slice(0, 120)}`);
				}

				if (!response.ok) {
					throw new Error(data.error || `Fix API error: ${response.status}`);
				}
			}

			const fixedRaw = data.content[0]?.text || '';
			const { codeBlocks: fixedBlocks } = parseVrExecBlocks(fixedRaw);

			if (fixedBlocks.length === 0) {
				// The response didn't contain a vr-exec block — try extracting from plain code fences
				const plainMatch = fixedRaw.match(/```(?:javascript|js)?\n([\s\S]*?)```/);
				if (plainMatch) {
					fixedBlocks.push(plainMatch[1].trim());
				}
			}

			if (fixedBlocks.length === 0) {
				throw new Error('Fix response contained no code block');
			}

			const fixedCode = fixedBlocks[0];

			// Try executing the fixed code
			try {
				await executeVrCode(fixedCode);
				return { success: true, code: fixedCode, attempts: attempt };
			} catch (retryErr) {
				// This fix also failed — record it and try again
				errorMessage = retryErr.message;
				errorStack = retryErr.stack;
				priorFixes.push({ attempt, code: fixedCode, error: retryErr.message });
			}

		} catch (apiErr) {
			console.error(`Fix attempt ${attempt} API error:`, apiErr);
			return { success: false, code: null, error: apiErr.message, attempts: attempt };
		}
	}

	return {
		success: false,
		code: null,
		error: `Failed after ${MAX_FIX_ATTEMPTS} fix attempts. Last error: ${errorMessage}`,
		attempts: MAX_FIX_ATTEMPTS
	};
}

// ============================================================================
// Chat attachments (desktop only - images and text-ish files for context)
// ============================================================================
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024; // 6MB raw per file
const MAX_ATTACHMENTS = 4;
const TEXTY_FILE_EXT = /\.(txt|md|markdown|json|js|jsx|ts|tsx|py|csv|html|htm|css|xml|yaml|yml|log|c|cpp|h|hpp|java|go|rs|sh|sql|ini|toml)$/i;

function isTextyFile(file) {
	return file.type.startsWith('text/') || file.type === 'application/json' || TEXTY_FILE_EXT.test(file.name);
}

function readFileAsDataURL(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(reader.error || new Error('Read failed'));
		reader.readAsDataURL(file);
	});
}

function readFileAsText(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(reader.error || new Error('Read failed'));
		reader.readAsText(file);
	});
}

async function addAttachments(fileList) {
	for (const file of fileList) {
		if (pendingAttachments.length >= MAX_ATTACHMENTS) {
			updateStatus(`Only ${MAX_ATTACHMENTS} attachments at a time`, 'error');
			break;
		}
		if (file.size > MAX_ATTACHMENT_BYTES) {
			updateStatus(`"${file.name}" is too large (max ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB)`, 'error');
			continue;
		}
		try {
			if (file.type.startsWith('image/')) {
				const dataUrl = await readFileAsDataURL(file);
				const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
				pendingAttachments.push({
					id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
					name: file.name,
					kind: 'image',
					mediaType: file.type,
					base64
				});
			} else if (isTextyFile(file)) {
				const text = await readFileAsText(file);
				pendingAttachments.push({
					id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
					name: file.name,
					kind: 'text',
					text
				});
			} else {
				updateStatus(`"${file.name}" isn't a supported type — images and text files only`, 'error');
			}
		} catch (err) {
			updateStatus(`Couldn't read "${file.name}": ${err.message}`, 'error');
		}
	}
	renderAttachmentChips();
}

function renderAttachmentChips() {
	if (!desktopAttachmentsRow) return;
	desktopAttachmentsRow.innerHTML = '';
	desktopAttachmentsRow.hidden = pendingAttachments.length === 0;
	for (const att of pendingAttachments) {
		const chip = document.createElement('div');
		chip.className = 'dchat-attachment-chip';

		const icon = document.createElement('span');
		icon.textContent = att.kind === 'image' ? '🖼️' : '📄';

		const name = document.createElement('span');
		name.className = 'dchat-attachment-name';
		name.textContent = att.name;
		name.title = att.name;

		const remove = document.createElement('button');
		remove.className = 'dchat-attachment-remove';
		remove.textContent = '×';
		remove.title = 'Remove';
		remove.addEventListener('click', () => {
			pendingAttachments = pendingAttachments.filter(a => a.id !== att.id);
			renderAttachmentChips();
		});

		chip.append(icon, name, remove);
		desktopAttachmentsRow.appendChild(chip);
	}
}

// Shapes attached files into whatever the selected backend expects. Text
// files fold directly into the plain-text message (works identically for
// every backend); images need a backend-specific content shape, since
// Anthropic, OpenAI, and Ollama each represent an inline image differently.
function buildUserContent(userMessage, attachments, backend) {
	let text = userMessage;
	for (const att of attachments.filter(a => a.kind === 'text')) {
		text += `\n\n--- File: ${att.name} ---\n${att.text}`;
	}

	const images = attachments.filter(a => a.kind === 'image');
	if (images.length === 0) return { content: text };

	if (backend === 'ollama') {
		// Ollama's /api/chat takes images as a separate per-message field
		// (raw base64, no "data:" prefix), not inline in content.
		return { content: text || '(see attached image)', images: images.map(a => a.base64) };
	}

	if (backend === 'openai') {
		const parts = [{ type: 'text', text: text || '(see attached image)' }];
		for (const att of images) {
			parts.push({ type: 'image_url', image_url: { url: `data:${att.mediaType};base64,${att.base64}` } });
		}
		return { content: parts };
	}

	// claude / fable (Anthropic content-block shape)
	const parts = [{ type: 'text', text: text || '(see attached image)' }];
	for (const att of images) {
		parts.push({ type: 'image', source: { type: 'base64', media_type: att.mediaType, data: att.base64 } });
	}
	return { content: parts };
}

// ============================================================================
// Claude API Integration (via proxy server)
// ============================================================================
async function sendMessage(userMessage) {
	if (!userMessage.trim() && pendingAttachments.length === 0) return;

	// Fold attachments into this message, then clear the staging area - see
	// buildUserContent() for how each attachment kind/backend is shaped.
	const attachments = pendingAttachments;
	pendingAttachments = [];
	renderAttachmentChips();

	const { content: userContent, images: ollamaImages } = buildUserContent(userMessage, attachments, selectedBackend);

	// Add user message to both arrays
	messages.push({ role: 'user', content: userContent, ...(ollamaImages ? { images: ollamaImages } : {}) });
	displayMessages.push({
		role: 'user',
		content: userMessage + (attachments.length > 0 ? `\n\n📎 ${attachments.map(a => a.name).join(', ')}` : '')
	});
	chatScrollOffset = 0; // auto-scroll to bottom on new message

	// Set loading state BEFORE rendering so the "Claude is thinking..." indicator
	// is drawn immediately — otherwise it only appears on the next render (which
	// previously required a click/interaction to trigger).
	isLoading = true;
	sendButton.disabled = true;
	updateStatus('Sending...', '');
	renderChatToCanvas();

	try {
		let data;
		if (selectedBackend === 'ollama') {
			data = await callOllamaDirect(
				cachedPrompts?.systemPrompt || '',
				messages.map(m => ({ role: m.role, content: m.content, ...(m.images ? { images: m.images } : {}) })),
				selectedOllamaModel
			);
		} else {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					messages: messages.map(m => ({
						role: m.role,
						content: m.content
					})),
					backend: selectedBackend
				})
			});

			// Read as text first to avoid opaque JSON parse errors
			const responseText = await response.text();
			try {
				data = JSON.parse(responseText);
			} catch (parseErr) {
				throw new Error(`Server returned non-JSON (${response.status}): ${responseText.slice(0, 120)}`);
			}

			if (!response.ok) {
				throw new Error(data.error || `API error: ${response.status}`);
			}
		}
		const rawText = data.content[0]?.text || 'No response';

		// Parse and execute any vr-exec code blocks
		const { displayText, codeBlocks } = parseVrExecBlocks(rawText);

		// Store raw text for API context, cleaned text for display
		messages.push({ role: 'assistant', content: rawText });
		displayMessages.push({ role: 'assistant', content: displayText });

		if (codeBlocks.length > 0) {
			let execCount = 0;
			let fixCount = 0;
			for (const code of codeBlocks) {
				try {
					await executeVrCode(code);
					executedCodeBlocks.push(code);
					execCount++;
				} catch (execErr) {
					console.error('vr-exec error:', execErr);
					displayMessages.push({
						role: 'assistant',
						content: `[Code error: ${execErr.message} — auto-fixing...]`
					});
					chatScrollOffset = 0;
					renderChatToCanvas();

					// Attempt auto-fix
					const fix = await attemptAutoFix(code, execErr.message, execErr.stack);
					if (fix.success) {
						executedCodeBlocks.push(fix.code);
						execCount++;
						fixCount++;
						displayMessages.push({
							role: 'assistant',
							content: `[Fixed after ${fix.attempts} attempt${fix.attempts > 1 ? 's' : ''}]`
						});
					} else {
						displayMessages.push({
							role: 'assistant',
							content: `[Auto-fix failed: ${fix.error}]`
						});
					}
				}
			}
			if (execCount > 0) {
				const fixNote = fixCount > 0 ? ` (${fixCount} auto-fixed)` : '';
				updateStatus(`Connected — ran ${execCount} block${execCount > 1 ? 's' : ''}${fixNote}`, 'connected');
				notifyCodeEditorExternalChange();
			} else {
				updateStatus('Connected', 'connected');
			}
		} else {
			updateStatus('Connected', 'connected');
		}

	} catch (error) {
		console.error('Chat error:', error);
		updateStatus(`Error: ${error.message}`, 'error');
		const errMsg = `Error: ${error.message}`;
		messages.push({ role: 'assistant', content: errMsg });
		displayMessages.push({ role: 'assistant', content: errMsg });
	} finally {
		isLoading = false;
		sendButton.disabled = false;
		chatScrollOffset = 0; // auto-scroll to bottom on response
		renderChatToCanvas();
	}
}

function updateStatus(text, className) {
	statusElement.textContent = text;
	statusElement.className = className || '';
	updateHudStatus(text, className);
}

// ============================================================================
// Head-locked HUD status badge (mirrors the DOM #status notification in VR/AR)
// ============================================================================
// A small badge parented to `hud` (a child of the camera), so head/motion
// tracking keeps it pinned to the view. It sits in the lower-right periphery —
// out of the focused center of vision — and only appears for active/transient
// states, so the stage stays clean and it's cheap (the canvas is redrawn only
// when the status text changes, and it's a tiny always-on-top plane).
function createHudStatus() {
	hudStatusCanvas = document.createElement('canvas');
	hudStatusCanvas.width = 512;
	hudStatusCanvas.height = 128;
	hudStatusContext = hudStatusCanvas.getContext('2d');

	hudStatusTexture = new THREE.CanvasTexture(hudStatusCanvas);
	hudStatusTexture.minFilter = THREE.LinearFilter;
	hudStatusTexture.magFilter = THREE.LinearFilter;

	const geo = new THREE.PlaneGeometry(0.2, 0.05);
	const mat = new THREE.MeshBasicMaterial({
		map: hudStatusTexture,
		transparent: true,
		depthTest: false,  // draw over the scene like a notification overlay
		depthWrite: false
	});
	hudStatusPanel = new THREE.Mesh(geo, mat);
	// Head-locked, lower-right periphery, ~0.9 m ahead. As a child of `hud` it
	// inherits the camera's orientation, so it always faces the user.
	hudStatusPanel.position.set(0.4, -0.25, -0.9);
	hudStatusPanel.renderOrder = 999;
	hudStatusPanel.visible = false;
	hud.add(hudStatusPanel);
}

function renderHudStatus(text, className) {
	if (!hudStatusContext) return;
	const ctx = hudStatusContext;
	const W = hudStatusCanvas.width;
	const H = hudStatusCanvas.height;

	ctx.clearRect(0, 0, W, H);

	let bg = 'rgba(30, 30, 40, 0.90)';
	let dot = '#6366f1';
	if (className === 'error') { bg = 'rgba(70, 22, 22, 0.92)'; dot = '#ef4444'; }
	else if (className === 'connected') { bg = 'rgba(18, 48, 34, 0.92)'; dot = '#10b981'; }

	ctx.fillStyle = bg;
	roundRect(ctx, 0, 0, W, H, 28);
	ctx.fill();

	// Status dot
	ctx.beginPath();
	ctx.arc(44, H / 2, 15, 0, Math.PI * 2);
	ctx.fillStyle = dot;
	ctx.fill();

	// Text, truncated to fit
	ctx.fillStyle = '#ffffff';
	ctx.font = '38px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	let t = text;
	const maxW = W - 96;
	if (ctx.measureText(t).width > maxW) {
		while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
		t += '…';
	}
	ctx.fillText(t, 76, H / 2 + 2);
	ctx.textBaseline = 'alphabetic';

	hudStatusTexture.needsUpdate = true;
}

// Show the badge for active/transient states; hide for idle to keep the view clean.
function updateHudStatus(text, className) {
	if (!hudStatusPanel) return;
	if (displayOnlyMode) {
		hudStatusPanel.visible = false;
		return;
	}
	const idle = !text || text === 'Ready' || text === 'Connected';
	hudStatusPanel.visible = !idle;
	if (!idle) renderHudStatus(text, className);
}

// ============================================================================
// Collapse-all-UI toggle (head-locked button, works even when the UI is hidden)
// ============================================================================
function createUiToggle() {
	uiToggleCanvas = document.createElement('canvas');
	uiToggleCanvas.width = 384;
	uiToggleCanvas.height = 128;
	uiToggleContext = uiToggleCanvas.getContext('2d');

	uiToggleTexture = new THREE.CanvasTexture(uiToggleCanvas);
	uiToggleTexture.minFilter = THREE.LinearFilter;
	uiToggleTexture.magFilter = THREE.LinearFilter;

	const geo = new THREE.PlaneGeometry(0.14, 0.047);
	const mat = new THREE.MeshBasicMaterial({
		map: uiToggleTexture,
		transparent: true,
		depthTest: false,  // always drawn on top so it's reachable over any scene
		depthWrite: false
	});
	uiTogglePanel = new THREE.Mesh(geo, mat);
	// Head-locked, upper-right — always in reach even when the panels are hidden.
	uiTogglePanel.position.set(0.34, 0.2, -0.85);
	uiTogglePanel.renderOrder = 999;
	hud.add(uiTogglePanel);

	renderUiToggle();
}

function renderUiToggle() {
	if (!uiToggleContext) return;
	const ctx = uiToggleContext;
	const W = uiToggleCanvas.width;
	const H = uiToggleCanvas.height;

	ctx.clearRect(0, 0, W, H);
	ctx.fillStyle = uiCollapsed ? '#6366f1' : 'rgba(30, 30, 40, 0.9)';
	roundRect(ctx, 0, 0, W, H, 28);
	ctx.fill();

	ctx.fillStyle = '#ffffff';
	ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(uiCollapsed ? 'Show UI' : 'Hide UI', W / 2, H / 2 + 2);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	uiToggleTexture.needsUpdate = true;
}

// Hide/show every main panel (3D) and the DOM chat overlay (windowed view). The
// head-locked toggle button and the status badge stay visible so the UI can
// always be brought back.
function setUiCollapsed(collapsed) {
	if (displayOnlyMode) collapsed = true;
	uiCollapsed = collapsed;
	const immersive = renderer.xr.isPresenting;
	const show = !collapsed;
	if (immersive) {
		if (chatPanel) chatPanel.visible = show;
		if (inputPanel) inputPanel.visible = show;
		if (sidePanel) sidePanel.visible = show;
		if (scenePanel) scenePanel.visible = show;
		// The keyboard also respects its own collapsed state when the UI is shown.
		if (keyboardPanel) keyboardPanel.visible = show && !keyboardCollapsed;

		const chatOverlay = document.getElementById('chat-overlay');
		if (chatOverlay) chatOverlay.style.display = show ? '' : 'none';
	} else {
		setDesktopChatMinimized(collapsed);
	}

	renderUiToggle();
	updateUiToggleDOM();
	updateStatus(collapsed ? 'UI hidden' : '', '');
}

function toggleUi() {
	setUiCollapsed(!uiCollapsed);
}

function updateUiToggleDOM() {
	const btn = document.getElementById('ui-toggle');
	if (btn) btn.textContent = uiCollapsed ? 'Show UI' : 'Hide UI';
}

// ============================================================================
// Locomotion (left thumbstick = move, right thumbstick = turn)
// ============================================================================
// Modes cycle Off → Planar → Free-roam:
//   • off    — thumbsticks scroll the chat / scene list (original behavior).
//   • planar — left stick moves on the horizontal plane (in/out + strafe)
//              relative to where you're looking; no vertical.
//   • free   — left stick flies in the full look direction (incl. up/down).
// Right stick turns (yaw) in both movement modes, pivoting around your head.
const _locoQuat = new THREE.Quaternion();
const _locoForward = new THREE.Vector3();
const _locoRight = new THREE.Vector3();
const _locoMove = new THREE.Vector3();
const _locoHead = new THREE.Vector3();
const _LOCO_UP = new THREE.Vector3(0, 1, 0);

function cycleLocomotionMode() {
	locomotionMode = locomotionMode === 'off' ? 'planar'
		: locomotionMode === 'planar' ? 'free' : 'off';
	const label = locomotionMode === 'off' ? 'Locomotion off — thumbsticks scroll'
		: locomotionMode === 'planar' ? 'Locomotion: First Person (left move/turn · right stick turn/height)'
		: 'Locomotion: WASD/free-fly (left move/turn · right stick turn/height)';
	updateStatus(label, locomotionMode === 'off' ? '' : 'connected');
	// Keep the desktop dropdown in sync (it has no "off" option, so leave it
	// showing whichever nav type was last active if the VR grip cycled to off).
	if (dchatNavType && locomotionMode !== 'off') dchatNavType.value = locomotionMode;
}

dchatNavType?.addEventListener('change', () => {
	locomotionMode = dchatNavType.value;
});

const _locoUpLocal = new THREE.Vector3();

// Shared movement math for both VR thumbsticks and desktop keyboard. mx/my
// are strafe/forward (-1..1, forward = negative my to match "push stick up
// = forward"), rx is yaw turn, ry is vertical (-1..1, positive = up).
// refCamera supplies the facing direction (xrCam in VR, the plain desktop
// `camera` otherwise).
//
// 'planar' (First Person nav type): forward/strafe are flattened onto the
// horizontal plane (no drift from looking up/down), and vertical (Q/E)
// always moves along the world/global up axis regardless of where you're
// looking - height is controlled by Q/E alone.
// 'free' (WASD nav type): forward/strafe follow the exact look direction
// (can fly up/down by looking up/down), and vertical (Q/E) moves along the
// camera's own local up vector, which tilts with your view.
function applyLocomotionInput(dt, refCamera, mx, my, rx, ry) {
	if (!player || locomotionMode === 'off' || dt <= 0) return;

	if (mx !== 0 || my !== 0 || ry !== 0) {
		refCamera.getWorldQuaternion(_locoQuat);
		_locoForward.set(0, 0, -1).applyQuaternion(_locoQuat);
		_locoRight.set(1, 0, 0).applyQuaternion(_locoQuat);
		let upVec;
		if (locomotionMode === 'planar') {
			_locoForward.y = 0; _locoRight.y = 0;
			_locoForward.normalize(); _locoRight.normalize();
			upVec = _LOCO_UP; // global up - height is set by Q/E, unaffected by view direction
		} else {
			upVec = _locoUpLocal.set(0, 1, 0).applyQuaternion(_locoQuat); // local up - tilts with your view
		}
		_locoMove.set(0, 0, 0)
			.addScaledVector(_locoForward, -my) // push up = forward
			.addScaledVector(_locoRight, mx)    // push right = strafe right
			.addScaledVector(upVec, ry)          // Q/push right-stick up = ascend
			.multiplyScalar(MOVE_SPEED * dt);
		player.position.add(_locoMove);
	}

	// Turn (right stick x / no keyboard equivalent), yaw around the user's
	// head so the view doesn't swing.
	if (rx !== 0) {
		const angle = -rx * TURN_SPEED * dt;
		refCamera.getWorldPosition(_locoHead);
		player.position.sub(_locoHead).applyAxisAngle(_LOCO_UP, angle).add(_locoHead);
		player.rotateY(angle);
	}
}

function updateLocomotion(dt, session) {
	if (!player || locomotionMode === 'off' || dt <= 0) return;

	const xrCam = renderer.xr.getCamera();
	let mx = 0, my = 0, rx = 0, ry = 0; // left x/y (move), right x (turn), right y (vertical)
	for (const source of session.inputSources) {
		const gp = source.gamepad;
		if (!gp || !gp.axes) continue;
		const axes = gp.axes;
		const ax = axes.length >= 4 ? axes[2] : (axes[0] || 0);
		const ay = axes.length >= 4 ? axes[3] : (axes[1] || 0);
		if (source.handedness === 'left') {
			// This controller reports the left thumbstick's horizontal and vertical
			// axes transposed, so swap them: strafe reads the vertical axis and
			// forward/back reads the horizontal axis.
			if (Math.abs(ay) > THUMBSTICK_DEADZONE) mx = ay;
			if (Math.abs(ax) > THUMBSTICK_DEADZONE) my = ax;
		} else if (source.handedness === 'right') {
			if (Math.abs(ax) > THUMBSTICK_DEADZONE) rx = ax;
			// Right thumbstick vertical: push up to ascend (Q), pull down to
			// descend (E) - the flying-controls equivalent of Q/E.
			if (Math.abs(ay) > THUMBSTICK_DEADZONE) ry = -ay;
		}
	}

	applyLocomotionInput(dt, xrCam, mx, my, rx, ry);
}

// Desktop keyboard equivalent (WASD move/strafe, Q/E vertical). Only active
// outside an XR session (VR uses the thumbsticks above) and never while
// typing into a text field.
const _keysDown = new Set();
const LOCOMOTION_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);

document.addEventListener('keydown', (e) => {
	if (!LOCOMOTION_KEYS.has(e.code)) return;
	const activeTag = document.activeElement && document.activeElement.tagName;
	if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
	if (renderer.xr.isPresenting) return;
	_keysDown.add(e.code);
});
document.addEventListener('keyup', (e) => {
	_keysDown.delete(e.code);
});
window.addEventListener('blur', () => _keysDown.clear());

function updateKeyboardLocomotion(dt) {
	if (renderer.xr.isPresenting || _keysDown.size === 0) return;
	let mx = 0, my = 0, ry = 0;
	if (_keysDown.has('KeyW')) my -= 1;
	if (_keysDown.has('KeyS')) my += 1;
	if (_keysDown.has('KeyD')) mx += 1;
	if (_keysDown.has('KeyA')) mx -= 1;
	if (_keysDown.has('KeyQ')) ry += 1;
	if (_keysDown.has('KeyE')) ry -= 1;
	if (mx === 0 && my === 0 && ry === 0) return;
	applyLocomotionInput(dt, camera, mx, my, 0, ry);
}

// ============================================================================
// Event Handlers
// ============================================================================
sendButton.addEventListener('click', () => {
	const message = chatInput.value.trim();
	if (message) {
		sendMessage(message);
		chatInput.value = '';
	}
});

chatInput.addEventListener('keydown', (e) => {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		const message = chatInput.value.trim();
		if (message) {
			sendMessage(message);
			chatInput.value = '';
		}
	}
});

// Collapse-all-UI: wire the DOM toggle button (windowed view).
const uiToggleBtn = document.getElementById('ui-toggle');
if (uiToggleBtn) uiToggleBtn.addEventListener('click', toggleUi);

// Speech-to-text: detect capture support and wire the DOM mic toggle.
initSpeech();
const micButton = document.getElementById('mic-button');
if (micButton) {
	micButton.addEventListener('click', toggleMicAlwaysOn);
	if (!speechSupported) {
		// Only happens with no MediaRecorder/getUserMedia (very old browsers) or a
		// non-secure context that hides mediaDevices entirely.
		micButton.disabled = true;
		micButton.title = 'Microphone capture not available (needs a secure context)';
	} else {
		micButton.title = 'Toggle always-on voice input (in-browser Whisper)';
	}
}

// ============================================================================
// Model selector: populated from whichever backends the server has API keys
// for (GET /api/backends). Selecting an option is sent along with every
// /api/chat and /api/fix-code request as `backend`.
// ============================================================================
async function refreshOllamaModelList() {
	if (!desktopOllamaModelSelect) return;
	desktopOllamaModelSelect.innerHTML = '<option>Checking for local Ollama...</option>';
	desktopOllamaModelSelect.disabled = true;
	try {
		const names = await listOllamaModels();
		desktopOllamaModelSelect.innerHTML = '';
		if (names.length === 0) {
			desktopOllamaModelSelect.innerHTML = '<option>No local models found (try "ollama pull llama3.2")</option>';
			selectedOllamaModel = null;
			return;
		}
		for (const name of names) {
			const opt = document.createElement('option');
			opt.value = name;
			opt.textContent = name;
			desktopOllamaModelSelect.appendChild(opt);
		}
		desktopOllamaModelSelect.disabled = false;
		selectedOllamaModel = names.includes('llama3.2:latest') ? 'llama3.2:latest' : names[0];
		desktopOllamaModelSelect.value = selectedOllamaModel;
	} catch (err) {
		console.error('Failed to reach local Ollama:', err);
		desktopOllamaModelSelect.innerHTML = '<option>Could not reach Ollama - see chat for details</option>';
		selectedOllamaModel = null;
	}
}

function updateOllamaRowVisibility() {
	if (!desktopOllamaModelRow) return;
	desktopOllamaModelRow.style.display = selectedBackend === 'ollama' ? 'flex' : 'none';
}

async function initModelSelect() {
	if (!desktopModelSelect) return;
	try {
		const res = await fetch('/api/prompts');
		cachedPrompts = await res.json();
	} catch (err) {
		console.error('Failed to load /api/prompts (needed for the Ollama backend):', err);
	}

	try {
		const res = await fetch('/api/backends');
		const { backends, default: defaultBackend } = await res.json();

		// "local: true" backends (currently just Ollama) additionally require
		// THIS PAGE to be on localhost - see the Private Network Access note
		// on OLLAMA_UNAVAILABLE_HOSTED_MSG above. That's a client-side fact
		// the server can't know, so it's applied on top of `available` here.
		desktopModelSelect.innerHTML = '';
		for (const [id, info] of Object.entries(backends)) {
			const usable = info.available && (!info.local || IS_LOCAL_PAGE);
			const opt = document.createElement('option');
			opt.value = id;
			opt.textContent = usable
				? info.label
				: !info.available
					? `${info.label} — no API key set`
					: `${info.label} — only when run via python run.py`;
			opt.disabled = !usable;
			desktopModelSelect.appendChild(opt);
		}

		const firstUsable = Object.entries(backends).find(([, info]) => info.available && (!info.local || IS_LOCAL_PAGE))?.[0];
		const defaultUsable = backends[defaultBackend]?.available && (!backends[defaultBackend]?.local || IS_LOCAL_PAGE);
		selectedBackend = defaultUsable ? defaultBackend : (firstUsable || defaultBackend);
		desktopModelSelect.value = selectedBackend;
		updateOllamaRowVisibility();
		if (selectedBackend === 'ollama') refreshOllamaModelList();
	} catch (err) {
		console.error('Failed to load /api/backends:', err);
	}
}

desktopModelSelect?.addEventListener('change', () => {
	selectedBackend = desktopModelSelect.value;
	updateOllamaRowVisibility();
	if (selectedBackend === 'ollama') refreshOllamaModelList();
});

desktopOllamaModelSelect?.addEventListener('change', () => {
	selectedOllamaModel = desktopOllamaModelSelect.value;
});

initModelSelect();

// ============================================================================
// Desktop (non-AR) chat window: movable, resizable, floats over the 3D scene
// ============================================================================
desktopSendButton.addEventListener('click', () => {
	const message = desktopChatInput.value.trim();
	if (message || pendingAttachments.length > 0) {
		sendMessage(message);
		desktopChatInput.value = '';
	}
});

desktopChatInput.addEventListener('keydown', (e) => {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		const message = desktopChatInput.value.trim();
		if (message || pendingAttachments.length > 0) {
			sendMessage(message);
			desktopChatInput.value = '';
		}
	}
});

desktopAttachButton?.addEventListener('click', () => desktopAttachInput.click());
desktopAttachInput?.addEventListener('change', (e) => {
	addAttachments(e.target.files);
	desktopAttachInput.value = '';
});

if (desktopMicButton) {
	desktopMicButton.addEventListener('click', toggleMicAlwaysOn);
	if (!speechSupported) {
		desktopMicButton.disabled = true;
		desktopMicButton.title = 'Microphone capture not available (needs a secure context)';
	} else {
		desktopMicButton.title = 'Toggle always-on voice input (in-browser Whisper)';
	}
}

if (desktopChatMinimizeBtn) {
	desktopChatMinimizeBtn.addEventListener('click', () => setDesktopChatMinimized(true));
}
if (desktopChatReopenBtn) {
	desktopChatReopenBtn.addEventListener('click', () => setDesktopChatMinimized(false));
}

function setDesktopChatMinimized(minimized) {
	desktopChat.classList.toggle('hidden', minimized);
	if (desktopChatReopenBtn) desktopChatReopenBtn.classList.toggle('visible', minimized);
}

// Dragging via the header. Uses document-level mouse listeners (rather than
// pointer capture) so it keeps tracking even if the cursor briefly leaves the
// header while moving fast.
(function initDesktopChatDrag() {
	let dragging = false;
	let startX = 0, startY = 0, startLeft = 0, startTop = 0;

	desktopChatHeader.addEventListener('mousedown', (e) => {
		if (e.target.closest('#desktop-chat-header-buttons')) return;
		dragging = true;
		desktopChat.classList.add('dragging');
		const rect = desktopChat.getBoundingClientRect();
		startX = e.clientX;
		startY = e.clientY;
		startLeft = rect.left;
		startTop = rect.top;
		e.preventDefault();
	});

	document.addEventListener('mousemove', (e) => {
		if (!dragging) return;
		const rect = desktopChat.getBoundingClientRect();
		let newLeft = startLeft + (e.clientX - startX);
		let newTop = startTop + (e.clientY - startY);
		newLeft = Math.max(0, Math.min(window.innerWidth - rect.width, newLeft));
		newTop = Math.max(0, Math.min(window.innerHeight - rect.height, newTop));
		desktopChat.style.left = `${newLeft}px`;
		desktopChat.style.top = `${newTop}px`;
	});

	document.addEventListener('mouseup', () => {
		if (!dragging) return;
		dragging = false;
		desktopChat.classList.remove('dragging');
	});
})();

// Resizing via any edge or corner (hold and drag). Each handle carries a
// data-dir of which sides move: n/s/e/w or a combination for corners.
(function initDesktopChatResize() {
	const MIN_W = 280, MIN_H = 220;
	let resizing = false;
	let dir = '';
	let startX = 0, startY = 0, startWidth = 0, startHeight = 0, startLeft = 0, startTop = 0;

	document.querySelectorAll('.dchat-resize').forEach(handle => {
		handle.addEventListener('mousedown', (e) => {
			resizing = true;
			dir = handle.dataset.dir;
			desktopChat.classList.add('resizing');
			const rect = desktopChat.getBoundingClientRect();
			startX = e.clientX;
			startY = e.clientY;
			startWidth = rect.width;
			startHeight = rect.height;
			startLeft = rect.left;
			startTop = rect.top;
			e.preventDefault();
		});
	});

	document.addEventListener('mousemove', (e) => {
		if (!resizing) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;

		if (dir.includes('e')) {
			const newWidth = Math.max(MIN_W, Math.min(window.innerWidth - startLeft, startWidth + dx));
			desktopChat.style.width = `${newWidth}px`;
		}
		if (dir.includes('s')) {
			const newHeight = Math.max(MIN_H, Math.min(window.innerHeight - startTop, startHeight + dy));
			desktopChat.style.height = `${newHeight}px`;
		}
		if (dir.includes('w')) {
			const maxDx = startWidth - MIN_W;
			const minDx = -startLeft;
			const clampedDx = Math.max(minDx, Math.min(maxDx, dx));
			desktopChat.style.width = `${startWidth - clampedDx}px`;
			desktopChat.style.left = `${startLeft + clampedDx}px`;
		}
		if (dir.includes('n')) {
			const maxDy = startHeight - MIN_H;
			const minDy = -startTop;
			const clampedDy = Math.max(minDy, Math.min(maxDy, dy));
			desktopChat.style.height = `${startHeight - clampedDy}px`;
			desktopChat.style.top = `${startTop + clampedDy}px`;
		}
	});

	document.addEventListener('mouseup', () => {
		if (!resizing) return;
		resizing = false;
		dir = '';
		desktopChat.classList.remove('resizing');
	});
})();

// Ctrl+Arrow snaps the chat window to the nearest screen edge (or corner
// with a diagonal-feeling combo: press twice, once per axis). Only active
// when not immersive and not typing in a text field.
document.addEventListener('keydown', (e) => {
	if (!e.ctrlKey) return;
	const arrowDirs = { ArrowLeft: 'w', ArrowRight: 'e', ArrowUp: 'n', ArrowDown: 's' };
	const dir = arrowDirs[e.key];
	if (!dir) return;
	if (desktopChat.classList.contains('hidden')) return;
	if (renderer.xr.isPresenting) return;
	const activeTag = document.activeElement && document.activeElement.tagName;
	if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

	e.preventDefault();
	const rect = desktopChat.getBoundingClientRect();
	const margin = 8;
	let left = rect.left, top = rect.top;
	if (dir === 'w') left = margin;
	if (dir === 'e') left = window.innerWidth - rect.width - margin;
	if (dir === 'n') top = margin;
	if (dir === 's') top = window.innerHeight - rect.height - margin;
	desktopChat.style.left = `${left}px`;
	desktopChat.style.top = `${top}px`;
});

// Tabs: Chat / Environment / Scenes / Code / Community (Scenes|Themes sections).
document.querySelectorAll('.dchat-tab').forEach(tab => {
	tab.addEventListener('click', () => {
		document.querySelectorAll('.dchat-tab').forEach(t => t.classList.remove('active'));
		document.querySelectorAll('.dchat-panel').forEach(p => p.classList.remove('active'));
		tab.classList.add('active');
		document.getElementById(`dchat-panel-${tab.dataset.tab}`).classList.add('active');
		if (tab.dataset.tab === 'community') setCommunitySection(communitySection);
		if (tab.dataset.tab === 'code') syncCodeEditorFromState({ force: false });
	});
});

// Code tab: edit generated VR program with optional live re-apply.
if (dchatCodeEditor) {
	dchatCodeEditor.addEventListener('input', markCodeEditorDirty);
	dchatCodeEditor.addEventListener('keydown', (e) => {
		// Keep Tab inserting spaces inside the editor instead of leaving the field.
		if (e.key === 'Tab') {
			e.preventDefault();
			const start = dchatCodeEditor.selectionStart;
			const end = dchatCodeEditor.selectionEnd;
			const v = dchatCodeEditor.value;
			dchatCodeEditor.value = v.slice(0, start) + '	' + v.slice(end);
			dchatCodeEditor.selectionStart = dchatCodeEditor.selectionEnd = start + 1;
			markCodeEditorDirty();
		}
	});
}
if (dchatCodeApply) dchatCodeApply.addEventListener('click', () => applyCodeFromEditor());
if (dchatCodeRevert) dchatCodeRevert.addEventListener('click', revertCodeEditor);
if (dchatCodeLive) {
	dchatCodeLive.checked = false; // default OFF for safety
	dchatCodeLive.addEventListener('change', () => {
		if (dchatCodeLive.checked && codeEditorDirty) scheduleLiveCodeApply();
	});
}
syncCodeEditorFromState({ force: true });

document.querySelectorAll('.dchat-subtab').forEach(btn => {
	btn.addEventListener('click', () => setCommunitySection(btn.dataset.communitySection));
});

if (dchatThemeChatSend) dchatThemeChatSend.addEventListener('click', sendThemeChat);
if (dchatThemeChatInput) {
	dchatThemeChatInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); sendThemeChat(); }
	});
}

// Environment tab: AR/VR toggle (shared button spec, see ENV_MODE_BUTTONS/
// handleMenuAction), color picker, brightness slider. The toggle buttons
// themselves are (re)mounted by renderDomEnv() since their active/inactive
// styling depends on isVRMode.
dchatColorPicker.addEventListener('input', () => {
	const hex = dchatColorPicker.value;
	const c = new THREE.Color(hex);
	const hsl = { h: 0, s: 0, l: 0 };
	c.getHSL(hsl);
	vrBgHue = hsl.h * 360;
	vrBgSat = hsl.s;
	vrBgLight = hsl.l;
	applyEnvironmentMode();
	renderSidePanel();
});
dchatBrightness.addEventListener('input', () => {
	vrBgLight = Math.max(0.02, Math.min(0.95, Number(dchatBrightness.value) / 100));
	applyEnvironmentMode();
	renderSidePanel();
});
dchatResetCameraBtn.addEventListener('click', () => {
	camera.position.set(0, 1.6, 0);
	orbitControls.target.set(0, 1.4, -CHAT_PANEL_DISTANCE);
	orbitControls.update();
});

// Scenes / Community tabs: shared button specs (SCENES_BUTTONS,
// EXPORT_COMBINED_BUTTON, COMMUNITY_BUTTONS) mounted once - their content
// never changes, only EXPORT_COMBINED_BUTTON's visibility does (toggled in
// renderDomSceneList via the .visible class on its mount div).
mountButtonsToDOM(dchatScenesButtonsMount, SCENES_BUTTONS, { width: 384, height: 44, gap: 8, minWidth: 100, fontSize: 12 }, handleMenuAction);
mountButtonsToDOM(dchatExportCombinedMount, EXPORT_COMBINED_BUTTON, { width: 384, height: 44, gap: 8, perRow: 1, fontSize: 13 }, handleMenuAction);
mountButtonsToDOM(dchatCommunityButtonsMount, COMMUNITY_BUTTONS, { width: 384, height: 44, gap: 8, perRow: 2, fontSize: 12 }, handleMenuAction);
if (dchatThemesButtonsMount) {
	mountButtonsToDOM(dchatThemesButtonsMount, THEME_BUTTONS, { width: 384, height: 44, gap: 8, perRow: 3, fontSize: 11 }, handleMenuAction);
}

// Switches between the desktop chat window (windowed browser) and the slim
// dom-overlay bar (AR/VR immersive session), and shows/hides the legacy 3D
// canvas panels accordingly — the desktop window replaces them entirely.
function setImmersiveUiMode(immersive) {
	const panels = [chatPanel, inputPanel, sidePanel, scenePanel];
	for (const p of panels) if (p) p.visible = immersive && !displayOnlyMode;
	if (keyboardPanel) keyboardPanel.visible = immersive && !keyboardCollapsed && !displayOnlyMode;
	// The head-locked hud (status badge + Hide/Show-UI panel) only makes sense
	// with a headset; the desktop equivalents are the DOM #status pill and
	// #ui-toggle button, already shown outside the 3D scene.
	hud.visible = immersive && !displayOnlyMode;
	// Mouse orbit/pan/zoom only makes sense windowed — the headset pose drives
	// the camera during an XR session.
	orbitControls.enabled = !immersive;

	desktopChat.classList.toggle('hidden', immersive || uiCollapsed || displayOnlyMode);
	if (desktopChatReopenBtn) {
		desktopChatReopenBtn.classList.toggle('visible', !immersive && uiCollapsed && !displayOnlyMode);
	}
	if (chatOverlayBar) chatOverlayBar.classList.toggle('visible', immersive && !displayOnlyMode);
}

// ============================================================================
// Window Resize
// ============================================================================
function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);

// ============================================================================
// AR Session Handlers
// ============================================================================
function positionAllPanels(chatY) {
	const inputY = chatY - CHAT_PANEL_HEIGHT / 2 - INPUT_PANEL_GAP - INPUT_PANEL_HEIGHT / 2;
	const kbY = inputY - INPUT_PANEL_HEIGHT / 2 - KEYBOARD_PANEL_GAP - KEYBOARD_PANEL_HEIGHT / 2;
	const sideX = CHAT_PANEL_WIDTH / 2 + SIDE_PANEL_GAP + SIDE_PANEL_WIDTH / 2;
	const sceneX = -(CHAT_PANEL_WIDTH / 2 + SCENE_PANEL_GAP + SCENE_PANEL_WIDTH / 2);
	if (chatPanel) chatPanel.position.set(0, chatY, -CHAT_PANEL_DISTANCE);
	if (inputPanel) inputPanel.position.set(0, inputY, -CHAT_PANEL_DISTANCE);
	if (keyboardPanel) keyboardPanel.position.set(0, kbY, -CHAT_PANEL_DISTANCE);
	if (sidePanel) sidePanel.position.set(sideX, chatY, -CHAT_PANEL_DISTANCE);
	if (scenePanel) scenePanel.position.set(sceneX, chatY, -CHAT_PANEL_DISTANCE);
}

renderer.xr.addEventListener('sessionstart', () => {
	// 'local-floor' reference space: origin at the real floor, eye level
	// is around y=1.6, so anchor panels just below eye level for comfort.
	positionAllPanels(1.4);
	setImmersiveUiMode(true);

	// PCVR headsets (Quest via Link/Air Link, Index, Vive, WMR, ...) report
	// an 'opaque' blend mode — there's no camera passthrough to show, so
	// switch on the VR skybox instead of leaving a black void. Passthrough
	// AR sessions report 'additive' or 'alpha-blend' and keep the transparent
	// background as before.
	const session = renderer.xr.getSession();
	if (session && session.environmentBlendMode === 'opaque') {
		isVRMode = true;
		applyEnvironmentMode();
		renderSidePanel();
	}
	renderDomEnv();
});

renderer.xr.addEventListener('sessionend', () => {
	positionAllPanels(1.4);
	// Reset to AR mode when leaving XR
	isVRMode = false;
	applyEnvironmentMode();
	renderSidePanel();
	renderDomEnv();
	setImmersiveUiMode(false);
});

// ============================================================================
// Initialize and Animation Loop
// ============================================================================
createChatPanel();
createInputPanel();
createKeyboardPanel();
createSidePanel();
createScenePanel();
createHudStatus();
createUiToggle();
// Start in windowed (non-XR) mode: the desktop chat window is the UI, and the
// legacy 3D canvas panels stay hidden until an AR/VR session starts.
setImmersiveUiMode(false);
applyEnvironmentMode();

// Populate the community list (and auto-load /s/:id or /e/:id / ?scene= shares).
// Runs after setImmersiveUiMode so display-only can hide the desktop chrome cleanly.
// Restore last applied editor theme (chrome only).
try {
	const saved = localStorage.getItem('carljr-theme');
	if (saved) applyTheme(JSON.parse(saved));
	else currentTheme = { ...DEFAULT_THEME, cssVars: { ...DEFAULT_THEME.cssVars } };
} catch {
	currentTheme = { ...DEFAULT_THEME, cssVars: { ...DEFAULT_THEME.cssVars } };
}

bootSharedScene();

// Snapshot system objects so we can distinguish user-created objects later
snapshotSystemObjects();

// Add welcome message
const welcomeMsg = 'VR Code Assistant ready. Ask me to add objects, modify the scene, or inject HTML — I\'ll write and execute the code live.';
displayMessages.push({ role: 'assistant', content: welcomeMsg });
renderChatToCanvas();

const _rayTempMatrix = new THREE.Matrix4();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _hitRaycaster = new THREE.Raycaster();
const _hitTargets = []; // populated after panels exist
// Previous per-hand button-pressed state, for edge detection (ray toggle) and
// hold detection (push-to-talk). Keyed by handedness → button index → bool.
const _prevButtons = { left: {}, right: {} };

renderer.setAnimationLoop((time) => {
	// Frame delta (seconds), clamped so a paused/backgrounded tab doesn't jump.
	const dt = _locoPrevTime ? Math.min(0.1, (time - _locoPrevTime) / 1000) : 0;
	_locoPrevTime = time;

	// Voice-activity detection for always-on mic. Driven here (not via
	// window.requestAnimationFrame, which is paused during immersive sessions) so
	// transcription segmentation works in MR as well as the windowed view.
	pumpVad();

	if (orbitControls.enabled) orbitControls.update();

	// Billboard effect: panels face the camera while staying upright
	if (renderer.xr.isPresenting) {
		const xrCamera = renderer.xr.getCamera();
		const cameraWorldPos = new THREE.Vector3();
		xrCamera.getWorldPosition(cameraWorldPos);

		if (chatPanel) chatPanel.lookAt(cameraWorldPos);
		if (inputPanel) inputPanel.lookAt(cameraWorldPos);
		if (keyboardPanel) keyboardPanel.lookAt(cameraWorldPos);
		if (sidePanel) sidePanel.lookAt(cameraWorldPos);
		if (scenePanel) scenePanel.lookAt(cameraWorldPos);

		// Build hit-target list (panels that exist and are showing)
		_hitTargets.length = 0;
		if (uiTogglePanel && !displayOnlyMode) _hitTargets.push(uiTogglePanel); // always reachable (unless display-only share)
		if (!uiCollapsed && !displayOnlyMode) {
			if (scenePanel) _hitTargets.push(scenePanel);
			if (sidePanel) _hitTargets.push(sidePanel);
			if (inputPanel) _hitTargets.push(inputPanel);
			if (keyboardPanel && !keyboardCollapsed) _hitTargets.push(keyboardPanel);
			if (chatPanel) _hitTargets.push(chatPanel);
		}

		// Update reticles per controller; track keyboard hover across both hands.
		let frameKbHover = -1;
		for (let i = 0; i < 2; i++) {
			const controller = renderer.xr.getController(i);
			const reticle = reticles[i];
			if (!controller || !reticle) continue;

			_rayTempMatrix.identity().extractRotation(controller.matrixWorld);
			_rayOrigin.setFromMatrixPosition(controller.matrixWorld);
			_rayDir.set(0, 0, -1).applyMatrix4(_rayTempMatrix);

			_hitRaycaster.set(_rayOrigin, _rayDir);
			const intersects = _hitRaycaster.intersectObjects(_hitTargets);

			if (intersects.length > 0) {
				const hit = intersects[0];
				reticle.position.copy(hit.point);
				// Face along hit normal (toward the camera side of the panel)
				reticle.lookAt(
					hit.point.x + hit.face.normal.x,
					hit.point.y + hit.face.normal.y,
					hit.point.z + hit.face.normal.z
				);
				reticle.visible = true;

				// Highlight color based on what's being aimed at
				if (hit.object === uiTogglePanel) {
					reticle.material.color.setHex(0x8b5cf6); // purple — UI toggle
				} else if (hit.object === scenePanel) {
					reticle.material.color.setHex(0xf59e0b); // amber for scene panel
				} else if (hit.object === sidePanel) {
					reticle.material.color.setHex(0x10b981); // green for side panel
				} else if (hit.object === keyboardPanel) {
					reticle.material.color.setHex(0x6366f1); // indigo
					if (hit.uv) frameKbHover = keyIndexAtUV(hit.uv);
				} else if (hit.object === inputPanel && hit.uv) {
					const L = inputPanelLayout();
					const cx = hit.uv.x * L.W;
					if (cx >= L.sendX) reticle.material.color.setHex(0x8b5cf6); // purple — send
					else if (cx >= L.micX) reticle.material.color.setHex(0x22d3ee); // cyan — mic/keys buttons
					else reticle.material.color.setHex(0x6366f1); // indigo
				} else {
					reticle.material.color.setHex(0x6366f1); // indigo
				}
			} else {
				reticle.visible = false;
			}
		}
		// Apply keyboard hover (re-renders only when the hovered key changes)
		setKeyboardHover(keyboardCollapsed ? -1 : frameKbHover);
		// Poll thumbsticks (scrolling) and buttons (ray toggle + push-to-talk)
		const session = renderer.xr.getSession();
		if (session) {
			for (const source of session.inputSources) {
				const gp = source.gamepad;
				const hand = source.handedness;

				if (gp && (hand === 'left' || hand === 'right')) {
					const prev = _prevButtons[hand];
					// B / Y button (index 5): toggle pointer ray lines on press (edge).
					const b5 = !!(gp.buttons[5] && gp.buttons[5].pressed);
					if (b5 && !prev[5]) toggleRayVisibility();
					prev[5] = b5;
					// A / X button (index 4): push-to-talk — listen while held.
					const b4 = !!(gp.buttons[4] && gp.buttons[4].pressed);
					if (b4 && !prev[4]) startPTT(hand);
					if (!b4 && prev[4]) stopPTT(hand);
					prev[4] = b4;
					// Thumbstick press (index 3): collapse / restore all UI. A reliable
					// fallback for the head-locked Hide/Show-UI button.
					const b3 = !!(gp.buttons[3] && gp.buttons[3].pressed);
					if (b3 && !prev[3]) toggleUi();
					prev[3] = b3;
					// Grip / squeeze (index 1), right hand: cycle locomotion mode
					// (off → planar → free-roam).
					if (hand === 'right') {
						const b1 = !!(gp.buttons[1] && gp.buttons[1].pressed);
						if (b1 && !prev[1]) cycleLocomotionMode();
						prev[1] = b1;
					}
				}

				// Thumbsticks scroll only while locomotion is off; otherwise they
				// drive movement/turning (handled by updateLocomotion below).
				if (locomotionMode === 'off') {
					const axes = gp ? gp.axes : null;
					if (!axes) continue;
					const thumbY = axes.length >= 4 ? axes[3] : (axes.length >= 2 ? axes[1] : 0);

					if (hand === 'right' && Math.abs(thumbY) > THUMBSTICK_DEADZONE) {
						// Right thumbstick: scroll chat
						chatScrollOffset += thumbY < 0 ? SCROLL_SPEED : -SCROLL_SPEED;
						chatScrollOffset = Math.max(0, chatScrollOffset);
						renderChatToCanvas();
					}
					if (hand === 'left' && Math.abs(thumbY) > THUMBSTICK_DEADZONE) {
						// Left thumbstick: scroll scene list
						sceneScrollOffset += thumbY < 0 ? 1 : -1;
						sceneScrollOffset = Math.max(0, sceneScrollOffset);
						renderScenePanel();
					}
				}
			}

			// Locomotion: left stick moves, right stick turns.
			updateLocomotion(dt, session);
		}
	} else if (mobileXRMode) {
		// Hide reticles - no controllers in Cardboard/AR-camera mode
		for (const r of reticles) if (r) r.visible = false;
		// Gyro drives look direction; the hold-to-walk button drives movement
		// in whatever direction the phone is facing (see applyLocomotionInput).
		updateCameraFromDeviceOrientation();
		if (mobileMoveHeld) applyLocomotionInput(dt, camera, 0, -1, 0, 0);
	} else {
		// Hide reticles outside XR
		for (const r of reticles) if (r) r.visible = false;
		// Desktop keyboard locomotion (WASD move/strafe, Q/E vertical).
		updateKeyboardLocomotion(dt);
	}

	// Run user-injected animations from vr-exec code
	for (const animFn of window._vrAnimations) {
		try {
			animFn(time);
		} catch (e) {
			// Silently skip broken animation functions
		}
	}

	if (mobileXRMode === 'cardboard') {
		// Manual side-by-side stereo render (no OpenXR session to do this for us).
		stereoCam.update(camera);
		const w = window.innerWidth, h = window.innerHeight;
		renderer.setScissorTest(true);
		renderer.setScissor(0, 0, w / 2, h);
		renderer.setViewport(0, 0, w / 2, h);
		renderer.render(scene, stereoCam.cameraL);
		renderer.setScissor(w / 2, 0, w / 2, h);
		renderer.setViewport(w / 2, 0, w / 2, h);
		renderer.render(scene, stereoCam.cameraR);
		renderer.setScissorTest(false);
		renderer.setViewport(0, 0, w, h);
	} else {
		renderer.render(scene, camera);
	}
});
