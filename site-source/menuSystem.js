/**
 * Shared declarative menu-button system used by BOTH the desktop DOM menu
 * and the XR canvas panels, so a button only has to be defined once.
 *
 * The pattern: each panel's buttons are described as plain data (see the
 * *_BUTTONS specs in main.js). buildButtonLayout() lays them out (wrapping
 * rows, like CSS flex-wrap) into pixel boxes in one shared coordinate
 * space. Desktop renders those boxes as a real, interactive <svg>
 * (buttonsToSVG) with normal DOM click handling; XR draws the exact same
 * boxes directly onto its canvas texture (drawButtonsToCanvas) and uses
 * them for controller-ray/touch hit-testing (hitTestButtons). Add, rename,
 * recolor, or move a button in the spec and both surfaces update together.
 */

export const VARIANT_COLORS = {
	default: { fill: 'rgba(255,255,255,0.1)', text: '#ffffff' },
	secondary: { fill: 'rgba(255,255,255,0.1)', text: '#ffffff' },
	accent: { fill1: '#6366f1', fill2: '#8b5cf6', text: '#ffffff' },
	success: { fill1: '#10b981', fill2: '#059669', text: '#ffffff' },
	warning: { fill1: '#f59e0b', fill2: '#d97706', text: '#ffffff' },
	active: { fill: '#10b981', text: '#ffffff' },
	inactiveToggle: { fill: 'rgba(255,255,255,0.1)', text: 'rgba(255,255,255,0.6)' }
};

/**
 * Lays out a row of buttons that wraps like `flex-wrap: wrap`.
 * @param {Array<{id:string,label:string,action:string,variant?:string}>} buttons
 * @param {{width:number,x?:number,y?:number,gap?:number,height?:number,minWidth?:number,perRow?:number}} opts
 * @returns {{boxes: Array<object>, totalHeight: number}}
 */
export function buildButtonLayout(buttons, opts) {
	const { width, x = 0, y = 0, gap = 8, height = 50, minWidth = 100, perRow = null } = opts;
	const cols = Math.max(1, perRow || Math.floor((width + gap) / (minWidth + gap)));
	const colW = (width - gap * (cols - 1)) / cols;

	const boxes = buttons.map((btn, i) => {
		const col = i % cols;
		const row = Math.floor(i / cols);
		return {
			...btn,
			x: x + col * (colW + gap),
			y: y + row * (height + gap),
			w: colW,
			h: height
		};
	});

	const rows = Math.ceil(buttons.length / cols) || 1;
	const totalHeight = rows * height + (rows - 1) * gap;
	return { boxes, totalHeight };
}

function escapeXml(s) {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Renders button boxes to an SVG markup fragment (no outer <svg> tag - the
 * caller wraps it with the right viewBox/size for its container).
 */
export function buttonsToSVG(boxes, { fontSize = 13, radius = 10 } = {}) {
	const defs = [];
	const groups = boxes.map(b => {
		const v = VARIANT_COLORS[b.variant] || VARIANT_COLORS.default;
		let fill = v.fill;
		if (v.fill1) {
			const gradId = `grad-${b.id}`;
			defs.push(`<linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${v.fill1}"/><stop offset="1" stop-color="${v.fill2}"/></linearGradient>`);
			fill = `url(#${gradId})`;
		}
		return `<g class="menu-btn" data-action="${escapeXml(b.action)}" data-id="${escapeXml(b.id)}" tabindex="0" role="button" style="cursor:pointer">` +
			`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${radius}" fill="${fill}" />` +
			`<text x="${b.x + b.w / 2}" y="${b.y + b.h / 2}" fill="${v.text}" font-size="${fontSize}" font-weight="700" ` +
			`font-family="-apple-system,BlinkMacSystemFont,sans-serif" text-anchor="middle" dominant-baseline="central">${escapeXml(b.label)}</text>` +
			`</g>`;
	});
	const defsMarkup = defs.length ? `<defs>${defs.join('')}</defs>` : '';
	return defsMarkup + groups.join('');
}

/** Draws the same button boxes directly onto a 2D canvas context (XR panels). */
export function drawButtonsToCanvas(ctx, boxes, { fontSize = 20, radius = 10 } = {}) {
	for (const b of boxes) {
		const v = VARIANT_COLORS[b.variant] || VARIANT_COLORS.default;
		if (v.fill1) {
			const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
			grad.addColorStop(0, v.fill1);
			grad.addColorStop(1, v.fill2);
			ctx.fillStyle = grad;
		} else {
			ctx.fillStyle = v.fill;
		}
		roundRectPath(ctx, b.x, b.y, b.w, b.h, radius);
		ctx.fill();
		ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
		ctx.fillStyle = v.text;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
	}
}

function roundRectPath(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

/** Returns the box under (x, y) in the same coordinate space the boxes were laid out in, or null. */
export function hitTestButtons(boxes, x, y) {
	for (const b of boxes) {
		if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
	}
	return null;
}

/**
 * Mounts a button spec into a DOM container as a live, interactive SVG, and
 * wires a single delegated click handler that calls `onAction(action, id)`.
 * Returns the box layout in case the caller also needs it (e.g. to draw the
 * matching XR canvas version at the same coordinates).
 */
export function mountButtonsToDOM(container, buttons, layoutOpts, onAction) {
	const { boxes, totalHeight } = buildButtonLayout(buttons, layoutOpts);
	const svgBody = buttonsToSVG(boxes, { fontSize: layoutOpts.fontSize });
	container.innerHTML = `<svg viewBox="0 0 ${layoutOpts.width} ${totalHeight}" width="100%" style="display:block" preserveAspectRatio="xMidYMid meet">${svgBody}</svg>`;
	container.onclick = (e) => {
		const g = e.target.closest('[data-action]');
		if (!g) return;
		onAction(g.getAttribute('data-action'), g.getAttribute('data-id'));
	};
	return { boxes, totalHeight };
}
