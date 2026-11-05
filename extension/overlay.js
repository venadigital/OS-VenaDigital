(function() {
	//#region node_modules/perfect-freehand/dist/esm/index.mjs
	var { PI: e } = Math, t = e + 1e-4, n = .5, r = [1, 1];
	function i(e, t, n, r = (e) => e) {
		return e * r(.5 - t * (.5 - n));
	}
	var { min: a } = Math;
	function o(e, t, n) {
		let r = a(1, t / n);
		return a(1, e + (a(1, 1 - r) - e) * (r * .275));
	}
	function s(e) {
		return [-e[0], -e[1]];
	}
	function c(e, t) {
		return [e[0] + t[0], e[1] + t[1]];
	}
	function l(e, t, n) {
		return e[0] = t[0] + n[0], e[1] = t[1] + n[1], e;
	}
	function u(e, t) {
		return [e[0] - t[0], e[1] - t[1]];
	}
	function d(e, t, n) {
		return e[0] = t[0] - n[0], e[1] = t[1] - n[1], e;
	}
	function f(e, t) {
		return [e[0] * t, e[1] * t];
	}
	function p(e, t, n) {
		return e[0] = t[0] * n, e[1] = t[1] * n, e;
	}
	function m(e, t) {
		return [e[0] / t, e[1] / t];
	}
	function h(e) {
		return [e[1], -e[0]];
	}
	function g(e, t) {
		let n = t[0];
		return e[0] = t[1], e[1] = -n, e;
	}
	function ee(e, t) {
		return e[0] * t[0] + e[1] * t[1];
	}
	function _(e, t) {
		return e[0] === t[0] && e[1] === t[1];
	}
	function v(e) {
		return Math.hypot(e[0], e[1]);
	}
	function y(e, t) {
		let n = e[0] - t[0], r = e[1] - t[1];
		return n * n + r * r;
	}
	function b(e) {
		return m(e, v(e));
	}
	function x(e, t) {
		return Math.hypot(e[1] - t[1], e[0] - t[0]);
	}
	function S(e, t, n) {
		let r = Math.sin(n), i = Math.cos(n), a = e[0] - t[0], o = e[1] - t[1], s = a * i - o * r, c = a * r + o * i;
		return [s + t[0], c + t[1]];
	}
	function C(e, t, n, r) {
		let i = Math.sin(r), a = Math.cos(r), o = t[0] - n[0], s = t[1] - n[1], c = o * a - s * i, l = o * i + s * a;
		return e[0] = c + n[0], e[1] = l + n[1], e;
	}
	function w(e, t, n) {
		return c(e, f(u(t, e), n));
	}
	function te(e, t, n, r) {
		let i = n[0] - t[0], a = n[1] - t[1];
		return e[0] = t[0] + i * r, e[1] = t[1] + a * r, e;
	}
	function T(e, t, n) {
		return c(e, f(t, n));
	}
	var E = [0, 0];
	var D = [0, 0];
	var O = [0, 0];
	function k(e, n) {
		let r = T(e, b(h(u(e, c(e, [1, 1])))), -n), i = [], a = 1 / 13;
		for (let n = a; n <= 1; n += a) i.push(S(r, e, t * 2 * n));
		return i;
	}
	function A(e, n, r) {
		let i = [], a = 1 / r;
		for (let r = a; r <= 1; r += a) i.push(S(n, e, t * r));
		return i;
	}
	function j(e, t, n) {
		let r = u(t, n), i = f(r, .5), a = f(r, .51);
		return [
			u(e, i),
			u(e, a),
			c(e, a),
			c(e, i)
		];
	}
	function M(e, n, r, i) {
		let a = [], o = T(e, n, r), s = 1 / i;
		for (let n = s; n < 1; n += s) a.push(S(o, e, t * 3 * n));
		return a;
	}
	function ne(e, t, n) {
		return [
			c(e, f(t, n)),
			c(e, f(t, n * .99)),
			u(e, f(t, n * .99)),
			u(e, f(t, n))
		];
	}
	function N(e, t, n) {
		return e === !1 || e === void 0 ? 0 : e === !0 ? Math.max(t, n) : e;
	}
	function re(e, t, n) {
		return e.slice(0, 10).reduce((e, r) => {
			let i = r.pressure;
			return t && (i = o(e, r.distance, n)), (e + i) / 2;
		}, e[0].pressure);
	}
	function P(e, n = {}) {
		let { size: r = 16, smoothing: a = .5, thinning: f = .5, simulatePressure: m = !0, easing: _ = (e) => e, start: v = {}, end: b = {}, last: x = !1 } = n, { cap: S = !0, easing: w = (e) => e * (2 - e) } = v, { cap: T = !0, easing: P = (e) => --e * e * e + 1 } = b;
		if (e.length === 0 || r <= 0) return [];
		let F = e[e.length - 1].runningLength, I = N(v.taper, r, F), L = N(b.taper, r, F), R = (r * a) ** 2, z = [], B = [], V = re(e, m, r), H = i(r, f, e[e.length - 1].pressure, _), U, W = e[0].vector, G = e[0].point, K = G, q = G, J = K, Y = !1;
		for (let n = 0; n < e.length; n++) {
			let { pressure: a } = e[n], { point: s, vector: h, distance: v, runningLength: b } = e[n], x = n === e.length - 1;
			if (!x && F - b < 3) continue;
			f ? (m && (a = o(V, v, r)), H = i(r, f, a, _)) : H = r / 2, U === void 0 && (U = H);
			let S = b < I ? w(b / I) : 1, T = F - b < L ? P((F - b) / L) : 1;
			H = Math.max(.01, H * Math.min(S, T));
			let k = (x ? e[n] : e[n + 1]).vector, A = x ? 1 : ee(h, k), j = ee(h, W) < 0 && !Y, M = A !== null && A < 0;
			if (j || M) {
				g(E, W), p(E, E, H);
				for (let e = 0; e <= 1; e += .07692307692307693) d(D, s, E), C(D, D, s, t * e), q = [D[0], D[1]], z.push(q), l(O, s, E), C(O, O, s, t * -e), J = [O[0], O[1]], B.push(J);
				G = q, K = J, M && (Y = !0);
				continue;
			}
			if (Y = !1, x) {
				g(E, h), p(E, E, H), z.push(u(s, E)), B.push(c(s, E));
				continue;
			}
			te(E, k, h, A), g(E, E), p(E, E, H), d(D, s, E), q = [D[0], D[1]], (n <= 1 || y(G, q) > R) && (z.push(q), G = q), l(O, s, E), J = [O[0], O[1]], (n <= 1 || y(K, J) > R) && (B.push(J), K = J), V = a, W = h;
		}
		let X = [e[0].point[0], e[0].point[1]], Z = e.length > 1 ? [e[e.length - 1].point[0], e[e.length - 1].point[1]] : c(e[0].point, [1, 1]), Q = [], $ = [];
		if (e.length === 1) {
			if (!(I || L) || x) return k(X, U || H);
		} else {
			I || L && e.length === 1 || (S ? Q.push(...A(X, B[0], 13)) : Q.push(...j(X, z[0], B[0])));
			let t = h(s(e[e.length - 1].vector));
			L || I && e.length === 1 ? $.push(Z) : T ? $.push(...M(Z, t, H, 29)) : $.push(...ne(Z, t, H));
		}
		return z.concat($, B.reverse(), Q);
	}
	var F = [0, 0];
	function I(e) {
		return e != null && e >= 0;
	}
	function L(e, t = {}) {
		let { streamline: i = .5, size: a = 16, last: o = !1 } = t;
		if (e.length === 0) return [];
		let s = .15 + (1 - i) * .85, l = Array.isArray(e[0]) ? e : e.map(({ x: e, y: t, pressure: r = n }) => [
			e,
			t,
			r
		]);
		if (l.length === 2) {
			let e = l[1];
			l = l.slice(0, -1);
			for (let t = 1; t < 5; t++) l.push(w(l[0], e, t / 4));
		}
		l.length === 1 && (l = [...l, [...c(l[0], r), ...l[0].slice(2)]]);
		let u = [{
			point: [l[0][0], l[0][1]],
			pressure: I(l[0][2]) ? l[0][2] : .25,
			vector: [...r],
			distance: 0,
			runningLength: 0
		}], f = !1, p = 0, m = u[0], h = l.length - 1;
		for (let e = 1; e < l.length; e++) {
			let t = o && e === h ? [l[e][0], l[e][1]] : w(m.point, l[e], s);
			if (_(m.point, t)) continue;
			let r = x(t, m.point);
			if (p += r, e < h && !f) {
				if (p < a) continue;
				f = !0;
			}
			d(F, m.point, t), m = {
				point: t,
				pressure: I(l[e][2]) ? l[e][2] : n,
				vector: b(F),
				distance: r,
				runningLength: p
			}, u.push(m);
		}
		return u[0].vector = u[1]?.vector || [0, 0], u;
	}
	function R(e, t = {}) {
		return P(L(e, t), t);
	}
	//#endregion
	//#region src/features/documentos/model.ts
	var INK_COLORS = [
		"#1f1e1c",
		"#e03131",
		"#f08c00",
		"#2f9e44",
		"#1971c2",
		"#7048e8",
		"#e64980",
		"#868e96"
	];
	var HIGHLIGHT_COLORS = [
		"#ffd43b",
		"#8ce99a",
		"#74c0fc",
		"#faa2c1",
		"#ffa94d"
	];
	var NOTE_COLORS = [
		"#ffd43b",
		"#faa2c1",
		"#74c0fc",
		"#8ce99a"
	];
	var PEN_WIDTHS = [
		1,
		2,
		3.5,
		6,
		10
	];
	var MARKER_WIDTHS = [
		8,
		14,
		20,
		28
	];
	var SHAPE_WIDTHS = [
		1.5,
		3,
		5
	];
	var TEXT_SIZES = [
		12,
		16,
		22,
		32
	];
	/** Opacity of highlights (marker and text) on the white page. */
	var HIGHLIGHT_OPACITY = .4;
	/** Text: line height and first baseline, as multiples of the font size. */
	var TEXT_LINE = 1.25;
	var TEXT_BASELINE = .92;
	var TEXT_FONT = "Helvetica, Arial, sans-serif";
	var DEFAULT_STYLES = {
		pen: {
			color: INK_COLORS[0],
			width: PEN_WIDTHS[1]
		},
		marker: {
			color: HIGHLIGHT_COLORS[0],
			width: MARKER_WIDTHS[1]
		},
		shape: {
			color: INK_COLORS[1],
			width: SHAPE_WIDTHS[1]
		},
		text: {
			color: INK_COLORS[0],
			size: TEXT_SIZES[1]
		},
		texthl: { color: HIGHLIGHT_COLORS[0] },
		note: { color: NOTE_COLORS[0] }
	};
	var uid = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
	var r2 = (n) => Math.round(n * 100) / 100;
	var penOptions = (a, last = true) => ({
		size: a.width * 1.6,
		thinning: a.pressure ? .65 : .35,
		smoothing: .55,
		streamline: .45,
		simulatePressure: !a.pressure,
		last
	});
	/** Filled outline of a pen stroke (polygon). */
	function inkOutline(a, last = true) {
		return R(a.points, penOptions(a, last));
	}
	/** SVG path of a closed polygon with smoothed corners (perfect-freehand's recipe). */
	function polygonPath(pts) {
		if (pts.length < 2) return "";
		const d = pts.reduce((acc, [x0, y0], i, arr) => {
			const [x1, y1] = arr[(i + 1) % arr.length];
			acc.push(r2(x0), r2(y0), r2((x0 + x1) / 2), r2((y0 + y1) / 2));
			return acc;
		}, [
			"M",
			r2(pts[0][0]),
			r2(pts[0][1]),
			"Q"
		]);
		d.push("Z");
		return d.join(" ");
	}
	/** Open, smoothed path through the points (highlighter). */
	function linePath(points) {
		if (!points.length) return "";
		const [first, ...rest] = points;
		if (!rest.length) return `M ${r2(first[0])} ${r2(first[1])} L ${r2(first[0] + .01)} ${r2(first[1])}`;
		let d = `M ${r2(first[0])} ${r2(first[1])}`;
		for (let i = 0; i < rest.length - 1; i++) {
			const [x, y] = rest[i];
			const [nx, ny] = rest[i + 1];
			d += ` Q ${r2(x)} ${r2(y)} ${r2((x + nx) / 2)} ${r2((y + ny) / 2)}`;
		}
		const last = rest[rest.length - 1];
		return `${d} L ${r2(last[0])} ${r2(last[1])}`;
	}
	/** Drops points closer than `min` to the previous one; keeps strokes light in the database. */
	function simplify(points, min = .6) {
		const round = (p) => [
			r2(p[0]),
			r2(p[1]),
			Math.round(p[2] * 100) / 100
		];
		const out = [];
		for (const p of points) {
			const prev = out[out.length - 1];
			if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) >= min) out.push(round(p));
		}
		const last = points[points.length - 1];
		const kept = out[out.length - 1];
		if (last && kept && (kept[0] !== r2(last[0]) || kept[1] !== r2(last[1]))) out.push(round(last));
		return out;
	}
	/** Shift: squares, circles and lines at 45° steps. */
	function constrainShape(kind, x1, y1, x2, y2) {
		const dx = x2 - x1;
		const dy = y2 - y1;
		if (kind === "rect" || kind === "ellipse") {
			const s = Math.max(Math.abs(dx), Math.abs(dy));
			return [x1 + Math.sign(dx || 1) * s, y1 + Math.sign(dy || 1) * s];
		}
		const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
		const len = Math.hypot(dx, dy);
		return [x1 + Math.cos(angle) * len, y1 + Math.sin(angle) * len];
	}
	/** The two ends of an arrow head at (x2, y2). */
	function arrowHead(x1, y1, x2, y2, width) {
		const angle = Math.atan2(y2 - y1, x2 - x1);
		const len = Math.min(Math.max(10, width * 4.5), Math.hypot(x2 - x1, y2 - y1) * .6 || 10);
		const spread = Math.PI / 7;
		return [[x2 - len * Math.cos(angle - spread), y2 - len * Math.sin(angle - spread)], [x2 - len * Math.cos(angle + spread), y2 - len * Math.sin(angle + spread)]];
	}
	var measureCtx;
	function textWidth(text, size) {
		if (measureCtx === void 0) measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
		if (!measureCtx) return text.length * size * .55;
		measureCtx.font = `${size}px ${TEXT_FONT}`;
		return measureCtx.measureText(text).width;
	}
	var textLines = (text) => text.split("\n");
	/** Note pins keep a comfortable size on screen whatever the zoom. */
	var noteSize = (zoom) => Math.max(18, 26 / zoom);
	function bbox(a, zoom = 1) {
		switch (a.type) {
			case "ink":
			case "marker": {
				const xs = a.points.map((p) => p[0]);
				const ys = a.points.map((p) => p[1]);
				const pad = a.width / 2;
				const x = Math.min(...xs) - pad;
				const y = Math.min(...ys) - pad;
				return {
					x,
					y,
					w: Math.max(...xs) + pad - x,
					h: Math.max(...ys) + pad - y
				};
			}
			case "rect":
			case "ellipse":
			case "line":
			case "arrow": {
				const pad = a.type === "arrow" ? Math.max(10, a.width * 4.5) / 2 + a.width : a.width / 2;
				return {
					x: Math.min(a.x1, a.x2) - pad,
					y: Math.min(a.y1, a.y2) - pad,
					w: Math.abs(a.x2 - a.x1) + pad * 2,
					h: Math.abs(a.y2 - a.y1) + pad * 2
				};
			}
			case "text": {
				const lines = textLines(a.text);
				const w = Math.max(a.size, ...lines.map((l) => textWidth(l, a.size)));
				return {
					x: a.x,
					y: a.y,
					w,
					h: lines.length * a.size * TEXT_LINE
				};
			}
			case "texthl": {
				const x = Math.min(...a.rects.map((r) => r[0]));
				const y = Math.min(...a.rects.map((r) => r[1]));
				return {
					x,
					y,
					w: Math.max(...a.rects.map((r) => r[0] + r[2])) - x,
					h: Math.max(...a.rects.map((r) => r[1] + r[3])) - y
				};
			}
			case "note": {
				const s = noteSize(zoom);
				return {
					x: a.x,
					y: a.y,
					w: s,
					h: s
				};
			}
		}
	}
	function distToSegment(px, py, x1, y1, x2, y2) {
		const dx = x2 - x1;
		const dy = y2 - y1;
		const len2 = dx * dx + dy * dy;
		const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
		return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
	}
	var inBox = (b, x, y, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
	/** Whether the point (x, y) touches the mark, with a tolerance `tol` (page units). */
	function hitTest(a, x, y, tol, zoom = 1) {
		switch (a.type) {
			case "ink":
			case "marker": {
				const reach = a.width / 2 + tol;
				if (!inBox(bbox(a), x, y, tol)) return false;
				if (a.points.length === 1) return Math.hypot(a.points[0][0] - x, a.points[0][1] - y) <= reach;
				for (let i = 1; i < a.points.length; i++) {
					const [x1, y1] = a.points[i - 1];
					const [x2, y2] = a.points[i];
					if (distToSegment(x, y, x1, y1, x2, y2) <= reach) return true;
				}
				return false;
			}
			case "line":
			case "arrow": {
				const reach = a.width / 2 + tol;
				if (distToSegment(x, y, a.x1, a.y1, a.x2, a.y2) <= reach) return true;
				if (a.type === "line") return false;
				return arrowHead(a.x1, a.y1, a.x2, a.y2, a.width).some(([hx, hy]) => distToSegment(x, y, a.x2, a.y2, hx, hy) <= reach);
			}
			case "rect": {
				const reach = a.width / 2 + tol;
				const [l, r] = [Math.min(a.x1, a.x2), Math.max(a.x1, a.x2)];
				const [t, b] = [Math.min(a.y1, a.y2), Math.max(a.y1, a.y2)];
				return distToSegment(x, y, l, t, r, t) <= reach || distToSegment(x, y, r, t, r, b) <= reach || distToSegment(x, y, r, b, l, b) <= reach || distToSegment(x, y, l, b, l, t) <= reach;
			}
			case "ellipse": {
				const cx = (a.x1 + a.x2) / 2;
				const cy = (a.y1 + a.y2) / 2;
				const rx = Math.abs(a.x2 - a.x1) / 2;
				const ry = Math.abs(a.y2 - a.y1) / 2;
				if (rx < 1 || ry < 1) return distToSegment(x, y, a.x1, a.y1, a.x2, a.y2) <= a.width / 2 + tol;
				const k = Math.hypot((x - cx) / rx, (y - cy) / ry);
				const angle = Math.atan2((y - cy) / ry, (x - cx) / rx);
				const ex = cx + rx * Math.cos(angle);
				const ey = cy + ry * Math.sin(angle);
				return Math.hypot(x - ex, y - ey) <= a.width / 2 + tol || k === 0 && Math.min(rx, ry) <= tol;
			}
			case "text": return inBox(bbox(a), x, y, tol);
			case "texthl": return a.rects.some(([rx, ry, rw, rh]) => inBox({
				x: rx,
				y: ry,
				w: rw,
				h: rh
			}, x, y, tol));
			case "note": return inBox(bbox(a, zoom), x, y, tol);
		}
	}
	/** Topmost mark under the point. */
	function hitTop(marks, x, y, tol, zoom = 1) {
		for (let i = marks.length - 1; i >= 0; i--) if (hitTest(marks[i], x, y, tol, zoom)) return marks[i];
		return null;
	}
	//#endregion
	//#region extension/src/icons.ts
	var ICONS = {
		"mouse-pointer-2": [["path", { "d": "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" }]],
		"pen-line": [["path", { "d": "M13 21h8" }], ["path", { "d": "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" }]],
		"highlighter": [["path", { "d": "m9 11-6 6v3h9l3-3" }], ["path", { "d": "m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" }]],
		"eraser": [["path", { "d": "M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" }], ["path", { "d": "m5.082 11.09 8.828 8.828" }]],
		"type": [
			["path", { "d": "M12 4v16" }],
			["path", { "d": "M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" }],
			["path", { "d": "M9 20h6" }]
		],
		"square": [["rect", {
			"width": "18",
			"height": "18",
			"x": "3",
			"y": "3",
			"rx": "2"
		}]],
		"circle": [["circle", {
			"cx": "12",
			"cy": "12",
			"r": "10"
		}]],
		"slash": [["path", { "d": "M22 2 2 22" }]],
		"move-up-right": [["path", { "d": "M13 5H19V11" }], ["path", { "d": "M19 5L5 19" }]],
		"camera": [["path", { "d": "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" }], ["circle", {
			"cx": "12",
			"cy": "13",
			"r": "3"
		}]],
		"undo-2": [["path", { "d": "M9 14 4 9l5-5" }], ["path", { "d": "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" }]],
		"redo-2": [["path", { "d": "m15 14 5-5-5-5" }], ["path", { "d": "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" }]],
		"x": [["path", { "d": "M18 6 6 18" }], ["path", { "d": "m6 6 12 12" }]],
		"maximize": [
			["path", { "d": "M8 3H5a2 2 0 0 0-2 2v3" }],
			["path", { "d": "M21 8V5a2 2 0 0 0-2-2h-3" }],
			["path", { "d": "M3 16v3a2 2 0 0 0 2 2h3" }],
			["path", { "d": "M16 21h3a2 2 0 0 0 2-2v-3" }]
		],
		"scroll-text": [
			["path", { "d": "M15 12h-5" }],
			["path", { "d": "M15 8h-5" }],
			["path", { "d": "M19 17V5a2 2 0 0 0-2-2H4" }],
			["path", { "d": "M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" }]
		],
		"trash-2": [
			["path", { "d": "M10 11v6" }],
			["path", { "d": "M14 11v6" }],
			["path", { "d": "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }],
			["path", { "d": "M3 6h18" }],
			["path", { "d": "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }]
		],
		"check": [["path", { "d": "M20 6 9 17l-5-5" }]],
		"loader-circle": [["path", { "d": "M21 12a9 9 0 1 1-6.219-8.56" }]],
		"circle-alert": [
			["circle", {
				"cx": "12",
				"cy": "12",
				"r": "10"
			}],
			["line", {
				"x1": "12",
				"x2": "12",
				"y1": "8",
				"y2": "12"
			}],
			["line", {
				"x1": "12",
				"x2": "12.01",
				"y1": "16",
				"y2": "16"
			}]
		]
	};
	//#endregion
	//#region extension/src/overlay-css.ts
	var OVERLAY_CSS = `
:host {
  --surface: #ffffff; --ink: #1f1e1c; --ink-2: #6b6864; --line: #e4e1dc; --fill: #f1efeb; --fill-2: #e8e5e0;
  --accent: #6d4bd6; --accent-soft: #efeafc; --crit: #c92a2a; --good: #2f9e44;
}
@media (prefers-color-scheme: dark) {
  :host {
    --surface: #242322; --ink: #f1efeb; --ink-2: #a5a29d; --line: #3a3835; --fill: #2f2d2b; --fill-2: #3a3835;
    --accent: #b39dff; --accent-soft: #33294f; --crit: #ff8787; --good: #69db7c;
  }
}
* { box-sizing: border-box; }
.surface { position: fixed; overflow: hidden; pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none; }
.surface.off { pointer-events: none; }
.surface.pen, .surface.marker, .surface.shape, .surface.capture { cursor: crosshair; }
.surface.text { cursor: text; }
.surface.eraser { cursor: cell; }
.marks { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
.editor {
  position: absolute; margin: 0; padding: 0; border: 0; resize: none; overflow: hidden; background: transparent; white-space: pre;
  outline: 1.5px dashed var(--accent); outline-offset: 3px; border-radius: 2px; user-select: text; -webkit-user-select: text; cursor: text;
}
.marquee { position: fixed; border: 1.5px solid var(--accent); border-radius: 2px; box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.28); pointer-events: none; }
.dock {
  position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px;
  max-width: calc(100vw - 16px); pointer-events: none; color: var(--ink);
  font: 500 13px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
}
.dock > * { pointer-events: auto; }
.dock.hidden, .toast.hidden { visibility: hidden; }
.bar {
  display: flex; align-items: center; background: var(--surface); border: 1px solid var(--line); max-width: 100%;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.16), 0 1px 2px rgb(0 0 0 / 0.08);
}
.tools { gap: 2px; padding: 5px; border-radius: 16px; }
.styles { gap: 8px; padding: 6px 10px; border-radius: 14px; flex-wrap: wrap; justify-content: center; }
button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: inherit; flex-shrink: 0; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button[disabled] { opacity: 0.35; cursor: default; }
.tool { width: 38px; height: 38px; border-radius: 11px; color: var(--ink-2); }
.tool:hover:not([disabled]) { background: var(--fill); }
.tool[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
.mini { width: 30px; height: 30px; border-radius: 8px; color: var(--ink-2); }
.mini:hover { background: var(--fill); }
.mini[aria-pressed="true"] { background: var(--fill-2); color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--line); }
.dot { display: block; border-radius: 999px; background: currentColor; }
.sep { width: 1px; align-self: stretch; margin: 4px 0; background: var(--line); flex-shrink: 0; }
.swatches, .group { display: flex; align-items: center; gap: 4px; }
.swatch { position: relative; width: 24px; height: 24px; border-radius: 999px; cursor: pointer; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12); }
.swatch[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--accent); }
.swatch.custom { background: conic-gradient(#e03131, #f08c00, #ffd43b, #2f9e44, #1971c2, #7048e8, #e64980, #e03131); overflow: hidden; display: inline-block; }
.swatch.custom input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; margin: 0; padding: 0; border: 0; }
.action { gap: 6px; height: 30px; padding: 0 10px; border-radius: 8px; color: var(--ink-2); white-space: nowrap; }
.action:hover { background: var(--fill); }
.action.primary { background: var(--ink); color: var(--surface); }
.toast { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 12px; white-space: nowrap; color: var(--ink-2); }
.toast .link { color: var(--ink); text-decoration: underline; }
.good { color: var(--good); }
.crit { color: var(--crit); }
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
`;
	//#endregion
	//#region extension/src/overlay.ts
	var SVG = "http://www.w3.org/2000/svg";
	var MIN_MARQUEE = 8;
	var SAVED_MS = 7e3;
	var SHAPE_ICONS = {
		rect: "square",
		ellipse: "circle",
		line: "slash",
		arrow: "move-up-right"
	};
	var SHAPE_LABELS = {
		rect: "Rectángulo",
		ellipse: "Círculo",
		line: "Línea",
		arrow: "Flecha"
	};
	var TOOLS = [
		{
			id: "hand",
			label: "Usar la página",
			key: "V"
		},
		{
			id: "pen",
			label: "Lápiz",
			key: "P"
		},
		{
			id: "marker",
			label: "Resaltador",
			key: "H"
		},
		{
			id: "eraser",
			label: "Borrador",
			key: "E"
		},
		{
			id: "text",
			label: "Texto",
			key: "T"
		},
		{
			id: "shape",
			label: "Formas",
			key: "R"
		},
		{
			id: "capture",
			label: "Captura",
			key: "C"
		}
	];
	var TOOL_ICONS = {
		hand: "mouse-pointer-2",
		pen: "pen-line",
		marker: "highlighter",
		eraser: "eraser",
		text: "type",
		capture: "camera"
	};
	function svg(tag, attrs = {}) {
		const el = document.createElementNS(SVG, tag);
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
		return el;
	}
	function icon(name, size = 19) {
		const root = svg("svg", {
			viewBox: "0 0 24 24",
			width: size,
			height: size,
			fill: "none",
			stroke: "currentColor",
			"stroke-width": 1.75,
			"stroke-linecap": "round",
			"stroke-linejoin": "round"
		});
		for (const [tag, attrs] of ICONS[name] ?? []) root.append(svg(tag, attrs));
		return root;
	}
	function button(className, label, content, onClick, pressed) {
		const b = document.createElement("button");
		b.type = "button";
		b.className = className;
		b.setAttribute("aria-label", label);
		b.title = label;
		if (pressed !== void 0) b.setAttribute("aria-pressed", String(pressed));
		b.append(content);
		b.addEventListener("click", onClick);
		return b;
	}
	/** A mark as SVG, in the page's coordinates. */
	function markNode(a, faded = false, live = false) {
		const opacity = faded ? .25 : 1;
		switch (a.type) {
			case "ink": return svg("path", {
				d: polygonPath(inkOutline(a, !live)),
				fill: a.color,
				opacity
			});
			case "marker": return svg("path", {
				d: linePath(a.points),
				fill: "none",
				stroke: a.color,
				"stroke-width": a.width,
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
				opacity: faded ? .12 : HIGHLIGHT_OPACITY
			});
			case "rect": return svg("rect", {
				x: Math.min(a.x1, a.x2),
				y: Math.min(a.y1, a.y2),
				width: Math.abs(a.x2 - a.x1),
				height: Math.abs(a.y2 - a.y1),
				fill: "none",
				stroke: a.color,
				"stroke-width": a.width,
				"stroke-linejoin": "round",
				opacity
			});
			case "ellipse": return svg("ellipse", {
				cx: (a.x1 + a.x2) / 2,
				cy: (a.y1 + a.y2) / 2,
				rx: Math.abs(a.x2 - a.x1) / 2,
				ry: Math.abs(a.y2 - a.y1) / 2,
				fill: "none",
				stroke: a.color,
				"stroke-width": a.width,
				opacity
			});
			case "line":
			case "arrow": {
				const g = svg("g", {
					fill: "none",
					stroke: a.color,
					"stroke-width": a.width,
					"stroke-linecap": "round",
					"stroke-linejoin": "round",
					opacity
				});
				g.append(svg("line", {
					x1: a.x1,
					y1: a.y1,
					x2: a.x2,
					y2: a.y2
				}));
				if (a.type === "arrow") {
					const [h1, h2] = arrowHead(a.x1, a.y1, a.x2, a.y2, a.width);
					g.append(svg("polyline", { points: `${h1.join(",")} ${a.x2},${a.y2} ${h2.join(",")}` }));
				}
				return g;
			}
			case "text": {
				const t = svg("text", {
					fill: a.color,
					"font-size": a.size,
					"font-family": TEXT_FONT,
					opacity
				});
				t.style.whiteSpace = "pre";
				textLines(a.text).forEach((line, i) => {
					const span = svg("tspan", {
						x: a.x,
						y: a.y + a.size * (TEXT_BASELINE + i * TEXT_LINE)
					});
					span.textContent = line || " ";
					t.append(span);
				});
				return t;
			}
			default: return svg("g");
		}
	}
	function start() {
		const shared = globalThis;
		if (shared.__venaOverlay) return;
		shared.__venaOverlay = true;
		document.querySelector("vena-overlay")?.remove();
		const scroller = shared.__venaCapture?.element?.() ?? null;
		const root = () => document.scrollingElement ?? document.documentElement;
		const host = document.createElement("vena-overlay");
		for (const [k, v] of Object.entries({
			all: "initial",
			display: "block",
			position: "fixed",
			inset: "0",
			"z-index": "2147483647",
			"pointer-events": "none"
		})) host.style.setProperty(k, v, "important");
		const shadow = host.attachShadow({ mode: "open" });
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(OVERLAY_CSS);
		shadow.adoptedStyleSheets = [sheet];
		const surface = document.createElement("div");
		const marksSvg = svg("svg");
		marksSvg.setAttribute("class", "marks");
		const layer = svg("g");
		const marksGroup = svg("g");
		const liveGroup = svg("g");
		layer.append(marksGroup, liveGroup);
		marksSvg.append(layer);
		surface.append(marksSvg);
		const dock = document.createElement("div");
		dock.className = "dock";
		const toastEl = document.createElement("div");
		toastEl.className = "bar toast hidden";
		const stylesEl = document.createElement("div");
		const toolsEl = document.createElement("div");
		toolsEl.className = "bar tools";
		toolsEl.setAttribute("role", "toolbar");
		toolsEl.setAttribute("aria-label", "Herramientas de dibujo");
		dock.append(toastEl, stylesEl, toolsEl);
		shadow.append(surface, dock);
		document.documentElement.append(host);
		let tool = "pen";
		let shape = "rect";
		let styles = DEFAULT_STYLES;
		let marks = [];
		let undoStack = [];
		let redoStack = [];
		let busy = false;
		let confirmingClose = false;
		let saving = 0;
		let toastTimer = null;
		chrome.storage?.local.get(["overlayStyles", "overlayShape"]).then((saved) => {
			if (saved.overlayStyles) styles = {
				...styles,
				...saved.overlayStyles
			};
			if (saved.overlayShape) shape = saved.overlayShape;
			renderDock();
		}).catch(() => void 0);
		const remember = () => void chrome.storage?.local.set({
			overlayStyles: styles,
			overlayShape: shape
		}).catch(() => void 0);
		const area = () => {
			if (!scroller) return {
				left: 0,
				top: 0,
				width: root().clientWidth,
				height: root().clientHeight
			};
			const r = scroller.getBoundingClientRect();
			const left = Math.max(0, r.left + scroller.clientLeft);
			const top = Math.max(0, r.top + scroller.clientTop);
			return {
				left,
				top,
				width: Math.min(innerWidth, left + scroller.clientWidth) - left,
				height: Math.min(innerHeight, top + scroller.clientHeight) - top
			};
		};
		const scrolled = () => scroller ? [scroller.scrollLeft, scroller.scrollTop] : [scrollX, scrollY];
		const toPage = (clientX, clientY) => {
			const r = area();
			const [sx, sy] = scrolled();
			return [clientX - r.left + sx, clientY - r.top + sy];
		};
		const place = () => {
			const r = area();
			surface.style.left = `${r.left}px`;
			surface.style.top = `${r.top}px`;
			surface.style.width = `${r.width}px`;
			surface.style.height = `${r.height}px`;
			const [sx, sy] = scrolled();
			layer.setAttribute("transform", `translate(${-sx} ${-sy})`);
		};
		const scrollSource = scroller ?? window;
		const renderMarks = (fading) => marksGroup.replaceChildren(...marks.map((m) => markNode(m, fading?.has(m.id))));
		const commit = (next) => {
			undoStack.push(marks);
			redoStack = [];
			marks = next;
			renderMarks();
			renderDock();
		};
		const undo = () => {
			const prev = undoStack.pop();
			if (!prev) return;
			redoStack.push(marks);
			marks = prev;
			renderMarks();
			renderDock();
		};
		const redo = () => {
			const next = redoStack.pop();
			if (!next) return;
			undoStack.push(marks);
			marks = next;
			renderMarks();
			renderDock();
		};
		const setTool = (t) => {
			closeEditor();
			cancelMarquee();
			tool = t;
			surface.className = `surface ${t === "hand" ? "off" : t}`;
			confirmingClose = false;
			renderDock();
		};
		const setStyle = (key, patch) => {
			styles = {
				...styles,
				[key]: {
					...styles[key],
					...patch
				}
			};
			remember();
			renderDock();
		};
		const sep = () => {
			const s = document.createElement("span");
			s.className = "sep";
			return s;
		};
		const swatches = (colors, value, onChange, custom = false) => {
			const group = document.createElement("div");
			group.className = "swatches";
			group.setAttribute("role", "group");
			group.setAttribute("aria-label", "Color");
			for (const c of colors) {
				const b = button("swatch", `Color ${c}`, "", () => onChange(c), value === c);
				b.style.background = c;
				group.append(b);
			}
			if (custom) {
				const label = document.createElement("label");
				label.className = "swatch custom";
				label.title = "Otro color";
				if (!colors.includes(value)) {
					label.style.background = value;
					label.setAttribute("aria-pressed", "true");
				}
				const input = document.createElement("input");
				input.type = "color";
				input.value = value;
				input.setAttribute("aria-label", "Otro color");
				input.addEventListener("change", () => onChange(input.value));
				label.append(input);
				group.append(label);
			}
			return group;
		};
		const widths = (list, value, onChange) => {
			const group = document.createElement("div");
			group.className = "group";
			group.setAttribute("role", "group");
			group.setAttribute("aria-label", "Grosor");
			const max = Math.max(...list);
			for (const w of list) {
				const dot = document.createElement("span");
				dot.className = "dot";
				dot.style.width = dot.style.height = `${4 + w / max * 14}px`;
				group.append(button("mini", `Grosor ${w}`, dot, () => onChange(w), value === w));
			}
			return group;
		};
		const renderStyles = () => {
			stylesEl.replaceChildren();
			stylesEl.className = "bar styles";
			if (confirmingClose) {
				const text = document.createElement("span");
				text.textContent = "¿Cerrar y borrar los trazos?";
				stylesEl.append(text, button("action", "Seguir dibujando", "Seguir", () => {
					confirmingClose = false;
					renderDock();
				}), button("action primary", "Cerrar y borrar", "Cerrar", stop));
				return;
			}
			switch (tool) {
				case "pen":
					stylesEl.append(swatches(INK_COLORS, styles.pen.color, (color) => setStyle("pen", { color }), true), sep(), widths(PEN_WIDTHS, styles.pen.width, (width) => setStyle("pen", { width })));
					return;
				case "marker":
					stylesEl.append(swatches(HIGHLIGHT_COLORS, styles.marker.color, (color) => setStyle("marker", { color })), sep(), widths(MARKER_WIDTHS, styles.marker.width, (width) => setStyle("marker", { width })));
					return;
				case "shape": {
					const kinds = document.createElement("div");
					kinds.className = "group";
					for (const k of Object.keys(SHAPE_ICONS)) kinds.append(button("mini", SHAPE_LABELS[k], icon(SHAPE_ICONS[k], 16), () => {
						shape = k;
						remember();
						renderDock();
					}, shape === k));
					stylesEl.append(kinds, sep(), swatches(INK_COLORS, styles.shape.color, (color) => setStyle("shape", { color }), true), sep(), widths(SHAPE_WIDTHS, styles.shape.width, (width) => setStyle("shape", { width })));
					return;
				}
				case "text": {
					const sizes = document.createElement("div");
					sizes.className = "group";
					TEXT_SIZES.forEach((s, i) => {
						const letter = document.createElement("span");
						letter.textContent = "A";
						letter.style.fontSize = `${11 + i * 3}px`;
						letter.style.fontWeight = "600";
						sizes.append(button("mini", `Tamaño ${s}`, letter, () => setStyle("text", { size: s }), styles.text.size === s));
					});
					stylesEl.append(swatches(INK_COLORS, styles.text.color, (color) => setStyle("text", { color }), true), sep(), sizes);
					return;
				}
				case "eraser": {
					const clear = button("action", "Borrar todo", "Borrar todo", () => commit([]));
					clear.prepend(icon("trash-2", 15));
					clear.disabled = !marks.length;
					stylesEl.append(clear);
					return;
				}
				case "capture": {
					const screen = button("action", "Capturar la pantalla", "Pantalla", () => requestShot("visible"));
					screen.prepend(icon("maximize", 15));
					const whole = button("action", "Capturar la página completa", "Completo", () => requestShot("page"));
					whole.prepend(icon("scroll-text", 15));
					stylesEl.append(screen, whole);
					return;
				}
				default: stylesEl.className = "hidden-bar";
			}
		};
		const renderDock = () => {
			renderStyles();
			const buttons = TOOLS.map((t) => button("tool", `${t.label} · ${t.key}`, icon(t.id === "shape" ? SHAPE_ICONS[shape] : TOOL_ICONS[t.id]), () => setTool(t.id), tool === t.id));
			const undoBtn = button("tool", "Deshacer", icon("undo-2"), undo);
			undoBtn.disabled = !undoStack.length;
			const redoBtn = button("tool", "Rehacer", icon("redo-2"), redo);
			redoBtn.disabled = !redoStack.length;
			toolsEl.replaceChildren(...buttons, sep(), undoBtn, redoBtn, sep(), button("tool", "Cerrar", icon("x"), requestClose));
		};
		const showToast = (content, ms) => {
			if (toastTimer) clearTimeout(toastTimer);
			toastEl.replaceChildren(...content);
			toastEl.classList.remove("hidden");
			toastEl.hidden = false;
			if (ms) toastTimer = setTimeout(() => {
				toastEl.classList.add("hidden");
				toastEl.hidden = true;
			}, ms);
		};
		const hideToast = () => {
			toastEl.classList.add("hidden");
			toastEl.hidden = true;
		};
		hideToast();
		const onStatus = ({ status, message }) => {
			if (status === "idle") {
				if (!saving) hideToast();
				return;
			}
			if (status === "saving") {
				saving += 1;
				const spin = icon("loader-circle", 15);
				spin.setAttribute("class", "spin");
				showToast([spin, "Guardando en el OS…"]);
				return;
			}
			if (status === "saved") {
				saving = Math.max(0, saving - 1);
				if (saving) return;
				const ok = icon("check", 15);
				ok.setAttribute("class", "good");
				const link = button("link", "Ver capturas", "Ver capturas", () => void chrome.runtime.sendMessage({ type: "open-captures" }));
				showToast([
					ok,
					"Guardada",
					link
				], SAVED_MS);
				return;
			}
			saving = Math.max(0, saving - 1);
			const alert = icon("circle-alert", 15);
			alert.setAttribute("class", "crit");
			showToast([alert, message ?? "No se pudo guardar."], SAVED_MS * 2);
		};
		let editor = null;
		let finishEditor = null;
		const closeEditor = () => finishEditor?.();
		const openEditor = (mark, isNew) => {
			const [sx, sy] = scrolled();
			const area = document.createElement("textarea");
			area.className = "editor";
			area.value = mark.text;
			area.setAttribute("aria-label", "Texto");
			area.spellcheck = true;
			area.style.left = `${mark.x - sx}px`;
			area.style.top = `${mark.y - sy}px`;
			area.style.fontSize = `${mark.size}px`;
			area.style.lineHeight = String(TEXT_LINE);
			area.style.fontFamily = TEXT_FONT;
			area.style.color = mark.color;
			const fit = () => {
				const lines = textLines(area.value || " ");
				area.style.width = `${Math.max(mark.size * 2, ...lines.map((l) => textWidth(l, mark.size))) + mark.size}px`;
				area.style.height = `${lines.length * mark.size * TEXT_LINE}px`;
			};
			fit();
			area.addEventListener("input", fit);
			let done = false;
			finishEditor = () => {
				if (done) return;
				done = true;
				const text = area.value;
				area.remove();
				editor = null;
				finishEditor = null;
				const others = marks.filter((m) => m.id !== mark.id);
				if (text.trim()) commit([...others, {
					...mark,
					text
				}]);
				else if (!isNew) commit(others);
				else renderMarks();
			};
			area.addEventListener("blur", () => finishEditor?.());
			area.addEventListener("pointerdown", (e) => e.stopPropagation());
			area.addEventListener("keydown", (e) => {
				e.stopPropagation();
				if (e.key === "Escape" || e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
					e.preventDefault();
					area.blur();
				}
			});
			for (const type of [
				"keyup",
				"keypress",
				"input"
			]) area.addEventListener(type, (e) => e.stopPropagation());
			if (!isNew) marksGroup.replaceChildren(...marks.filter((m) => m.id !== mark.id).map((m) => markNode(m)));
			surface.append(area);
			editor = area;
			area.focus({ preventScroll: true });
			area.setSelectionRange(area.value.length, area.value.length);
		};
		let drag = null;
		let marqueeEl = null;
		const tolerance = (e) => e.pointerType === "touch" ? 14 : 7;
		const showMarquee = (d) => {
			if (!marqueeEl) {
				marqueeEl = document.createElement("div");
				marqueeEl.className = "marquee";
				shadow.append(marqueeEl);
			}
			marqueeEl.style.left = `${Math.min(d.x0, d.x1)}px`;
			marqueeEl.style.top = `${Math.min(d.y0, d.y1)}px`;
			marqueeEl.style.width = `${Math.abs(d.x1 - d.x0)}px`;
			marqueeEl.style.height = `${Math.abs(d.y1 - d.y0)}px`;
		};
		function cancelMarquee() {
			marqueeEl?.remove();
			marqueeEl = null;
			if (drag?.kind === "marquee") drag = null;
		}
		surface.addEventListener("pointerdown", (e) => {
			if (busy || drag || e.pointerType === "mouse" && e.button !== 0) return;
			if (editor) {
				closeEditor();
				return;
			}
			e.preventDefault();
			try {
				surface.setPointerCapture(e.pointerId);
			} catch {}
			const [x, y] = toPage(e.clientX, e.clientY);
			const point = [
				x,
				y,
				e.pointerType === "pen" ? e.pressure || .5 : .5
			];
			const id = uid();
			switch (tool) {
				case "pen":
					drag = {
						kind: "draw",
						pointer: e.pointerId,
						mark: {
							id,
							type: "ink",
							color: styles.pen.color,
							width: styles.pen.width,
							points: [point],
							pressure: e.pointerType === "pen"
						}
					};
					break;
				case "marker":
					drag = {
						kind: "draw",
						pointer: e.pointerId,
						mark: {
							id,
							type: "marker",
							color: styles.marker.color,
							width: styles.marker.width,
							points: [point]
						}
					};
					break;
				case "shape":
					drag = {
						kind: "draw",
						pointer: e.pointerId,
						mark: {
							id,
							type: shape,
							color: styles.shape.color,
							width: styles.shape.width,
							x1: x,
							y1: y,
							x2: x,
							y2: y
						}
					};
					break;
				case "eraser":
					drag = {
						kind: "erase",
						pointer: e.pointerId,
						ids: new Set(marks.filter((m) => hitTest(m, x, y, tolerance(e))).map((m) => m.id)),
						last: [x, y]
					};
					renderMarks(drag.ids);
					break;
				case "capture":
					drag = {
						kind: "marquee",
						pointer: e.pointerId,
						x0: e.clientX,
						y0: e.clientY,
						x1: e.clientX,
						y1: e.clientY
					};
					showMarquee(drag);
					break;
				case "text": {
					const hit = hitTop(marks.filter((m) => m.type === "text"), x, y, tolerance(e));
					if (hit?.type === "text") openEditor(hit, false);
					else openEditor({
						id,
						type: "text",
						color: styles.text.color,
						size: styles.text.size,
						x,
						y: y - styles.text.size * .62,
						text: ""
					}, true);
					break;
				}
			}
		});
		surface.addEventListener("pointermove", (e) => {
			const d = drag;
			if (!d || d.pointer !== e.pointerId) return;
			if (d.kind === "marquee") {
				d.x1 = e.clientX;
				d.y1 = e.clientY;
				showMarquee(d);
				return;
			}
			const [x, y] = toPage(e.clientX, e.clientY);
			if (d.kind === "erase") {
				const tol = tolerance(e);
				const mid = [(x + d.last[0]) / 2, (y + d.last[1]) / 2];
				for (const m of marks) if (hitTest(m, x, y, tol) || hitTest(m, mid[0], mid[1], tol)) d.ids.add(m.id);
				d.last = [x, y];
				renderMarks(d.ids);
				return;
			}
			const m = d.mark;
			if (m.type === "ink" || m.type === "marker") {
				const events = e.getCoalescedEvents?.() ?? [];
				const pts = (events.length ? events : [e]).map((ev) => {
					const [px, py] = toPage(ev.clientX, ev.clientY);
					return [
						px,
						py,
						ev.pointerType === "pen" ? ev.pressure || .5 : .5
					];
				});
				d.mark = {
					...m,
					points: [...m.points, ...pts]
				};
			} else if (m.type === "rect" || m.type === "ellipse" || m.type === "line" || m.type === "arrow") {
				const [x2, y2] = e.shiftKey ? constrainShape(m.type, m.x1, m.y1, x, y) : [x, y];
				d.mark = {
					...m,
					x2,
					y2
				};
			}
			liveGroup.replaceChildren(markNode(d.mark, false, true));
		});
		surface.addEventListener("pointerup", (e) => {
			const d = drag;
			if (!d || d.pointer !== e.pointerId) return;
			drag = null;
			liveGroup.replaceChildren();
			if (d.kind === "marquee") {
				cancelMarquee();
				const r = area();
				const left = Math.max(r.left, Math.min(d.x0, d.x1));
				const top = Math.max(r.top, Math.min(d.y0, d.y1));
				const right = Math.min(r.left + r.width, Math.max(d.x0, d.x1));
				const bottom = Math.min(r.top + r.height, Math.max(d.y0, d.y1));
				if (right - left >= MIN_MARQUEE && bottom - top >= MIN_MARQUEE) requestShot("region", {
					left,
					top,
					width: right - left,
					height: bottom - top
				});
				return;
			}
			if (d.kind === "erase") {
				if (d.ids.size) commit(marks.filter((m) => !d.ids.has(m.id)));
				else renderMarks();
				return;
			}
			const m = d.mark;
			if (m.type === "ink" || m.type === "marker") return commit([...marks, {
				...m,
				points: simplify(m.points)
			}]);
			if (m.type === "rect" || m.type === "ellipse" || m.type === "line" || m.type === "arrow") {
				if (Math.abs(m.x2 - m.x1) < 4 && Math.abs(m.y2 - m.y1) < 4) return;
				commit([...marks, m]);
			}
		});
		surface.addEventListener("pointercancel", () => {
			drag = null;
			liveGroup.replaceChildren();
			cancelMarquee();
			renderMarks();
		});
		surface.addEventListener("wheel", (e) => {
			if (e.ctrlKey) return;
			e.preventDefault();
			(scroller ?? root()).scrollBy({
				left: e.deltaX,
				top: e.deltaY,
				behavior: "instant"
			});
		}, { passive: false });
		function requestShot(mode, box) {
			if (busy) return;
			closeEditor();
			busy = true;
			surface.classList.add("off");
			chrome.runtime.sendMessage({
				type: "shot",
				mode,
				box,
				kind: scroller ? "element" : "document"
			}).catch(() => {
				finishShot();
				onStatus({
					status: "error",
					message: "La extensión se actualizó. Recarga la página."
				});
			});
		}
		const hideForPhoto = () => new Promise((resolve) => {
			dock.classList.add("hidden");
			toastEl.classList.add("hidden");
			cancelMarquee();
			const done = () => setTimeout(resolve, 40);
			const timer = setTimeout(done, 200);
			requestAnimationFrame(() => requestAnimationFrame(() => {
				clearTimeout(timer);
				done();
			}));
		});
		function finishShot() {
			busy = false;
			dock.classList.remove("hidden");
			surface.className = `surface ${tool === "hand" ? "off" : tool}`;
		}
		const onKey = (e) => {
			const handled = () => {
				e.preventDefault();
				e.stopPropagation();
			};
			if (busy) {
				if (e.key === "Escape") {
					handled();
					chrome.runtime.sendMessage({ type: "cancel" });
				}
				return;
			}
			if (tool === "hand") return;
			const t = e.composedPath()[0];
			if (t?.isContentEditable || [
				"INPUT",
				"TEXTAREA",
				"SELECT"
			].includes(t?.tagName)) return;
			const k = e.key.toLowerCase();
			if ((e.metaKey || e.ctrlKey) && k === "z") {
				handled();
				if (e.shiftKey) redo();
				else undo();
				return;
			}
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.key === "Escape") {
				handled();
				if (drag?.kind === "marquee") cancelMarquee();
				else setTool("hand");
				return;
			}
			const match = TOOLS.find((x) => x.key.toLowerCase() === k);
			if (match) {
				handled();
				setTool(match.id);
			}
		};
		const onMessage = (msg, _sender, respond) => {
			if (msg.type === "prepare") {
				hideForPhoto().then(() => respond(true));
				return true;
			}
			if (msg.type === "restore") finishShot();
			else if (msg.type === "status") onStatus(msg);
			else if (msg.type === "close") requestClose();
			return false;
		};
		function requestClose() {
			if (!marks.length) return stop();
			confirmingClose = true;
			renderDock();
		}
		function stop() {
			closeEditor();
			chrome.runtime.onMessage.removeListener(onMessage);
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("resize", place);
			scrollSource.removeEventListener("scroll", place);
			host.remove();
			delete shared.__venaOverlay;
		}
		chrome.runtime.onMessage.addListener(onMessage);
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("resize", place);
		scrollSource.addEventListener("scroll", place, { passive: true });
		surface.className = "surface pen";
		place();
		renderDock();
	}
	start();
	//#endregion
})();
