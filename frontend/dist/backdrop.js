/* Animated backdrop for the auth page: synthetic crypto price lines that drift
   leftward, point by point, as if the last six hours were still being drawn.
   The data is invented — this is atmosphere, not a quote. */
// 72 points at 5 minutes each = the 6 hours the lines claim to show.
const POINTS = 72;
const STEP_MS = 850;
let frame = 0;
let running = false;
let lastStep = 0;
let series = [];
function walk(previous, volatility) {
    const drift = (Math.random() - 0.5) * volatility;
    const reversion = (0.5 - previous) * 0.03;
    return Math.min(0.95, Math.max(0.05, previous + drift + reversion));
}
function seed(volatility) {
    const values = [0.5];
    for (let i = 1; i < POINTS + 2; i++) {
        values.push(walk(values[i - 1], volatility));
    }
    return values;
}
function buildSeries() {
    return [
        { values: seed(0.09), band: [0.08, 0.52], opacity: 0.55, width: 2, fill: true, volatility: 0.09 },
        { values: seed(0.06), band: [0.38, 0.74], opacity: 0.3, width: 1.5, fill: false, volatility: 0.06 },
        { values: seed(0.04), band: [0.62, 0.94], opacity: 0.16, width: 1.25, fill: false, volatility: 0.04 },
    ];
}
/** Catmull-Rom through the points, expressed as beziers, so the line curves
    instead of kinking at every sample. */
function tracePath(ctx, points) {
    var _a, _b;
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = (_a = points[i - 1]) !== null && _a !== void 0 ? _a : points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = (_b = points[i + 2]) !== null && _b !== void 0 ? _b : p2;
        ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
    }
}
function accentColor() {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    return value || "#00E17B";
}
function toRgba(hex, alpha) {
    const match = /^#?([\da-f]{6})$/i.exec(hex.trim());
    if (!match)
        return hex;
    const int = parseInt(match[1], 16);
    return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}
function draw(canvas, ctx, progress) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const accent = accentColor();
    ctx.clearRect(0, 0, width, height);
    const spacing = width / (POINTS - 1);
    const shift = progress * spacing;
    for (const line of series) {
        const [top, bottom] = line.band;
        const points = line.values.map((value, index) => ({
            x: index * spacing - shift - spacing,
            y: height * (top + (1 - value) * (bottom - top)),
        }));
        if (line.fill) {
            ctx.beginPath();
            tracePath(ctx, points);
            ctx.lineTo(points[points.length - 1].x, height);
            ctx.lineTo(points[0].x, height);
            ctx.closePath();
            const gradient = ctx.createLinearGradient(0, height * top, 0, height);
            gradient.addColorStop(0, toRgba(accent, 0.14));
            gradient.addColorStop(1, toRgba(accent, 0));
            ctx.fillStyle = gradient;
            ctx.fill();
        }
        ctx.beginPath();
        tracePath(ctx, points);
        ctx.strokeStyle = toRgba(accent, line.opacity);
        ctx.lineWidth = line.width;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
    }
}
function resize(canvas, ctx) {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
export function startBackdrop(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx || running)
        return;
    series = buildSeries();
    resize(canvas, ctx);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onResize = () => {
        resize(canvas, ctx);
        if (reduced.matches)
            draw(canvas, ctx, 0);
    };
    window.addEventListener("resize", onResize);
    if (reduced.matches) {
        draw(canvas, ctx, 0);
        return;
    }
    running = true;
    lastStep = performance.now();
    const tick = (now) => {
        if (!running)
            return;
        let progress = (now - lastStep) / STEP_MS;
        while (progress >= 1) {
            // One step older: drop the leftmost sample, print a new one on the right.
            for (const line of series) {
                line.values.shift();
                line.values.push(walk(line.values[line.values.length - 1], line.volatility));
            }
            lastStep += STEP_MS;
            progress = (now - lastStep) / STEP_MS;
        }
        draw(canvas, ctx, progress);
        frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
}
export function stopBackdrop() {
    running = false;
    cancelAnimationFrame(frame);
}
