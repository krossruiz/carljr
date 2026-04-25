import * as THREE from 'three';
import { ARButton } from './threejsAddons/ARButton.js';

// ============================================================================
// Configuration
// ============================================================================
const CHAT_PANEL_WIDTH = 1.2;
const CHAT_PANEL_HEIGHT = 0.8;
const CHAT_PANEL_DISTANCE = 1.5;
const MESSAGE_FONT_SIZE = 24;
const SCROLL_SPEED = 3; // lines per second at full thumbstick deflection
const THUMBSTICK_DEADZONE = 0.15;
const INPUT_PANEL_WIDTH = 1.2;
const INPUT_PANEL_HEIGHT = 0.15;
const INPUT_PANEL_GAP = 0.05;
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

// ============================================================================
// DOM Elements
// ============================================================================
const overlayRoot = document.getElementById('overlay-root');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const statusElement = document.getElementById('status');

// ============================================================================
// State
// ============================================================================
let messages = [];       // Full messages for API context (includes raw code blocks)
let displayMessages = []; // Cleaned messages for canvas display
let isLoading = false;
let chatPanel = null;
let chatTexture = null;
let chatCanvas = null;
let chatContext = null;
let inputPanel = null;
let inputTexture = null;
let inputCanvas = null;
let inputContext = null;
let inputText = '';
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

// ============================================================================
// AR Button Setup with DOM Overlay
// ============================================================================
document.body.appendChild(
	ARButton.createButton(renderer, {
		optionalFeatures: ['hit-test', 'dom-overlay'],
		domOverlay: { root: overlayRoot }
	})
);

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

	// Input area background
	const sendBtnWidth = 150;
	const inputAreaWidth = width - sendBtnWidth - 36;

	ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
	roundRect(ctx, 12, 12, inputAreaWidth, height - 24, 12);
	ctx.fill();

	// Input text or placeholder
	ctx.font = '24px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.textAlign = 'left';
	if (inputText) {
		ctx.fillStyle = '#ffffff';
		let displayText = inputText;
		while (ctx.measureText(displayText + '|').width > inputAreaWidth - 32 && displayText.length > 0) {
			displayText = displayText.slice(1);
		}
		ctx.fillText(displayText + '|', 24, height / 2 + 8);
	} else {
		ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
		ctx.fillText('Ask Claude something...', 24, height / 2 + 8);
	}

	// Send button
	const btnX = width - sendBtnWidth - 12;
	const gradient = ctx.createLinearGradient(btnX, 0, btnX + sendBtnWidth, height);
	gradient.addColorStop(0, '#6366f1');
	gradient.addColorStop(1, '#8b5cf6');
	ctx.fillStyle = gradient;
	roundRect(ctx, btnX, 12, sendBtnWidth, height - 24, 12);
	ctx.fill();

	ctx.fillStyle = '#ffffff';
	ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText('Send', btnX + sendBtnWidth / 2, height / 2 + 8);
	ctx.textAlign = 'left';

	inputTexture.needsUpdate = true;
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

function renderSidePanel() {
	if (!sideContext) return;

	const ctx = sideContext;
	const w = sideCanvas.width;
	const h = sideCanvas.height;

	ctx.clearRect(0, 0, w, h);

	// Background
	ctx.fillStyle = 'rgba(20, 20, 30, 0.92)';
	roundRect(ctx, 0, 0, w, h, 16);
	ctx.fill();

	// --- AR/VR Toggle Button (top area: y 16 to 100) ---
	const btnY = 16;
	const btnH = 80;
	const btnPad = 16;

	// Toggle track background
	ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
	roundRect(ctx, btnPad, btnY, w - btnPad * 2, btnH, 14);
	ctx.fill();

	// Active side highlight
	const halfW = (w - btnPad * 2) / 2;
	if (!isVRMode) {
		// AR active (left side)
		ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
		roundRect(ctx, btnPad + 2, btnY + 2, halfW - 2, btnH - 4, 12);
		ctx.fill();
	} else {
		// VR active (right side)
		ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
		roundRect(ctx, btnPad + halfW, btnY + 2, halfW - 2, btnH - 4, 12);
		ctx.fill();
	}

	// Labels
	ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillStyle = !isVRMode ? '#10b981' : 'rgba(255,255,255,0.4)';
	ctx.fillText('AR', btnPad + halfW / 2, btnY + btnH / 2 + 10);
	ctx.fillStyle = isVRMode ? '#6366f1' : 'rgba(255,255,255,0.4)';
	ctx.fillText('VR', btnPad + halfW + halfW / 2, btnY + btnH / 2 + 10);

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
	if (isVRMode) {
		const color = new THREE.Color();
		color.setHSL(vrBgHue / 360, vrBgSat, vrBgLight);
		vrSkybox.material.color.copy(color);
		vrSkybox.visible = true;
	} else {
		vrSkybox.visible = false;
	}
}

function handleSidePanelHit(uv) {
	const canvasX = uv.x * 256;
	const canvasY = (1 - uv.y) * 768; // UV y is flipped vs canvas y

	// AR/VR Toggle (y 16-96 on canvas)
	if (canvasY >= 16 && canvasY <= 96) {
		const halfW = 112; // roughly (256 - 32) / 2
		if (canvasX < 128) {
			isVRMode = false;
		} else {
			isVRMode = true;
		}
		applyEnvironmentMode();
		renderSidePanel();
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
const exportModal = document.getElementById('export-modal');
const exportNameInput = document.getElementById('export-name');
const exportExtInput = document.getElementById('export-ext');
const exportPreview = document.getElementById('export-preview');
const exportScreenshotBtn = document.getElementById('export-screenshot-btn');
const exportCancelBtn = document.getElementById('export-cancel-btn');
const exportConfirmBtn = document.getElementById('export-confirm-btn');

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
	// Re-execute loaded scenes first
	for (const sc of loadedScenes) {
		if (sc.active) {
			for (const code of sc.codeBlocks) {
				try { executeVrCode(code); } catch (e) {
					console.error(`Scene "${sc.name}" error:`, e);
				}
			}
		}
	}
	// Then re-execute current session code
	for (const code of executedCodeBlocks) {
		try { executeVrCode(code); } catch (e) {
			console.error('Session code error:', e);
		}
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

function doExport() {
	const name = exportNameInput.value.trim() || 'Untitled';
	const ext = exportExtInput.value.trim().replace(/^\./, '') || 'vrscene';
	sceneFileExtension = ext;

	const codeBlocks = [];
	for (const sc of loadedScenes) {
		if (sc.active) codeBlocks.push(...sc.codeBlocks);
	}
	codeBlocks.push(...executedCodeBlocks);

	const sceneData = {
		version: 1,
		name,
		createdAt: new Date().toISOString(),
		thumbnail: pendingExportThumbnail || '',
		codeBlocks
	};

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

function loadSceneFile(file) {
	const reader = new FileReader();
	reader.onload = (e) => {
		try {
			const data = JSON.parse(e.target.result);
			if (!data.codeBlocks || !Array.isArray(data.codeBlocks)) {
				throw new Error('Invalid scene file: missing codeBlocks');
			}
			const sc = {
				id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
				name: data.name || file.name.replace(/\.[^.]+$/, ''),
				thumbnail: data.thumbnail || '',
				codeBlocks: data.codeBlocks,
				active: true,
				createdAt: data.createdAt || new Date().toISOString(),
				_thumbImage: null
			};
			loadedScenes.push(sc);

			// Execute the scene's code blocks
			for (const code of sc.codeBlocks) {
				try { executeVrCode(code); } catch (err) {
					console.error(`Scene "${sc.name}" load error:`, err);
				}
			}

			loadSceneThumbnails();
			renderScenePanel();
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

function loadSceneFromServer() {
	updateStatus('Loading scene...', 'connecting');
	fetch('/api/load-scene')
		.then(res => {
			if (!res.ok) throw new Error(res.status === 404 ? 'No saved scene found' : 'Server error');
			return res.json();
		})
		.then(data => {
			if (!data.codeBlocks || !Array.isArray(data.codeBlocks)) {
				throw new Error('Invalid scene data');
			}
			const sc = {
				id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
				name: data.name || 'Loaded Scene',
				thumbnail: data.thumbnail || '',
				codeBlocks: data.codeBlocks,
				active: true,
				createdAt: data.createdAt || new Date().toISOString(),
				_thumbImage: null
			};
			loadedScenes.push(sc);
			for (const code of sc.codeBlocks) {
				try { executeVrCode(code); } catch (err) {
					console.error(`Scene "${sc.name}" load error:`, err);
				}
			}
			loadSceneThumbnails();
			renderScenePanel();
			updateStatus(`Loaded "${sc.name}"`, 'connected');
		})
		.catch(err => {
			updateStatus(`Load error: ${err.message}`, 'error');
		});
}

exportScreenshotBtn.addEventListener('click', () => {
	pendingExportThumbnail = captureScreenshot();
	exportPreview.innerHTML = `<img src="${pendingExportThumbnail}" style="width:80px;height:80px;border-radius:8px;object-fit:cover;">`;
});
exportCancelBtn.addEventListener('click', hideExportModal);
exportConfirmBtn.addEventListener('click', doExport);

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

function renderScenePanel() {
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

	// Buttons row
	const btnY = 60;
	const btnH = 50;
	const btnGap = 8;
	const btnW = (w - 24 - btnGap) / 2;

	// Export button
	const exportGrad = ctx.createLinearGradient(12, btnY, 12 + btnW, btnY + btnH);
	exportGrad.addColorStop(0, '#6366f1');
	exportGrad.addColorStop(1, '#8b5cf6');
	ctx.fillStyle = exportGrad;
	roundRect(ctx, 12, btnY, btnW, btnH, 10);
	ctx.fill();
	ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'center';
	ctx.fillText('Export', 12 + btnW / 2, btnY + btnH / 2 + 7);

	// Load button
	const loadBtnX = 12 + btnW + btnGap;
	const loadGrad = ctx.createLinearGradient(loadBtnX, btnY, loadBtnX + btnW, btnY + btnH);
	loadGrad.addColorStop(0, '#10b981');
	loadGrad.addColorStop(1, '#059669');
	ctx.fillStyle = loadGrad;
	roundRect(ctx, loadBtnX, btnY, btnW, btnH, 10);
	ctx.fill();
	ctx.fillStyle = '#ffffff';
	ctx.fillText('Load', loadBtnX + btnW / 2, btnY + btnH / 2 + 7);

	// Separator
	ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
	ctx.fillRect(12, 120, w - 24, 1);

	// Scene list
	const listTop = 128;
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

	// Export Combined button
	const hasContent = loadedScenes.some(s => s.active) || executedCodeBlocks.length > 0;
	if (hasContent && loadedScenes.length > 0) {
		const combY = 700, combH = 48;
		const combGrad = ctx.createLinearGradient(12, combY, w - 12, combY + combH);
		combGrad.addColorStop(0, '#f59e0b');
		combGrad.addColorStop(1, '#d97706');
		ctx.fillStyle = combGrad;
		roundRect(ctx, 12, combY, w - 24, combH, 10);
		ctx.fill();
		ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, sans-serif';
		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'center';
		ctx.fillText('Export Combined', w / 2, combY + combH / 2 + 6);
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

	const btnY = 60, btnH = 50, btnGap = 8;
	const btnW = (384 - 24 - btnGap) / 2;

	// Export button
	if (canvasY >= btnY && canvasY <= btnY + btnH && canvasX >= 12 && canvasX <= 12 + btnW) {
		showExportModal(false);
		return;
	}
	// Load button
	if (canvasY >= btnY && canvasY <= btnY + btnH && canvasX >= 12 + btnW + btnGap) {
		loadSceneFromServer();
		return;
	}

	// Scene list
	const listTop = 128, itemH = 72, listBottom = 688;
	const maxVisible = Math.floor((listBottom - listTop) / itemH);
	if (canvasY >= listTop && canvasY < listTop + maxVisible * itemH) {
		const idx = Math.floor((canvasY - listTop) / itemH) + sceneScrollOffset;
		if (idx >= 0 && idx < loadedScenes.length) {
			if (canvasX >= 384 - 36) {
				// Remove
				loadedScenes.splice(idx, 1);
				rebuildSceneFromActive();
				renderScenePanel();
			} else if (canvasX < 48) {
				// Toggle active
				loadedScenes[idx].active = !loadedScenes[idx].active;
				rebuildSceneFromActive();
				renderScenePanel();
			}
			return;
		}
	}

	// Export Combined button
	if (canvasY >= 700 && canvasY <= 748 && canvasX >= 12 && canvasX <= 384 - 12) {
		if ((loadedScenes.some(s => s.active) || executedCodeBlocks.length > 0) && loadedScenes.length > 0) {
			showExportModal(true);
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

		scene.add(controller);
	}
}

function onXRSelectStart(event) {
	const controller = event.target;

	tempMatrix.identity().extractRotation(controller.matrixWorld);
	raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
	raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

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

	// Check input panel hit
	if (inputPanel) {
		const intersects = raycaster.intersectObject(inputPanel);
		if (intersects.length > 0) {
			const uv = intersects[0].uv;
			// Send button is roughly the right ~16% of the panel (150/1024 + margin)
			if (uv.x > 0.84) {
				handleXRSend();
			} else {
				// Tap on input area — focus the hidden DOM input to trigger system keyboard
				chatInput.focus();
			}
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
 */
function executeVrCode(code) {
	const fn = new Function('THREE', 'scene', 'camera', 'renderer', 'document', code);
	fn(THREE, scene, camera, renderer, document);
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

		try {
			const response = await fetch('/api/fix-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					failingCode: attempt === 1 ? failingCode : priorFixes[priorFixes.length - 1].code,
					errorMessage,
					errorStack,
					attempt,
					priorFixes
				})
			});

			const responseText = await response.text();
			let data;
			try {
				data = JSON.parse(responseText);
			} catch (e) {
				throw new Error(`Fix API returned non-JSON: ${responseText.slice(0, 120)}`);
			}

			if (!response.ok) {
				throw new Error(data.error || `Fix API error: ${response.status}`);
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
				executeVrCode(fixedCode);
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
// Claude API Integration (via proxy server)
// ============================================================================
async function sendMessage(userMessage) {
	if (!userMessage.trim()) return;

	// Add user message to both arrays
	messages.push({ role: 'user', content: userMessage });
	displayMessages.push({ role: 'user', content: userMessage });
	chatScrollOffset = 0; // auto-scroll to bottom on new message
	renderChatToCanvas();

	isLoading = true;
	sendButton.disabled = true;
	updateStatus('Sending...', '');

	try {
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				messages: messages.map(m => ({
					role: m.role,
					content: m.content
				}))
			})
		});

		// Read as text first to avoid opaque JSON parse errors
		const responseText = await response.text();
		let data;
		try {
			data = JSON.parse(responseText);
		} catch (parseErr) {
			throw new Error(`Server returned non-JSON (${response.status}): ${responseText.slice(0, 120)}`);
		}

		if (!response.ok) {
			throw new Error(data.error || `API error: ${response.status}`);
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
					executeVrCode(code);
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
	const sideX = CHAT_PANEL_WIDTH / 2 + SIDE_PANEL_GAP + SIDE_PANEL_WIDTH / 2;
	const sceneX = -(CHAT_PANEL_WIDTH / 2 + SCENE_PANEL_GAP + SCENE_PANEL_WIDTH / 2);
	if (chatPanel) chatPanel.position.set(0, chatY, -CHAT_PANEL_DISTANCE);
	if (inputPanel) inputPanel.position.set(0, inputY, -CHAT_PANEL_DISTANCE);
	if (sidePanel) sidePanel.position.set(sideX, chatY, -CHAT_PANEL_DISTANCE);
	if (scenePanel) scenePanel.position.set(sceneX, chatY, -CHAT_PANEL_DISTANCE);
}

renderer.xr.addEventListener('sessionstart', () => {
	positionAllPanels(0.2);
});

renderer.xr.addEventListener('sessionend', () => {
	positionAllPanels(1.4);
	// Reset to AR mode when leaving XR
	isVRMode = false;
	applyEnvironmentMode();
	renderSidePanel();
});

// ============================================================================
// Initialize and Animation Loop
// ============================================================================
createChatPanel();
createInputPanel();
createSidePanel();
createScenePanel();

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

renderer.setAnimationLoop((time) => {
	// Billboard effect: panels face the camera while staying upright
	if (renderer.xr.isPresenting) {
		const xrCamera = renderer.xr.getCamera();
		const cameraWorldPos = new THREE.Vector3();
		xrCamera.getWorldPosition(cameraWorldPos);

		if (chatPanel) {
			chatPanel.lookAt(cameraWorldPos);
		}
		if (inputPanel) {
			inputPanel.lookAt(cameraWorldPos);
		}
		if (sidePanel) {
			sidePanel.lookAt(cameraWorldPos);
		}
		if (scenePanel) {
			scenePanel.lookAt(cameraWorldPos);
		}

		// Build hit-target list (panels that exist)
		_hitTargets.length = 0;
		if (scenePanel) _hitTargets.push(scenePanel);
		if (sidePanel) _hitTargets.push(sidePanel);
		if (inputPanel) _hitTargets.push(inputPanel);
		if (chatPanel) _hitTargets.push(chatPanel);

		// Update reticles per controller
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
				if (hit.object === scenePanel) {
					reticle.material.color.setHex(0xf59e0b); // amber for scene panel
				} else if (hit.object === sidePanel) {
					reticle.material.color.setHex(0x10b981); // green for side panel
				} else if (hit.object === inputPanel && hit.uv && hit.uv.x > 0.84) {
					reticle.material.color.setHex(0x8b5cf6); // purple — send
				} else {
					reticle.material.color.setHex(0x6366f1); // indigo
				}
			} else {
				reticle.visible = false;
			}
		}
		// Poll thumbsticks for scrolling
		const session = renderer.xr.getSession();
		if (session) {
			for (const source of session.inputSources) {
				const axes = source.gamepad ? source.gamepad.axes : null;
				if (!axes) continue;
				const thumbY = axes.length >= 4 ? axes[3] : (axes.length >= 2 ? axes[1] : 0);

				if (source.handedness === 'right' && Math.abs(thumbY) > THUMBSTICK_DEADZONE) {
					// Right thumbstick: scroll chat
					chatScrollOffset += thumbY < 0 ? SCROLL_SPEED : -SCROLL_SPEED;
					chatScrollOffset = Math.max(0, chatScrollOffset);
					renderChatToCanvas();
				}
				if (source.handedness === 'left' && Math.abs(thumbY) > THUMBSTICK_DEADZONE) {
					// Left thumbstick: scroll scene list
					sceneScrollOffset += thumbY < 0 ? 1 : -1;
					sceneScrollOffset = Math.max(0, sceneScrollOffset);
					renderScenePanel();
				}
			}
		}
	} else {
		// Hide reticles outside XR
		for (const r of reticles) if (r) r.visible = false;
	}

	// Run user-injected animations from vr-exec code
	for (const animFn of window._vrAnimations) {
		try {
			animFn(time);
		} catch (e) {
			// Silently skip broken animation functions
		}
	}

	renderer.render(scene, camera);
});
