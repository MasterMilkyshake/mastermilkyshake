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
            spo2V.textContent = '91%';
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
            await typeOut(spo2V, '97%', 80, stopped);
            await wait(220);
            if (stopped()) return;
            caret(null);
            mark(spo2, 'ok');
            await wait(3200);
        },
        () => {
            type.textContent = type.dataset.text;
            spo2V.textContent = '97%';
            mark(complaint, 'ok');
            mark(spo2, 'ok');
            caret(null);
        }
    );
}

function chatDemo() {
    const demo = $('[data-chat-demo]');
    const steps = $$('[data-chat-step]', demo);
    const typing = $('[data-chat-typing]', demo);
    const compose = $('[data-chat-compose]', demo);
    const caret = $('[data-compose-caret]', demo);

    whileVisible(
        demo,
        async (stopped) => {
            steps.forEach((el) => {
                el.classList.remove('is-new');
                el.classList.add('is-hidden');
            });
            await wait(600);
            for (const [i, el] of steps.entries()) {
                if (stopped()) return;
                if (i === 0) {
                    caret.classList.add('is-on');
                    const text = el.textContent;
                    for (let j = 1; j <= text.length && !stopped(); j++) {
                        compose.textContent = text.slice(0, j);
                        await wait(45 + Math.random() * 35);
                    }
                    caret.classList.remove('is-on');
                    await wait(450);
                    if (stopped()) return;
                    compose.textContent = '';
                } else {
                    typing.classList.add('is-on');
                    await wait(i === 1 ? 1200 : 2000);
                    typing.classList.remove('is-on');
                    if (stopped()) return;
                }
                el.classList.replace('is-hidden', 'is-new');
                await wait(700);
            }
            await wait(3600);
        },
        () => {
            steps.forEach((el) => el.classList.remove('is-hidden', 'is-new'));
            typing.classList.remove('is-on');
            compose.textContent = '';
            caret.classList.remove('is-on');
        }
    );
}

document.addEventListener('dragstart', (e) => {
    if (e.target instanceof HTMLImageElement) e.preventDefault();
});

epcrDemo();
chatDemo();
startHero();
