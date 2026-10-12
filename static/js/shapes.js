const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function rng(seed = 1) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function gauss(r) {
    let u = 0;
    while (!u) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r());
}

function unitVector(r) {
    const x = gauss(r), y = gauss(r), z = gauss(r);
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
}

function bezier(a, c, b, t) {
    return a.map((v, j) => (1 - t) * (1 - t) * v + 2 * (1 - t) * t * c[j] + t * t * b[j]);
}

function writer(out, kind, channel, n, transform = (p) => p) {
    let i = 0;
    return {
        get full() {
            return i >= n;
        },
        put(x, y, z, k) {
            if (i >= n) return;
            const [px, py, pz] = transform([x, y, z]);
            out[i * 3] = px;
            out[i * 3 + 1] = py;
            out[i * 3 + 2] = pz;
            kind[i * 3 + channel] = k;
            i++;
        },
    };
}

function alongPath(path, count, r, jitter, put) {
    const cum = [0];
    for (let i = 1; i < path.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(...path[i].map((v, j) => v - path[i - 1][j])));
    }
    const total = cum[cum.length - 1];
    for (let k = 0; k < count; k++) {
        const s = r() * total;
        let lo = 0, hi = path.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (cum[mid] < s) lo = mid;
            else hi = mid;
        }
        const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
        const p = path[lo].map((v, j) => v + (path[hi][j] - v) * t);
        const dir = path[hi].map((v, j) => v - path[lo][j]);
        put(p[0] + gauss(r) * jitter, p[1] + gauss(r) * jitter, p[2] + gauss(r) * jitter, lo, dir);
    }
}

function nanoparticle(out, kind, n, r) {
    const w = writer(out, kind, 0, n);
    const headPoints = Math.max(4, Math.round((9 * n) / 12000));
    const tailPoints = Math.max(3, Math.round((6 * n) / 12000));
    const rows = [-0.24, -0.08, 0.08, 0.24];
    const leaflets = [
        { radius: 1.55, count: 48, inward: true, head: 0 },
        { radius: 1.05, count: 34, inward: false, head: 1 },
    ];
    for (const leaf of leaflets) {
        rows.forEach((z, row) => {
            for (let i = 0; i < leaf.count; i++) {
                const th = ((i + (row % 2) * 0.5) / leaf.count) * TAU;
                const d = [Math.cos(th), Math.sin(th)];
                const t = [-d[1], d[0]];
                const c = [d[0] * leaf.radius, d[1] * leaf.radius];
                for (let k = 0; k < headPoints; k++) w.put(c[0] + gauss(r) * 0.035, c[1] + gauss(r) * 0.035, z + gauss(r) * 0.035, leaf.head);
                const dir = leaf.inward ? -1 : 1;
                for (const offset of [-0.035, 0.035]) {
                    for (let k = 0; k < tailPoints; k++) {
                        const along = 0.08 + (k / (tailPoints - 1)) * 0.18;
                        w.put(c[0] + d[0] * along * dir + t[0] * offset, c[1] + d[1] * along * dir + t[1] * offset, z, 2);
                    }
                }
            }
        });
    }

    for (let m = 0; m < 9; m++) {
        const th = r() * TAU;
        const rad = 0.2 + r() * 0.55;
        const z = (r() - 0.5) * 0.3;
        for (let k = 0; k < Math.floor(n * 0.008); k++) {
            w.put(Math.cos(th) * rad + gauss(r) * 0.05, Math.sin(th) * rad + gauss(r) * 0.05, z + gauss(r) * 0.05, 4);
        }
    }

    const strands = [];
    for (let s = 0; s < 3; s++) {
        let p = unitVector(r).map((v, j) => v * 0.4 * r() * (j === 2 ? 0.3 : 1));
        let d = unitVector(r);
        const path = [p];
        for (let k = 0; k < 220; k++) {
            const nudge = unitVector(r);
            d = d.map((v, j) => v + nudge[j] * 0.35);
            const l = Math.hypot(p[0], p[1]);
            if (l > 0.66) d = [d[0] - (p[0] / l) * 0.5, d[1] - (p[1] / l) * 0.5, d[2]];
            if (Math.abs(p[2]) > 0.16) d[2] -= Math.sign(p[2]) * 0.5;
            const dl = Math.hypot(...d);
            d = d.map((v) => v / dl);
            p = p.map((v, j) => v + d[j] * 0.025);
            path.push(p);
        }
        strands.push(path);
    }
    for (let s = 0; !w.full; s = (s + 1) % strands.length) alongPath(strands[s], 40, r, 0.02, (x, y, z) => w.put(x, y, z, 3));
}

function protein(out, kind, n, r) {
    const w = writer(out, kind, 1, n);
    const pitch = 0.54, radius = 0.23, half = 1.5, side = 0.55;
    const corners = [[-side, -side], [side, -side], [side, side], [-side, side]];
    const path = [];
    const conf = [];
    const push = (p, c) => {
        path.push(p);
        conf.push(c);
    };
    const helixPoint = (h, y) => {
        const phi = (y / pitch) * TAU + h;
        return [corners[h][0] + radius * Math.sin(phi), y, corners[h][1] + radius * Math.cos(phi)];
    };

    const start = helixPoint(0, -half);
    const nTerm = [start[0] - 0.7, -half - 0.45, start[2] + 0.35];
    for (let s = 0; s < 40; s++) push(bezier(nTerm, [start[0] - 0.1, -half - 0.7, start[2] - 0.3], start, s / 40), s < 20 ? 3 : 2);

    for (let h = 0; h < 4; h++) {
        const up = h % 2 === 0;
        for (let s = 0; s <= 300; s++) {
            const f = s / 300;
            push(helixPoint(h, up ? -half + 2 * half * f : half - 2 * half * f), f < 0.1 || f > 0.9 ? 1 : 0);
        }
        if (h < 3) {
            const a = path[path.length - 1];
            const b = helixPoint(h + 1, up ? half : -half);
            const mid = a.map((v, j) => (v + b[j]) / 2);
            const ctrl = [mid[0] * 1.6, mid[1] + (up ? 0.55 : -0.55), mid[2] * 1.6];
            for (let s = 1; s < 50; s++) push(bezier(a, ctrl, b, s / 50), 2);
        }
    }

    const end = path[path.length - 1];
    const cTerm = [end[0] - 0.75, -half - 0.35, end[2] + 0.55];
    for (let s = 1; s <= 40; s++) push(bezier(end, [end[0] + 0.1, -half - 0.75, end[2] + 0.4], cTerm, s / 40), s < 20 ? 2 : 3);

    const tube = 0.07;
    alongPath(path, n, r, 0, (x, y, z, lo, dir) => {
        const dl = Math.hypot(...dir) || 1;
        const t = dir.map((v) => v / dl);
        const ref = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        let u = [t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]];
        const ul = Math.hypot(...u);
        u = u.map((v) => v / ul);
        const v = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
        const th = r() * TAU;
        const rad = tube + gauss(r) * 0.006;
        w.put(
            x + rad * (Math.cos(th) * u[0] + Math.sin(th) * v[0]),
            y + rad * (Math.cos(th) * u[1] + Math.sin(th) * v[1]),
            z + rad * (Math.cos(th) * u[2] + Math.sin(th) * v[2]),
            conf[lo]
        );
    });
}

function network(out, kind, n, r) {
    const w = writer(out, kind, 2, n);
    const layers = [
        { size: 4, radius: 0.75 },
        { size: 6, radius: 1.15 },
        { size: 3, radius: 0.65 },
    ];
    const gapX = 1.5, nodeR = 0.19;
    const nodes = layers.map(({ size, radius }, l) =>
        Array.from({ length: size }, (_, i) => {
            const th = (i / size) * TAU + (size === 4 ? Math.PI / 4 : Math.PI / 2);
            return [(l - (layers.length - 1) / 2) * gapX, radius * Math.sin(th), radius * Math.cos(th)];
        })
    );
    const layerKind = (l) => (l === 0 ? 0 : l === layers.length - 1 ? 2 : 1);
    const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

    const edges = [];
    for (let l = 0; l < layers.length - 1; l++) for (const a of nodes[l]) for (const b of nodes[l + 1]) edges.push([a, b]);
    const wireLength = edges.reduce((sum, [a, b]) => sum + dist(a, b) - 2 * nodeR, 0);
    const spacing = Math.max(0.04, wireLength / (n * 0.3));
    let wirePoints = 0;
    for (const [a, b] of edges) {
        const len = dist(a, b);
        for (let d = nodeR + spacing / 2; d < len - nodeR; d += spacing) {
            const t = d / len;
            w.put(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 3);
            wirePoints++;
        }
    }

    const allNodes = nodes.flatMap((layer, l) => layer.map((c) => ({ c, k: layerKind(l) })));
    const perNode = Math.ceil((n - wirePoints) / allNodes.length);
    for (const { c, k } of allNodes) {
        for (let i = 0; i < perNode; i++) {
            const y = 1 - (2 * (i + 0.5)) / perNode;
            const ring = Math.sqrt(1 - y * y);
            w.put(c[0] + nodeR * ring * Math.cos(i * GOLDEN), c[1] + nodeR * y, c[2] + nodeR * ring * Math.sin(i * GOLDEN), k);
        }
    }
}

function centre(out, n) {
    for (let j = 0; j < 3; j++) {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < n; i++) {
            lo = Math.min(lo, out[i * 3 + j]);
            hi = Math.max(hi, out[i * 3 + j]);
        }
        const mid = (lo + hi) / 2;
        for (let i = 0; i < n; i++) out[i * 3 + j] -= mid;
    }
}

function dust(out, n, r) {
    for (let i = 0; i < n; i++) {
        out[i * 3] = (r() - 0.5) * 18;
        out[i * 3 + 1] = (r() - 0.5) * 11;
        out[i * 3 + 2] = -6 + r() * 7;
    }
}

export function buildShapes(n, seed = 29) {
    const r = rng(seed);
    const shapes = {
        nanoparticle: new Float32Array(n * 3),
        protein: new Float32Array(n * 3),
        network: new Float32Array(n * 3),
        dust: new Float32Array(n * 3),
        kind: new Float32Array(n * 3),
        rand: new Float32Array(n * 4),
    };
    nanoparticle(shapes.nanoparticle, shapes.kind, n, r);
    protein(shapes.protein, shapes.kind, n, r);
    network(shapes.network, shapes.kind, n, r);
    [shapes.nanoparticle, shapes.protein, shapes.network].forEach((shape) => centre(shape, n));
    dust(shapes.dust, n, r);
    for (let i = 0; i < n * 4; i++) shapes.rand[i] = r();
    return shapes;
}
