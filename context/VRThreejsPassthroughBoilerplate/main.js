import * as THREE from 'three';
import { ARButton } from './threejsAddons/ARButton.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const appElement = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = null; // transparent for passthrough

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
appElement.appendChild(renderer.domElement);
renderer.setClearColor(0x000000, 0.0); // transparent clear color

// Environment for realistic reflections/refractions (helps transparent plastic look)
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const environmentTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.02).texture;
scene.environment = environmentTexture;
pmremGenerator.dispose();

document.body.appendChild(ARButton.createButton(renderer, { optionalFeatures: ['hit-test'], requiredFeatures: [] }));

// Lighting
const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
hemisphereLight.position.set(0, 1, 0);
scene.add(hemisphereLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(3, 10, 10);
scene.add(directionalLight);

// Spinning object
const geometry = new THREE.TorusKnotGeometry(0.4, 0.15, 150, 32);
const material = new THREE.MeshPhysicalMaterial({
	color: 0x88ccff,
	metalness: 0.0,
	roughness: 0.15,
	clearcoat: 0.8,
	clearcoatRoughness: 0.1,
	transmission: 0.9, // physically-based transparency
	thickness: 0.25,
	ior: 1.5,
	envMapIntensity: 1.0,
	transparent: true,
	opacity: 1.0
});
const mesh = new THREE.Mesh(geometry, material);
mesh.position.set(0, 1.6, -1.5);
mesh.scale.set(0.5, 0.5, 0.5);
scene.add(mesh);

// Vortex of rotating boxes encircling the user
const initialCameraPos = camera.position.clone();
const vortexGroup = new THREE.Group();
vortexGroup.position.set(initialCameraPos.x, 0, initialCameraPos.z);
scene.add(vortexGroup);

const boxGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
const baseOrbitAngularSpeed = 0.3; // rad/s (previous group rotation speed)
for (let i = 0; i < 20; i++) {
	const boxMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.6, 0.5) });
	const box = new THREE.Mesh(boxGeometry, boxMaterial);
	// distribute around a ring with slight vertical variance
	const radius = 2 + Math.random() * 4; // 2m to 6m
	const angle = Math.random() * Math.PI * 2;
	// random local spin speeds (radians/sec)
	const spinX = (Math.random() * 1.2 - 0.6); // -0.6..0.6
	const spinY = (Math.random() * 1.2 - 0.6);
	const spinZ = (Math.random() * 1.2 - 0.6);
	// orbit speed between 50% and 150% of previous group speed
	const orbitSpeed = baseOrbitAngularSpeed * (0.5 + Math.random());
	box.userData = { angle, radius, orbitSpeed, spinX, spinY, spinZ };
	box.position.set(Math.cos(angle) * radius, Math.random() * 2.5, Math.sin(angle) * radius);
	box.rotation.set(0, Math.random() * Math.PI * 2, 0);
	vortexGroup.add(box);
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);

// Adjust object height for AR so it's at eye level
renderer.xr.addEventListener('sessionstart', () => {
	mesh.position.y = 0; // in AR, camera Y is ~0, so 0 is eye level
	// center the vortex around the user in AR
	vortexGroup.position.set(0, 0, 0);
});

renderer.xr.addEventListener('sessionend', () => {
	mesh.position.y = 1.6; // restore for non-AR
	// restore the vortex center to the initial camera position
	vortexGroup.position.set(initialCameraPos.x, 0, initialCameraPos.z);
});

// VR animation loop
let previousTimeMs = 0;
renderer.setAnimationLoop((timeMs) => {
	const timeSeconds = timeMs * 0.001;
	const deltaSeconds = previousTimeMs === 0 ? 0 : (timeMs - previousTimeMs) * 0.001;
	previousTimeMs = timeMs;

	// rotate knot
	mesh.rotation.x = timeSeconds * 0.6;
	mesh.rotation.y = timeSeconds * 0.8;

	// update each box: spin locally and orbit around center
	for (const box of vortexGroup.children) {
		const d = box.userData;
		if (!d) continue;
		d.angle += d.orbitSpeed * deltaSeconds;
		box.position.x = Math.cos(d.angle) * d.radius;
		box.position.z = Math.sin(d.angle) * d.radius;
		box.rotation.x += d.spinX * deltaSeconds;
		box.rotation.y += d.spinY * deltaSeconds;
		box.rotation.z += d.spinZ * deltaSeconds;
	}

	renderer.render(scene, camera);
});

