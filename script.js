const METALS = {
    gold: { mid: 0xc9a227, dark: 0x8a6c17 },
    rose: { mid: 0xb76e56, dark: 0x7c4534 },
    platinum: { mid: 0xd8d8d4, dark: 0x9c9a94 },
    silver: { mid: 0xc9c8c4, dark: 0x8f8d88 }
};
let currentMetal = 'gold';
let currentCut = 'round';

function metalMaterial(key) {
    const m = METALS[key];
    return new THREE.MeshStandardMaterial({ color: m.mid, metalness: 1, roughness: 0.28 });
}

function buildDiamondGeometry() {
    // Real round-brilliant profile: culet -> pavilion -> girdle -> crown -> table
    const profile = [
        new THREE.Vector2(0.00, -0.34),  // culet
        new THREE.Vector2(0.46, 0.00),  // girdle (widest point)
        new THREE.Vector2(0.28, 0.22),  // crown, lower facets
        new THREE.Vector2(0.16, 0.30),  // table edge
        new THREE.Vector2(0.00, 0.30)   // table center (flat top)
    ];
    const geo = new THREE.LatheGeometry(profile, 16);
    geo.computeVertexNormals();
    return geo;
}

function gemGeometry(cut) {
    if (cut === 'round') return buildDiamondGeometry();
    if (cut === 'princess') return new THREE.CylinderGeometry(0.5, 0.32, 0.7, 4, 1);
    if (cut === 'emerald') return new THREE.CylinderGeometry(0.46, 0.38, 0.62, 8, 1);
    return buildDiamondGeometry();
}

function gemMaterial() {
    return new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0, roughness: 0.015, flatShading: true,
        clearcoat: 1, clearcoatRoughness: 0.02,
        transmission: 0.92, ior: 2.42, reflectivity: 1,
        envMapIntensity: 2.4
    });
}

function attachSparkles(gemMesh, cut) {
    if (cut !== 'round') return;
    const pts = [];
    const ring = [0, 1, 2, 3, 4, 5].map(i => {
        const a = (i / 6) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 0.42, 0.0, Math.sin(a) * 0.42);
    });
    ring.forEach(p => pts.push(p.x, p.y, p.z));
    pts.push(0, 0.30, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.8, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sparkles = new THREE.Points(geo, mat);
    gemMesh.add(sparkles);
    gemMesh.userData.sparkles = sparkles;
}

function buildRing(cut, metalKey) {
    const group = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.22, 32, 120), metalMaterial(metalKey));
    band.rotation.x = Math.PI / 2;
    group.add(band);

    const gem = new THREE.Mesh(gemGeometry(cut), gemMaterial());
    gem.position.y = 0.62;
    if (cut === 'princess') gem.rotation.y = Math.PI / 4;
    attachSparkles(gem, cut);
    group.add(gem);

    // prongs
    const prongMat = metalMaterial(metalKey);
    for (let i = 0; i < 4; i++) {
        const a = i * (Math.PI / 2) + Math.PI / 4;
        const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8), prongMat);
        prong.position.set(Math.cos(a) * 0.38, 0.42, Math.sin(a) * 0.38);
        group.add(prong);
    }
    group.userData = { band, gem, prongMat };
    return group;
}

function setRingLook(group, cut, metalKey) {
    const { band, prongMat } = group.userData;
    band.material = metalMaterial(metalKey);
    group.children.forEach(c => { if (c.geometry && c.geometry.type === 'CylinderGeometry' && c !== group.userData.gem) { c.material = band.material; } });
    const oldGem = group.userData.gem;
    const newGem = new THREE.Mesh(gemGeometry(cut), gemMaterial());
    newGem.position.y = 0.62;
    if (cut === 'princess') newGem.rotation.y = Math.PI / 4;
    attachSparkles(newGem, cut);
    group.remove(oldGem);
    group.add(newGem);
    group.userData.gem = newGem;
}

function makeLights(scene) {
    scene.add(new THREE.AmbientLight(0x2a2620, 1.1));
    const key = new THREE.DirectionalLight(0xfff1d0, 1.4);
    key.position.set(3, 4, 2); scene.add(key);
    const rim = new THREE.PointLight(0x9fd8ff, 1.1, 20); rim.position.set(-3, 1, -2); scene.add(rim);
    const fill = new THREE.PointLight(0xffcf7a, 0.8, 20); fill.position.set(0, -2, 3); scene.add(fill);
    return { key, rim, fill };
}

// Procedural studio environment (soft gold horizon band) so metal/gem have something real to reflect
let sharedEnvTexture = null;
function buildStudioEnvironment(renderer) {
    if (sharedEnvTexture) return sharedEnvTexture;
    const envScene = new THREE.Scene();
    const grad = document.createElement('canvas');
    grad.width = 4; grad.height = 256;
    const gctx = grad.getContext('2d');
    const lg = gctx.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0.00, '#0b0a09');
    lg.addColorStop(0.42, '#1c1712');
    lg.addColorStop(0.50, '#e8c876');
    lg.addColorStop(0.58, '#1c1712');
    lg.addColorStop(1.00, '#0b0a09');
    gctx.fillStyle = lg; gctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(grad);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    envScene.background = tex;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromEquirectangular(tex);
    sharedEnvTexture = rt.texture;
    pmrem.dispose();
    return sharedEnvTexture;
}

function addGroundShadow(group) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const gctx = c.getContext('2d');
    const rg = gctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, 'rgba(0,0,0,0.55)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    gctx.fillStyle = rg; gctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -1.05;
    group.add(mesh);
}

function buildSkinTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const ctx2 = c.getContext('2d');
    const grad = ctx2.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.00, '#e3b593');
    grad.addColorStop(0.42, '#d9a47f');
    grad.addColorStop(0.50, '#c68f68');
    grad.addColorStop(0.58, '#d9a47f');
    grad.addColorStop(1.00, '#cf9a74');
    ctx2.fillStyle = grad; ctx2.fillRect(0, 0, 256, 512);

    // knuckle crease lines
    ctx2.strokeStyle = 'rgba(120,70,45,0.28)'; ctx2.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
        const y = 300 + i * 7;
        ctx2.beginPath();
        ctx2.moveTo(20, y);
        for (let x = 20; x <= 236; x += 20) { ctx2.lineTo(x, y + Math.sin(x * 0.2 + i) * 3); }
        ctx2.stroke();
    }

    // subtle pore noise
    for (let i = 0; i < 2600; i++) {
        const x = Math.random() * 256, y = Math.random() * 512;
        const a = Math.random() * 0.05;
        ctx2.fillStyle = Math.random() > 0.5 ? `rgba(90,50,30,${a})` : `rgba(255,230,210,${a})`;
        ctx2.fillRect(x, y, 1.4, 1.4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
}

function buildFinger() {
    const group = new THREE.Group();
    const skinTex = buildSkinTexture();
    const mat = new THREE.MeshStandardMaterial({ map: skinTex, color: 0xffffff, roughness: 0.58, metalness: 0, transparent: true, opacity: 0 });
    const rTop = 0.46, rBase = 0.58, h = 3.0;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBase, h, 40, 1, true), mat);
    group.add(cyl);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(rTop, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    tip.position.y = h / 2;
    group.add(tip);
    const base = new THREE.Mesh(new THREE.SphereGeometry(rBase, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat);
    base.position.y = -h / 2;
    group.add(base);
    const knuckle = new THREE.Mesh(new THREE.TorusGeometry(rBase * 0.98, 0.05, 12, 40), mat);
    knuckle.rotation.x = Math.PI / 2;
    knuckle.position.y = -h * 0.14;
    group.add(knuckle);

    // fingernail
    const nailMat = new THREE.MeshPhysicalMaterial({ color: 0xe9d6c8, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, opacity: 0 });
    const nail = new THREE.Mesh(new THREE.SphereGeometry(rTop * 0.72, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), nailMat);
    nail.scale.set(1, 1.35, 0.55);
    nail.position.set(0, h / 2 - 0.12, rTop * 0.86);
    nail.rotation.x = -0.25;
    group.add(nail);

    group.userData.mat = mat;
    group.userData.nailMat = nailMat;
    group.scale.set(1, 1, 0.88);
    group.position.y = -0.95;
    group.visible = false;
    return group;
}

/* ---------------- HERO / SCROLL SCENE ---------------- */
const heroCanvas = document.getElementById('heroCanvas');
const heroScene = new THREE.Scene();
const heroCamera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
heroCamera.position.set(0, 0, 6);
const heroRenderer = new THREE.WebGLRenderer({ canvas: heroCanvas, alpha: true, antialias: true });
heroRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
heroRenderer.setSize(window.innerWidth, window.innerHeight);
makeLights(heroScene);
heroScene.environment = buildStudioEnvironment(heroRenderer);
const heroRing = buildRing(currentCut, currentMetal);
addGroundShadow(heroRing);
heroRing.scale.set(0.05, 0.05, 0.05);
heroScene.add(heroRing);
const heroFinger = buildFinger();
heroScene.add(heroFinger);
document.getElementById('stage').classList.add('ready');
let heroIntro = 0;

window.addEventListener('resize', () => {
    heroCamera.aspect = window.innerWidth / window.innerHeight;
    heroCamera.updateProjectionMatrix();
    heroRenderer.setSize(window.innerWidth, window.innerHeight);
});

const stepTargets = [
    { rotY: 0.15, camZ: 6.0, ringScale: 1.35, ringY: 0, showHand: false }, // 01 the cut
    { rotY: Math.PI * 0.62, camZ: 4.7, ringScale: 1.35, ringY: 0, showHand: false }, // 02 the fit
    { rotY: Math.PI * 0.10, camZ: 4.1, ringScale: 0.62, ringY: -0.15, showHand: true }, // 03 on the hand
    { rotY: Math.PI * 1.28, camZ: 5.5, ringScale: 1.35, ringY: 0, showHand: false }  // 04 the room
];

let activeStep = -1; // -1 = idle (hero / below showcase)
let heroRotTarget = 0.15, heroCamTarget = 6.0;
let ringScaleTarget = 1.35, ringYTarget = 0, fingerOpacityTarget = 0, bobAmpTarget = 0.08;
let curRingScale = 1.35, curRingY = 0, curFingerOpacity = 0, curBobAmp = 0.08;

function heroLoop(t) {
    requestAnimationFrame(heroLoop);
    if (activeStep >= 0) {
        const s = stepTargets[activeStep];
        heroRotTarget = s.rotY; heroCamTarget = s.camZ;
        ringScaleTarget = s.ringScale; ringYTarget = s.ringY;
        fingerOpacityTarget = s.showHand ? 1 : 0;
        bobAmpTarget = s.showHand ? 0.015 : 0.08;
    } else {
        heroRotTarget += 0.0018;
        ringScaleTarget = 1.35; ringYTarget = 0; fingerOpacityTarget = 0; bobAmpTarget = 0.08;
    }

    heroRing.rotation.y += (heroRotTarget - heroRing.rotation.y) * 0.05;
    heroCamera.position.z += (heroCamTarget - heroCamera.position.z) * 0.05;
    curRingY += (ringYTarget - curRingY) * 0.05;
    curBobAmp += (bobAmpTarget - curBobAmp) * 0.05;
    curFingerOpacity += (fingerOpacityTarget - curFingerOpacity) * 0.045;

    heroFinger.visible = curFingerOpacity > 0.01;
    heroFinger.userData.mat.opacity = curFingerOpacity;
    heroFinger.userData.nailMat.opacity = curFingerOpacity;

    heroIntro = Math.min(1, heroIntro + 0.02);
    if (heroIntro < 1) {
        const introEase = 1 - Math.pow(1 - heroIntro, 3);
        curRingScale = 0.05 + 1.30 * introEase;
    } else {
        curRingScale += (ringScaleTarget - curRingScale) * 0.05;
    }

    heroRing.scale.setScalar(curRingScale);
    heroRing.position.y = curRingY + Math.sin(t * 0.0006) * curBobAmp;
    heroRing.rotation.z = Math.sin(t * 0.0004) * 0.03;

    const heroSparkles = heroRing.userData.gem && heroRing.userData.gem.userData.sparkles;
    if (heroSparkles) heroSparkles.material.opacity = 0.35 + 0.55 * Math.abs(Math.sin(t * 0.0032));

    heroRenderer.render(heroScene, heroCamera);
}
requestAnimationFrame(heroLoop);

const scrollCue = document.querySelector('.scroll-cue');
window.addEventListener('scroll', () => {
    scrollCue.classList.toggle('hidden', window.scrollY > 120);
}, { passive: true });

// IntersectionObserver drives which step is "active"
const stepEls = document.querySelectorAll('.step-inner');
const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            entry.target.classList.add('in-view');
            activeStep = parseInt(entry.target.dataset.step, 10);
        }
    });
}, { threshold: [0.5] });
stepEls.forEach(el => io.observe(el));

const heroEl = document.querySelector('.hero');
const showcaseEl = document.getElementById('showcase');
const belowObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.target === heroEl && entry.isIntersecting) activeStep = -1;
    });
}, { threshold: 0.4 });
belowObserver.observe(heroEl);

const afterShowcase = document.getElementById('customize');
const afterObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if (entry.isIntersecting) activeStep = -1; });
}, { threshold: 0.3 });
afterObs.observe(afterShowcase);

/* ---------------- CUSTOMIZE SCENE ---------------- */
const customCanvas = document.getElementById('customCanvas');
const customViewer = document.getElementById('customViewer');
const customScene = new THREE.Scene();
const customCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
customCamera.position.set(0, 0, 5.4);
const customRenderer = new THREE.WebGLRenderer({ canvas: customCanvas, alpha: true, antialias: true });
makeLights(customScene);
customScene.environment = buildStudioEnvironment(customRenderer);
const customRing = buildRing(currentCut, currentMetal);
addGroundShadow(customRing);
customScene.add(customRing);

function sizeCustom() {
    const s = customViewer.clientWidth;
    customRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    customRenderer.setSize(s, s);
    customCamera.aspect = 1;
    customCamera.updateProjectionMatrix();
}
sizeCustom();
window.addEventListener('resize', sizeCustom);

let dragging = false, lastX = 0, lastY = 0, customRotY = 0.4, customRotX = -0.15, velY = 0.0015;

customViewer.addEventListener('pointerdown', e => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; customViewer.setPointerCapture(e.pointerId);
    document.querySelector('.drag-hint').classList.add('hidden');
});

customViewer.addEventListener('pointerup', () => dragging = false);
customViewer.addEventListener('pointerleave', () => dragging = false);

customViewer.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    customRotY += dx * 0.008;
    customRotX = Math.max(-0.6, Math.min(0.6, customRotX + dy * 0.006));
    lastX = e.clientX; lastY = e.clientY;
});

function customLoop(t) {
    requestAnimationFrame(customLoop);
    if (!dragging) customRotY += velY;
    customRing.rotation.y = customRotY;
    customRing.rotation.x = customRotX;

    const customSparkles = customRing.userData.gem && customRing.userData.gem.userData.sparkles;
    if (customSparkles) customSparkles.material.opacity = 0.35 + 0.55 * Math.abs(Math.sin(t * 0.0032));

    customRenderer.render(customScene, customCamera);
}
requestAnimationFrame(customLoop);

/* ---------------- CUSTOMIZE UI ---------------- */
const metalSwatches = document.getElementById('metalSwatches');
const metalHexIvory = {
    gold: ['#f3d98a', '#c9a227'],
    rose: ['#e9b7a0', '#b76e56'],
    platinum: ['#f4f4f2', '#d8d8d4'],
    silver: ['#e9e9e6', '#c9c8c4']
};

Object.keys(METALS).forEach(k => {
    const d = document.createElement('div');
    d.className = 'swatch-dot' + (k === currentMetal ? ' selected' : '');
    d.style.background = `linear-gradient(135deg, ${metalHexIvory[k][0]}, ${metalHexIvory[k][1]})`;
    d.title = k;

    d.onclick = () => {
        currentMetal = k;
        document.querySelectorAll('.swatch-dot').forEach(s => s.classList.remove('selected'));
        d.classList.add('selected');
        setRingLook(heroRing, currentCut, currentMetal);
        setRingLook(customRing, currentCut, currentMetal);
    };

    metalSwatches.appendChild(d);
});

const cutPills = document.getElementById('cutPills');

[['round', 'Round'], ['princess', 'Princess'], ['emerald', 'Emerald']].forEach(([id, label]) => {
    const b = document.createElement('button');
    b.className = 'cut-pill' + (id === currentCut ? ' selected' : '');
    b.textContent = label;

    b.onclick = () => {
        currentCut = id;
        document.querySelectorAll('.cut-pill').forEach(p => p.classList.remove('selected'));
        b.classList.add('selected');
        setRingLook(heroRing, currentCut, currentMetal);
        setRingLook(customRing, currentCut, currentMetal);
    };

    cutPills.appendChild(b);
});

/* CURTAIN LOADER — typewriter mark, then parts like a grand reveal */
(function () {
    const word = "Loupe Aris";
    const accentFrom = 5; // italicize/gold the "Aris" portion once fully typed
    const typeEl = document.getElementById('loaderType');
    let i = 0;

    function tick() {
        if (i <= word.length) {
            const shown = word.slice(0, i);

            if (i > accentFrom) {
                typeEl.innerHTML = shown.slice(0, accentFrom) + '<span class="accent">' + shown.slice(accentFrom) + '</span>';
            } else {
                typeEl.textContent = shown;
            }

            i++;
            setTimeout(tick, 82);
        } else {
            setTimeout(() => {
                document.getElementById('loader').classList.add('open');
                setTimeout(() => { document.getElementById('loader').classList.add('hide'); }, 1250);
            }, 500);
        }
    }

    setTimeout(tick, 250);
})();