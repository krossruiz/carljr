/**
 * A utility class for creating a button that starts an immersive WebXR
 * session — AR passthrough where available (Quest standalone), falling
 * back to plain VR for PCVR headsets connected via Link/Air Link/SteamVR
 * (Quest 3, Quest 2/Pro, Valve Index, HTC Vive, Windows Mixed Reality,
 * etc.) that don't expose passthrough to the browser.
 *
 * Usage:
 * document.body.appendChild( XRButton.createButton( renderer ) );
 */
class XRButton {

	/**
	 * Constructs a new XR button.
	 *
	 * @param {WebGLRenderer|WebGPURenderer} renderer - The renderer.
	 * @param {XRSessionInit} [sessionInit] - Optional session configuration,
	 *   applied to whichever mode ('immersive-ar' or 'immersive-vr') ends up
	 *   being used.
	 * @return {HTMLElement} The button or an error message if neither
	 *   'immersive-ar' nor 'immersive-vr' is supported.
	 */
	static createButton( renderer, sessionInit = {} ) {

		const button = document.createElement( 'button' );

		function showEnterXR( mode ) {

			const isAR = mode === 'immersive-ar';
			let currentSession = null;

			async function onSessionStarted( session ) {

				session.addEventListener( 'end', onSessionEnded );

				// Use 'local-floor' so the world origin sits at the real floor
				// (y=0 = ground). With plain 'local', the origin is wherever
				// the headset is at session start, which puts y=0 at eye level.
				if ( renderer.xr && renderer.xr.setReferenceSpaceType ) {
					renderer.xr.setReferenceSpaceType( 'local-floor' );
				}

				await renderer.xr.setSession( session );
				button.textContent = isAR ? 'EXIT AR' : 'EXIT VR';

				currentSession = session;

			}

			function onSessionEnded() {

				currentSession.removeEventListener( 'end', onSessionEnded );

				button.textContent = isAR ? 'ENTER AR' : 'ENTER VR';

				currentSession = null;

			}

			//

			button.style.display = '';

			button.style.cursor = 'pointer';
			button.style.left = '50%';
			button.style.width = '';

			button.textContent = isAR ? 'ENTER AR' : 'ENTER VR';

			// Request useful optional features when available.
			// 'local-floor' must be in requiredFeatures or optionalFeatures
			// for setReferenceSpaceType('local-floor') to succeed; otherwise
			// the UA falls back to 'local' silently.
			const sessionOptions = {
				...sessionInit,
				requiredFeatures: [
					'local-floor',
					...( sessionInit.requiredFeatures || [] )
				],
				optionalFeatures: [
					'layers',
					'bounded-floor',
					...( isAR ? [ 'dom-overlay' ] : [] ),
					...( sessionInit.optionalFeatures || [] )
				]
			};

			// dom-overlay only makes sense (and is only supported) for AR
			// passthrough sessions — PCVR/VR-only headsets have no camera
			// feed for it to overlay onto.
			if ( isAR && sessionInit.domOverlay ) {
				sessionOptions.domOverlay = sessionInit.domOverlay;
			}

			button.onmouseenter = function () {

				button.style.opacity = '1.0';

			};

			button.onmouseleave = function () {

				button.style.opacity = '0.5';

			};

			button.onclick = function () {

				if ( currentSession === null ) {

					navigator.xr.requestSession( mode, sessionOptions ).then( onSessionStarted );

				} else {

					currentSession.end();

				}

			};

		}

		function disableButton() {

			button.style.display = '';

			button.style.cursor = 'auto';
			button.style.left = '50%';
			button.style.width = '';

			button.onmouseenter = null;
			button.onmouseleave = null;

			button.onclick = null;

		}

		function showWebXRNotFound() {

			disableButton();

			button.textContent = 'VR/AR NOT SUPPORTED';

		}

		function showXRNotAllowed( exception ) {

			disableButton();

			console.warn( 'Exception when trying to call xr.isSessionSupported', exception );

			button.textContent = 'VR/AR NOT ALLOWED';

		}

		function stylizeElement( element ) {

			// Visuals mostly live in index.html (#XRButton) for responsive /
			// high-contrast mobile styles; keep only layout-critical inline bits.
			element.classList.add( 'xr-entry-btn' );
			element.style.position = 'fixed';
			element.style.bottom = '';
			element.style.padding = '';
			element.style.border = '';
			element.style.borderRadius = '';
			element.style.background = '#f4f4f8';
			element.style.color = '#12121a';
			element.style.font = '600 14px/1.2 -apple-system, BlinkMacSystemFont, sans-serif';
			element.style.textAlign = 'center';
			element.style.opacity = '1';
			element.style.outline = 'none';
			element.style.zIndex = '999';
			element.style.boxSizing = 'border-box';
			element.style.cursor = 'pointer';
			element.style.webkitTapHighlightColor = 'transparent';

		}

		if ( 'xr' in navigator ) {

			button.id = 'XRButton';
			button.style.display = 'none';

			stylizeElement( button );

			// Prefer AR passthrough (Quest standalone); fall back to plain VR
			// for PCVR headsets via Link/Air Link/SteamVR that don't expose
			// passthrough to the browser (Valve Index, Vive, WMR, and Quest
			// itself on some OpenXR runtime versions).
			navigator.xr.isSessionSupported( 'immersive-ar' ).then( function ( arSupported ) {

				if ( arSupported ) {
					showEnterXR( 'immersive-ar' );
					return;
				}

				navigator.xr.isSessionSupported( 'immersive-vr' ).then( function ( vrSupported ) {

					vrSupported ? showEnterXR( 'immersive-vr' ) : showWebXRNotFound();

				} ).catch( showXRNotAllowed );

			} ).catch( showXRNotAllowed );

			return button;

		} else {

			const message = document.createElement( 'a' );

			if ( window.isSecureContext === false ) {

				message.href = document.location.href.replace( /^http:/, 'https:' );
				message.innerHTML = 'WEBXR NEEDS HTTPS';

			} else {

				message.href = 'https://immersiveweb.dev/';
				message.innerHTML = 'WEBXR NOT AVAILABLE';

			}

			message.style.left = '50%';
			message.style.width = '';
			message.style.textDecoration = 'none';

			stylizeElement( message );

			return message;

		}

	}

}

export { XRButton };
