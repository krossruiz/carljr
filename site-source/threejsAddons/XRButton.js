/**
 * A utility class for creating a button that starts an immersive-vr
 * WebXR session. immersive-ar is intentionally not offered.
 *
 * Usage:
 * document.body.appendChild( XRButton.createButton( renderer ) );
 */
class XRButton {

	/**
	 * Constructs a new XR button.
	 *
	 * @param {WebGLRenderer|WebGPURenderer} renderer - The renderer.
	 * @param {XRSessionInit} [sessionInit] - Optional session configuration
	 *   applied to the immersive-vr session.
	 * @return {HTMLElement} The button or an error message if
	 *   'immersive-vr' is not supported.
	 */
	static createButton( renderer, sessionInit = {} ) {

		const button = document.createElement( 'button' );

		function showEnterXR( mode ) {

			// Only immersive-vr is ever requested. Ignore any other mode.
			if ( mode !== 'immersive-vr' ) mode = 'immersive-vr';
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
				button.textContent = 'EXIT VR';

				currentSession = session;

			}

			function onSessionEnded() {

				currentSession.removeEventListener( 'end', onSessionEnded );

				button.textContent = 'ENTER VR';

				currentSession = null;

			}

			//

			button.style.display = '';

			button.style.cursor = 'pointer';
			button.style.left = '50%';
			button.style.width = '';

			button.textContent = 'ENTER VR';

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
					...( sessionInit.optionalFeatures || [] )
				]
			};

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

			button.textContent = 'VR NOT SUPPORTED';

		}

		function showXRNotAllowed( exception ) {

			disableButton();

			console.warn( 'Exception when trying to call xr.isSessionSupported', exception );

			button.textContent = 'VR NOT ALLOWED';

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

			// immersive-vr only. immersive-ar is not queried or requested.
			navigator.xr.isSessionSupported( 'immersive-vr' ).then( function ( vrSupported ) {

				vrSupported ? showEnterXR( 'immersive-vr' ) : showWebXRNotFound();

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
