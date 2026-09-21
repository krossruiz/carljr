/**
 * Surface-aware AR placement for carljr.
 *
 * Two backends:
 *  1) WebXR hit-test (+ optional plane-detection) — Android Chrome / Quest.
 *     Finger / controller hits real surfaces; drag snaps the scene onto them.
 *  2) AlvaAR WASM SLAM — Walk-in-AR when WebXR AR isn't available (e.g. iOS).
 *     Visual SLAM tracks the camera and findPlane() snaps to a detected plane.
 *
 * AlvaAR is GPLv3 — see vendor_modules/alvaar/LICENSE.
 */
import { AlvaAR } from './vendor_modules/alvaar/alva_ar.js';
import { AlvaARConnectorTHREE } from './vendor_modules/alvaar/alva_ar_three.js';

/**
 * @param {object} deps
 * @param {typeof import('three')} deps.THREE
 * @param {import('three').WebGLRenderer} deps.renderer
 * @param {import('three').Scene} deps.scene
 * @param {import('three').PerspectiveCamera} deps.camera
 * @param {import('three').Group} deps.player
 * @param {import('three').Group} deps.arPlacementRoot
 * @param {() => void} deps.ensureMarker
 * @param {(active: boolean, opts?: object) => void} deps.setPlacementActive
 * @param {(msg: string, kind?: string) => void} deps.updateStatus
 * @param {HTMLVideoElement} deps.arVideoEl
 */
export function createArSurfaceTracker(deps) {
	const {
		THREE,
		renderer,
		scene,
		camera,
		player,
		arPlacementRoot,
		ensureMarker,
		setPlacementActive,
		updateStatus,
		arVideoEl
	} = deps;

	const applyAlvaPose = AlvaARConnectorTHREE.Initialize(THREE);

	let mode = null; // null | 'webxr' | 'alva'
	let hitTestSource = null;
	let hitTestSourceRequested = false;
	let transientHitTestSource = null;
	let xrPlanes = null;
	let reticle = null;
	let webxrDragging = false;

	let alva = null;
	let alvaProcCanvas = null;
	let alvaProcCtx = null;
	let alvaTracking = false;
	let alvaPendingSnap = false;
	let alvaDragging = false;
	const _mat = new THREE.Matrix4();
	const _pos = new THREE.Vector3();
	const _quat = new THREE.Quaternion();
	const _scl = new THREE.Vector3();
	const _euler = new THREE.Euler();

	function ensureReticle() {
		if (reticle) return reticle;
		reticle = new THREE.Mesh(
			new THREE.RingGeometry(0.08, 0.11, 32).rotateX(-Math.PI / 2),
			new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
		);
		reticle.matrixAutoUpdate = false;
		reticle.visible = false;
		reticle.name = 'arSurfaceReticle';
		scene.add(reticle);
		return reticle;
	}

	/** Snap placement root to a hit matrix; keep content upright (yaw from surface). */
	function snapPlacementToMatrix(matrixArrayOrMatrix, { upright = true } = {}) {
		if (matrixArrayOrMatrix.isMatrix4) _mat.copy(matrixArrayOrMatrix);
		else _mat.fromArray(matrixArrayOrMatrix);
		_mat.decompose(_pos, _quat, _scl);
		arPlacementRoot.position.copy(_pos);
		if (upright) {
			_euler.setFromQuaternion(_quat, 'YXZ');
			arPlacementRoot.rotation.set(0, _euler.y, 0);
		} else {
			arPlacementRoot.quaternion.copy(_quat);
		}
		arPlacementRoot.scale.set(1, 1, 1);
		ensureMarker();
	}

	function snapPlacementFromAlvaPlane(planePose) {
		applyAlvaPose(planePose, _quat, _pos);
		arPlacementRoot.position.copy(_pos);
		_euler.setFromQuaternion(_quat, 'YXZ');
		arPlacementRoot.rotation.set(0, _euler.y, 0);
		arPlacementRoot.scale.set(1, 1, 1);
		ensureMarker();
	}

	// ----- WebXR -----
	function onWebXRSessionStart(session) {
		mode = 'webxr';
		hitTestSource = null;
		hitTestSourceRequested = false;
		transientHitTestSource = null;
		ensureReticle();
		setPlacementActive(true, { backend: 'webxr' });

		if (!xrPlanes) {
			try {
				// Lazy dynamic import kept optional — caller may pass XRPlanes factory
			} catch { /* ignore */ }
		}

		updateStatus('AR surfaces — aim reticle, tap or drag to place', 'connected');

		session.addEventListener('selectstart', () => { webxrDragging = true; });
		session.addEventListener('selectend', () => { webxrDragging = false; });
		session.addEventListener('select', () => {
			if (reticle?.visible) {
				snapPlacementToMatrix(reticle.matrix);
				updateStatus('Scene placed on surface', 'connected');
			}
		});
	}

	function onWebXRSessionEnd() {
		if (mode === 'webxr') {
			mode = null;
			hitTestSource = null;
			hitTestSourceRequested = false;
			transientHitTestSource = null;
			webxrDragging = false;
			if (reticle) reticle.visible = false;
			setPlacementActive(false);
		}
	}

	function updateWebXRFrame(frame) {
		if (!frame || mode !== 'webxr') return;
		const referenceSpace = renderer.xr.getReferenceSpace();
		const session = renderer.xr.getSession();
		if (!session || !referenceSpace) return;

		if (!hitTestSourceRequested) {
			hitTestSourceRequested = true;
			session.requestReferenceSpace('viewer').then((viewerSpace) => {
				if (session.requestHitTestSource) {
					session.requestHitTestSource({ space: viewerSpace }).then((source) => {
						hitTestSource = source;
					}).catch(() => {});
				}
				if (session.requestHitTestSourceForTransientInput) {
					session.requestHitTestSourceForTransientInput({ profile: 'generic-touchscreen' })
						.then((source) => { transientHitTestSource = source; })
						.catch(() => {});
				}
			}).catch(() => {});
			session.addEventListener('end', () => {
				hitTestSourceRequested = false;
				hitTestSource = null;
				transientHitTestSource = null;
			});
		}

		let placedFromTransient = false;
		if (transientHitTestSource) {
			const transientResults = frame.getHitTestResultsForTransientInput(transientHitTestSource);
			for (const finger of transientResults) {
				if (!finger.results?.length) continue;
				const hit = finger.results[0];
				const pose = hit.getPose(referenceSpace);
				if (!pose) continue;
				reticle.visible = true;
				reticle.matrix.fromArray(pose.transform.matrix);
				snapPlacementToMatrix(pose.transform.matrix);
				placedFromTransient = true;
				webxrDragging = true;
			}
			if (!transientResults.length) webxrDragging = false;
		}

		if (hitTestSource && !placedFromTransient) {
			const hits = frame.getHitTestResults(hitTestSource);
			if (hits.length) {
				const pose = hits[0].getPose(referenceSpace);
				if (pose) {
					reticle.visible = true;
					reticle.matrix.fromArray(pose.transform.matrix);
					if (webxrDragging) snapPlacementToMatrix(pose.transform.matrix);
				}
			} else if (!webxrDragging) {
				reticle.visible = false;
			}
		}
	}

	// ----- AlvaAR (Walk-in-AR) -----
	async function startAlvaAR() {
		const w = Math.min(640, window.innerWidth);
		const h = Math.min(480, Math.round(w * (window.innerHeight / Math.max(1, window.innerWidth))));
		alvaProcCanvas = document.createElement('canvas');
		alvaProcCanvas.width = w;
		alvaProcCanvas.height = h;
		alvaProcCanvas.style.display = 'none';
		document.body.appendChild(alvaProcCanvas);
		alvaProcCtx = alvaProcCanvas.getContext('2d', { alpha: false, willReadFrequently: true });

		updateStatus('Loading surface tracker…', 'connecting');
		alva = await AlvaAR.Initialize(w, h, 70);
		mode = 'alva';
		alvaTracking = false;
		alvaPendingSnap = true; // auto-place once first plane appears
		setPlacementActive(true, { backend: 'alva' });

		// Reset rig so AlvaAR writes camera local pose cleanly
		player.position.set(0, 0, 0);
		player.rotation.set(0, 0, 0);
		camera.position.set(0, 0, 0);
		camera.quaternion.identity();

		updateStatus('Move phone to scan surfaces — tap/drag to place', 'connected');
	}

	function stopAlvaAR() {
		if (mode === 'alva') {
			mode = null;
			alva = null;
			alvaTracking = false;
			alvaDragging = false;
			alvaPendingSnap = false;
			if (alvaProcCanvas?.parentNode) alvaProcCanvas.parentNode.removeChild(alvaProcCanvas);
			alvaProcCanvas = null;
			alvaProcCtx = null;
			setPlacementActive(false);
		}
	}

	function updateAlvaFrame() {
		if (mode !== 'alva' || !alva || !alvaProcCtx || !arVideoEl || arVideoEl.readyState < 2) return;

		const w = alvaProcCanvas.width;
		const h = alvaProcCanvas.height;
		alvaProcCtx.drawImage(arVideoEl, 0, 0, w, h);
		const frame = alvaProcCtx.getImageData(0, 0, w, h);
		const pose = alva.findCameraPose(frame);

		if (pose) {
			alvaTracking = true;
			applyAlvaPose(pose, camera.quaternion, camera.position);

			if (alvaPendingSnap || alvaDragging) {
				const planePose = alva.findPlane();
				if (planePose) {
					snapPlacementFromAlvaPlane(planePose);
					if (alvaPendingSnap) {
						alvaPendingSnap = false;
						updateStatus('Scene snapped to surface — drag to move', 'connected');
					}
				}
			}
		} else {
			alvaTracking = false;
			// Keep last camera pose; draw feature dots onto a debug overlay? skip for production.
		}
	}

	function onAlvaPointerDown(e) {
		if (mode !== 'alva') return false;
		alvaDragging = true;
		alvaPendingSnap = true; // force re-find plane under aim
		return true;
	}

	function onAlvaPointerMove(e) {
		if (mode !== 'alva' || !alvaDragging) return false;
		alvaPendingSnap = true;
		return true;
	}

	function onAlvaPointerUp() {
		if (mode !== 'alva') return false;
		alvaDragging = false;
		return true;
	}

	function getMode() { return mode; }
	function isTracking() { return mode === 'webxr' || alvaTracking; }

	return {
		onWebXRSessionStart,
		onWebXRSessionEnd,
		updateWebXRFrame,
		startAlvaAR,
		stopAlvaAR,
		updateAlvaFrame,
		onAlvaPointerDown,
		onAlvaPointerMove,
		onAlvaPointerUp,
		getMode,
		isTracking,
		ensureReticle
	};
}
