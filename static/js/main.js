const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SHAPE_COUNT = 3;

function whileVisible(el, play, rest) {
    let token = 0;
    rest();
    if (reduced) return;
    new IntersectionObserver(
        ([entry]) => {
            const my = ++token;
            if (!entry.isIntersecting) return rest();
            (async () => {
                while (my === token) await play(() => my !== token);
            })();
        },
        { threshold: 0.35 }
    ).observe(el);
}

async function startHero() {
    let field = null;
    try {
        const { createDots } = await import('./dots.js');
        field = createDots($('[data-hero-dots]'), { count: small ? 6000 : 12000, shape: 0, fill: 0.84, size: small ? 22 : 26, reduced });
    } catch (err) {
        console.warn('Dot field unavailable, continuing without it.', err);
    }
    if (reduced) return;

    let step = 0;
    let onScreen = true;
    new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting)).observe($('.stage'));
    setInterval(() => {
        if (!onScreen || document.hidden) return;
        step = (step + 1) % SHAPE_COUNT;
        field?.show(step);
    }, 5000);
}

function epcrDemo() {
    const demo = $('[data-epcr-demo]');
    const complaint = $('[data-epcr-field]', demo);
    const type = $('[data-epcr-type]', demo);
    const spo2 = $('[data-epcr-spo2]', demo);
    const spo2V = $('[data-epcr-spo2-v]', demo);

    const caret = (field) => {
        $$('.caret', demo).forEach((c) => c.classList.remove('is-on'));
        if (field) $('.caret', field)?.classList.add('is-on');
    };
    const mark = (el, cls) => {
        el.classList.remove('ok', 'warn', 'is-focus');
        el.classList.add(cls);
    };
    const typeOut = async (el, text, speed, stopped) => {
        for (let i = 1; i <= text.length && !stopped(); i++) {
            el.textContent = text.slice(0, i);
            await wait(speed + (text[i - 1] === ' ' ? 24 : 0) + Math.random() * 18);
        }
    };

    whileVisible(
        demo,
        async (stopped) => {
            type.textContent = type.dataset.wrong;
            spo2V.textContent = spo2V.dataset.wrong;
            mark(complaint, 'warn');
            mark(spo2, 'warn');
            await wait(1300);
            if (stopped()) return;

            mark(complaint, 'is-focus');
            type.textContent = '';
            caret(complaint);
            await wait(180);
            await typeOut(type, type.dataset.text, 44, stopped);
            await wait(220);
            if (stopped()) return;
            caret(null);
            mark(complaint, 'ok');

            await wait(520);
            if (stopped()) return;
            mark(spo2, 'is-focus');
            spo2V.textContent = '';
            caret(spo2);
            await wait(180);
            await typeOut(spo2V, spo2V.dataset.text, 80, stopped);
            await wait(220);
            if (stopped()) return;
            caret(null);
            mark(spo2, 'ok');
            await wait(3200);
        },
        () => {
            type.textContent = type.dataset.text;
            spo2V.textContent = spo2V.dataset.text;
            mark(complaint, 'ok');
            mark(spo2, 'ok');
            caret(null);
        }
    );
}

function pkDemo() {
    const demo = $('[data-pk-demo]');
    const lines = Object.fromEntries($$('.pk-line', demo).map((el) => [el.dataset.organ, el]));
    const labels = Object.fromEntries($$('[data-label]', demo).map((el) => [el.dataset.label, el]));
    const sizeBar = $('[data-pk-size]', demo);
    const chargeBar = $('[data-pk-charge]', demo);
    const pegBar = $('[data-pk-peg]', demo);
    const doseBar = $('[data-pk-dose]', demo);
    const sizeV = $('[data-pk-size-v]', demo);
    const chargeV = $('[data-pk-charge-v]', demo);
    const pegV = $('[data-pk-peg-v]', demo);
    const doseV = $('[data-pk-dose-v]', demo);

    const SIZE = [20, 300];
    const CHARGE = [-30, 30];
    const PEG = [0, 100];
    const DOSE = [0.5, 20];
    const X0 = 19.25;
    const X1 = 166;
    const Y_TOP = 4;
    const Y_BOT = 96;
    const HOURS = 48;
    const y = (v) => Y_TOP + ((2 - Math.log10(Math.max(v, 0.01))) / 4) * (Y_BOT - Y_TOP);
    const unit = (v, [lo, hi]) => (v - lo) / (hi - lo);

    const model = ({ size, charge, peg, dose }) => {
        const stealth = peg / 100;
        const saturation = 1 / (1 + dose / 10);
        const k = 0.35 * (1 - 0.75 * stealth) * (1 + 0.02 * Math.max(charge, 0) + 0.008 * Math.max(-charge, 0)) * (0.5 + size / 200) * saturation;
        const res = 0.85 - 0.35 * stealth;
        const spleen = 0.1 + 0.12 * Math.min(Math.max((size - 50) / 250, 0), 1);
        const epr = Math.exp(-(((size - 100) / 80) ** 2)) * (1 - (0.3 * Math.max(charge, 0)) / 30);
        const bbb = Math.exp(-size / 60);
        return (t) => {
            const cleared = 1 - Math.exp(-k * t);
            const exposure = cleared / k;
            return {
                liver: 100 * (res - spleen) * cleared,
                spleen: 100 * spleen * cleared,
                tumor: 100 * 0.004 * epr * exposure,
                brain: 100 * 0.0002 * bbb * exposure,
            };
        };
    };

    const RIGID = { size: 220, charge: 20, peg: 0, dose: 1 };
    const SOFT = { size: 100, charge: -5, peg: 80, dose: 10 };
    let cur = SOFT;

    const render = (p) => {
        const f = model(p);
        const pts = { liver: [], spleen: [], tumor: [], brain: [] };
        for (let t = 0; t <= HOURS; t += 1.5) {
            const v = f(t);
            const x = (X0 + (t / HOURS) * (X1 - X0)).toFixed(1);
            for (const organ in pts) pts[organ].push(`${x} ${y(v[organ]).toFixed(1)}`);
        }
        for (const organ in pts) lines[organ].setAttribute('d', `M${pts[organ].join('L')}`);

        const end = f(HOURS);
        let last = -Infinity;
        for (const organ of Object.keys(end).sort((a, b) => y(end[a]) - y(end[b]))) {
            const ly = Math.max(y(end[organ]), last + 9);
            labels[organ].setAttribute('x', X1 + 4);
            labels[organ].setAttribute('y', ly.toFixed(1));
            last = ly;
        }

        sizeBar.style.setProperty('--p', unit(p.size, SIZE));
        chargeBar.style.setProperty('--p', unit(p.charge, CHARGE));
        pegBar.style.setProperty('--p', unit(p.peg, PEG));
        doseBar.style.setProperty('--p', unit(p.dose, DOSE));
        sizeV.textContent = `${Math.round(p.size)} nm`;
        const c = Math.round(p.charge);
        chargeV.textContent = `${c > 0 ? '+' : c < 0 ? '−' : ''}${Math.abs(c)} mV`;
        pegV.textContent = `${Math.round(p.peg)}%`;
        doseV.textContent = `${p.dose < 9.95 ? p.dose.toFixed(1) : Math.round(p.dose)} mg/kg`;
        cur = p;
    };

    const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
    const tween = async (change, ms, stopped) => {
        const from = { ...cur };
        const to = { ...cur, ...change };
        const t0 = performance.now();
        while (!stopped()) {
            const k = Math.min(1, (performance.now() - t0) / ms);
            const e = ease(k);
            const p = {};
            for (const key in from) p[key] = from[key] + (to[key] - from[key]) * e;
            render(p);
            if (k === 1) return;
            await new Promise(requestAnimationFrame);
        }
    };

    whileVisible(
        demo,
        async (stopped) => {
            await tween(RIGID, 1200, stopped);
            await wait(1200);
            if (stopped()) return;
            await tween({ size: SOFT.size }, 1000, stopped);
            await wait(250);
            if (stopped()) return;
            await tween({ charge: SOFT.charge }, 800, stopped);
            await wait(250);
            if (stopped()) return;
            await tween({ peg: SOFT.peg }, 1000, stopped);
            await wait(250);
            if (stopped()) return;
            await tween({ dose: SOFT.dose }, 900, stopped);
            await wait(3400);
        },
        () => render(SOFT)
    );
}

function simDemo() {
    const demo = $('[data-sim-demo]');
    const guide = $('.sim-guide', demo);
    const trail = $('[data-sim-trail]', demo);
    const robot = $('[data-sim-robot]', demo);
    const layers = $$('[data-nn-layer]', demo);
    const gaps = $$('[data-nn-gap]', demo);
    const SAMPLES = 160;
    const SWEEPS = 6;

    const length = guide.getTotalLength();
    let seed = 11;
    const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    let drift = 0;
    const pts = [];
    for (let i = 0; i <= SAMPLES; i++) {
        const at = (i / SAMPLES) * length;
        const p = guide.getPointAtLength(at);
        const ahead = guide.getPointAtLength(Math.min(length, at + 0.5));
        const behind = guide.getPointAtLength(Math.max(0, at - 0.5));
        const nx = behind.y - ahead.y;
        const ny = ahead.x - behind.x;
        const n = Math.hypot(nx, ny) || 1;
        drift = drift * 0.75 + (rand() - 0.5) * 1.6;
        const taper = Math.min(1, i / 8, (SAMPLES - i) / 8);
        pts.push(`${(p.x + (nx / n) * drift * taper).toFixed(2)} ${(p.y + (ny / n) * drift * taper).toFixed(2)}`);
    }
    trail.setAttribute('d', `M${pts.join('L')}`);
    const total = trail.getTotalLength();

    const pulse = (k) => {
        const wave = ((k * SWEEPS) % 1) * (layers.length + 0.4) - 0.6;
        const glow = (at) => Math.max(0, 1 - Math.abs(wave - at) * 1.4).toFixed(2);
        layers.forEach((g, i) => (g.style.opacity = glow(i)));
        gaps.forEach((g, i) => (g.style.opacity = glow(i + 0.5)));
    };
    const settle = () => {
        [...layers, ...gaps].forEach((g) => (g.style.opacity = '0.9'));
    };
    const render = (k) => {
        const p = trail.getPointAtLength(k * total);
        robot.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
        trail.style.strokeDashoffset = String(100 * (1 - k));
        if (k < 1) pulse(k);
        else settle();
    };

    whileVisible(
        demo,
        async (stopped) => {
            render(0);
            demo.classList.remove('is-fading');
            await wait(700);
            if (stopped()) return;
            const t0 = performance.now();
            while (!stopped()) {
                const k = Math.min(1, (performance.now() - t0) / 4500);
                render(k);
                if (k === 1) break;
                await new Promise(requestAnimationFrame);
            }
            if (stopped()) return;
            await wait(3000);
            if (stopped()) return;
            demo.classList.add('is-fading');
            await wait(500);
        },
        () => {
            demo.classList.remove('is-fading');
            render(0);
        }
    );
}

function neuroDemo() {
    const demo = $('[data-neuro-demo]');
    const text = $('[data-neuro-text]', demo);
    const caret = $('.caret', demo);
    const [dev, food] = $$('[data-neuro-agent]', demo);

    const pts = [];
    for (let x = 0; x <= 400; x += 2) {
        const a = (x / 200) * Math.PI * 2;
        const v = 20 + 5 * Math.sin(3 * a) + 3 * Math.sin(7 * a + 1) + 1.5 * Math.sin(13 * a + 2) + 0.8 * Math.sin(23 * a);
        pts.push(`${x} ${v.toFixed(1)}`);
    }
    $('[data-neuro-wave]', demo).setAttribute('d', `M${pts.join('L')}`);

    const LABELS = { queued: 'Waiting', deploying: 'Deploying', running: 'Running', done: 'Complete' };
    const setAgent = (agent, state) => {
        agent.dataset.state = state;
        $('[data-neuro-status]', agent).textContent = LABELS[state];
    };

    whileVisible(
        demo,
        async (stopped) => {
            demo.classList.add('is-live');
            demo.dataset.phase = 'listen';
            text.textContent = '';
            setAgent(dev, 'queued');
            setAgent(food, 'queued');
            await wait(1800);
            if (stopped()) return;

            demo.dataset.phase = 'detect';
            await wait(600);
            if (stopped()) return;
            caret.classList.add('is-on');
            const full = text.dataset.text;
            for (let i = 1; i <= full.length && !stopped(); i++) {
                text.textContent = full.slice(0, i);
                await wait(40 + Math.random() * 25);
            }
            if (stopped()) return;
            caret.classList.remove('is-on');
            demo.dataset.phase = 'sent';
            await wait(300);
            if (stopped()) return;

            setAgent(dev, 'deploying');
            await wait(300);
            if (stopped()) return;
            setAgent(food, 'deploying');
            await wait(400);
            if (stopped()) return;
            setAgent(dev, 'running');
            await wait(300);
            if (stopped()) return;
            setAgent(food, 'running');
            await wait(1950);
            if (stopped()) return;
            setAgent(dev, 'done');
            await wait(1100);
            if (stopped()) return;
            setAgent(food, 'done');
            await wait(3400);
        },
        () => {
            demo.classList.remove('is-live');
            demo.dataset.phase = 'sent';
            text.textContent = text.dataset.text;
            caret.classList.remove('is-on');
            setAgent(dev, 'done');
            setAgent(food, 'done');
        }
    );
}

document.addEventListener('dragstart', (e) => {
    if (e.target instanceof HTMLImageElement) e.preventDefault();
});

epcrDemo();
pkDemo();
simDemo();
neuroDemo();
startHero();
