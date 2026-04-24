import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

type CamMode = "third" | "first" | "top";
type QuestState = "none" | "active" | "done";

const SOLDIER_URL = "https://threejs.org/examples/models/gltf/Soldier.glb";

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hp, setHp] = useState(100);
  const [stamina, setStamina] = useState(100);
  const [enemyHp, setEnemyHp] = useState(80);
  const [enemyAlive, setEnemyAlive] = useState(true);
  const [camMode, setCamMode] = useState<CamMode>("third");
  const [dialog, setDialog] = useState<{ speaker: string; text: string } | null>(null);
  const [quest, setQuest] = useState<QuestState>("none");
  const [snowboarding, setSnowboarding] = useState(false);
  const [nearNpc, setNearNpc] = useState(false);
  const [nearHill, setNearHill] = useState(false);
  const [nearCampfire, setNearCampfire] = useState(false);
  const [snowballs, setSnowballs] = useState(3);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [hitFlash, setHitFlash] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [fps, setFps] = useState(60);
  const [notification, setNotification] = useState<string | null>(null);

  const stateRef = useRef({
    hp: 100,
    stamina: 100,
    enemyHp: 80,
    enemyAlive: true,
    quest: "none" as QuestState,
    camMode: "third" as CamMode,
    snowboarding: false,
    snowballs: 3,
    dialogStep: -1,
    lastAttack: 0,
    lastDamage: 0,
    lastInteract: 0,
    lastThrow: 0,
  });

  useEffect(() => { stateRef.current.hp = hp; }, [hp]);
  useEffect(() => { stateRef.current.stamina = stamina; }, [stamina]);
  useEffect(() => { stateRef.current.enemyHp = enemyHp; }, [enemyHp]);
  useEffect(() => { stateRef.current.enemyAlive = enemyAlive; }, [enemyAlive]);
  useEffect(() => { stateRef.current.quest = quest; }, [quest]);
  useEffect(() => { stateRef.current.camMode = camMode; }, [camMode]);
  useEffect(() => { stateRef.current.snowboarding = snowboarding; }, [snowboarding]);
  useEffect(() => { stateRef.current.snowballs = snowballs; }, [snowballs]);

  function notify(msg: string) {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2200);
  }

  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88a8d0);
    scene.fog = new THREE.FogExp2(0x88a8d0, 0.011);

    const camera = new THREE.PerspectiveCamera(65, mount.clientWidth / mount.clientHeight, 0.1, 800);
    camera.position.set(0, 6, 10);

    function tryRenderer(opts: THREE.WebGLRendererParameters): THREE.WebGLRenderer | null {
      try {
        const r = new THREE.WebGLRenderer(opts);
        const ctx = r.getContext();
        if (!ctx) { r.dispose(); return null; }
        return r;
      } catch { return null; }
    }
    const renderer =
      tryRenderer({ antialias: true, powerPreference: "high-performance" }) ||
      tryRenderer({ antialias: false, powerPreference: "default" }) ||
      tryRenderer({ antialias: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: false });
    if (!renderer) {
      setLoading(false);
      const msg = document.createElement("div");
      msg.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-family:sans-serif;background:linear-gradient(135deg,#0a1428,#1a2848);text-align:center;padding:2rem;z-index:10;";
      msg.innerHTML = "<div><h2 style='color:#7ec8ff'>WebGL Tidak Tersedia</h2><p style='opacity:0.75;margin-top:12px;line-height:1.5'>Browser/preview ini gak support WebGL.<br/>Coba buka di <b>tab baru</b>, refresh, atau pakai Chrome/Firefox dengan GPU aktif.</p></div>";
      mount.appendChild(msg);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.autoClear = true;
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // POST-PROCESSING
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(mount.clientWidth * 0.5, mount.clientHeight * 0.5),
      0.55, 0.6, 0.82
    );
    composer.addPass(bloom);

    const vignettePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        offset: { value: 1.1 },
        darkness: { value: 1.2 },
        coldTint: { value: new THREE.Vector3(0.95, 1.0, 1.08) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float offset;
        uniform float darkness;
        uniform vec3 coldTint;
        varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          c.rgb *= coldTint;
          vec2 uv = (vUv - 0.5) * offset;
          float v = smoothstep(0.8, 0.2, dot(uv, uv));
          c.rgb *= mix(1.0, v, darkness * 0.5);
          gl_FragColor = c;
        }`,
    });
    composer.addPass(vignettePass);
    composer.addPass(new OutputPass());

    // LIGHTS
    const hemi = new THREE.HemisphereLight(0xc8e0ff, 0xffffff, 0.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe8c4, 1.6);
    sun.position.set(40, 60, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x7fb0ff, 0.6);
    rim.position.set(-30, 20, -20);
    scene.add(rim);

    // GROUND with displacement
    const groundGeo = new THREE.PlaneGeometry(500, 500, 80, 80);
    const positions = groundGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const dist = Math.sqrt(x * x + y * y);
      const fade = Math.max(0, Math.min(1, (dist - 18) / 30));
      const noise =
        Math.sin(x * 0.08) * Math.cos(y * 0.08) * 0.6 +
        Math.sin(x * 0.21) * Math.cos(y * 0.17) * 0.25;
      positions.setZ(i, noise * fade);
    }
    groundGeo.computeVertexNormals();

    // Snow texture
    const snowCanvas = document.createElement("canvas");
    snowCanvas.width = 512;
    snowCanvas.height = 512;
    const sctx = snowCanvas.getContext("2d")!;
    const grad = sctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, "#e8eef8");
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) {
      sctx.fillStyle = `rgba(${200 + Math.random() * 55},${210 + Math.random() * 45},255,${Math.random() * 0.5})`;
      sctx.fillRect(Math.random() * 512, Math.random() * 512, 1, 1);
    }
    for (let i = 0; i < 200; i++) {
      sctx.fillStyle = `rgba(255,255,255,${0.6 + Math.random() * 0.4})`;
      sctx.beginPath();
      sctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 1.4, 0, Math.PI * 2);
      sctx.fill();
    }
    const snowTex = new THREE.CanvasTexture(snowCanvas);
    snowTex.wrapS = snowTex.wrapT = THREE.RepeatWrapping;
    snowTex.repeat.set(40, 40);
    snowTex.colorSpace = THREE.SRGBColorSpace;

    const ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshStandardMaterial({ map: snowTex, color: 0xffffff, roughness: 0.85, metalness: 0.05 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Mountains
    function makeMountain(x: number, z: number, h: number) {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(30 + Math.random() * 20, h, 12),
        new THREE.MeshStandardMaterial({ color: 0xb8d0e8, roughness: 1, flatShading: true })
      );
      m.position.set(x, h / 2 - 2, z);
      scene.add(m);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      makeMountain(Math.cos(a) * 200, Math.sin(a) * 200, 35 + Math.random() * 30);
    }

    // SNOW HILL
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(22, 18, 48),
      new THREE.MeshStandardMaterial({ map: snowTex, color: 0xffffff, roughness: 0.7 })
    );
    hill.position.set(45, 9, -35);
    hill.castShadow = true;
    hill.receiveShadow = true;
    scene.add(hill);

    function makeMarker(color: number) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.4, 1.7, 48),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
      );
      ring.rotation.x = -Math.PI / 2;
      return ring;
    }

    const hillTrigger = new THREE.Vector3(30, 0, -25);
    const hillMarker = makeMarker(0x22aaff);
    hillMarker.position.copy(hillTrigger);
    hillMarker.position.y = 0.05;
    scene.add(hillMarker);

    // TREES with sway data
    const treeData: { group: THREE.Group; phase: number }[] = [];
    function makeTree(x: number, z: number) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.5, 2.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a2a14, roughness: 0.9 })
      );
      trunk.position.y = 1.25; trunk.castShadow = true;
      g.add(trunk);
      const top = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(2.4 - i * 0.5, 2.2, 10),
          new THREE.MeshStandardMaterial({ color: 0x1a4f30, roughness: 0.85, flatShading: true })
        );
        cone.position.y = 2.8 + i * 1.3 - 2.5;
        cone.castShadow = true;
        const snow = new THREE.Mesh(
          new THREE.ConeGeometry(2.45 - i * 0.5, 0.45, 10),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
        );
        snow.position.y = 3.7 + i * 1.3 - 2.5;
        top.add(cone, snow);
      }
      top.position.y = 2.5;
      g.add(top);
      g.position.set(x, 0, z);
      g.rotation.y = Math.random() * Math.PI * 2;
      const s = 0.8 + Math.random() * 0.5;
      g.scale.setScalar(s);
      scene.add(g);
      treeData.push({ group: top, phase: Math.random() * Math.PI * 2 });
    }
    for (let i = 0; i < 45; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 22 + Math.random() * 95;
      makeTree(Math.cos(a) * r, Math.sin(a) * r);
    }

    // ROCKS
    function makeRock(x: number, z: number) {
      const g = new THREE.Group();
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a7080, roughness: 0.9, flatShading: true });
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random() * 0.8, 0), rockMat);
      r.position.y = 0.4;
      r.rotation.set(Math.random(), Math.random(), Math.random());
      r.castShadow = true; r.receiveShadow = true;
      // snow cap
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
      );
      cap.position.y = 0.55;
      cap.scale.set(1.05, 0.6, 1.05);
      g.add(r, cap);
      g.position.set(x, 0, z);
      scene.add(g);
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 80;
      makeRock(Math.cos(a) * r, Math.sin(a) * r);
    }

    // FENCES (short wooden)
    function makeFence(x: number, z: number, rot: number) {
      const g = new THREE.Group();
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4326, roughness: 0.9 });
      for (let i = -1; i <= 1; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), woodMat);
        post.position.set(i * 1.0, 0.6, 0);
        post.castShadow = true;
        g.add(post);
        // snow on top
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.18),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
        cap.position.set(i * 1.0, 1.24, 0);
        g.add(cap);
      }
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 0.08), woodMat);
      bar1.position.y = 0.9; g.add(bar1);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 0.08), woodMat);
      bar2.position.y = 0.5; g.add(bar2);
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      scene.add(g);
    }
    // Fence around NPC area
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      makeFence(-7 + Math.cos(a) * 5, -5 + Math.sin(a) * 5, a + Math.PI / 2);
    }

    // CAMPFIRE
    const campfirePos = new THREE.Vector3(-7, 0, -5);
    const campGroup = new THREE.Group();
    // logs
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2614, roughness: 0.95 });
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 8), logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 4) * Math.PI;
      log.position.y = 0.12;
      log.castShadow = true;
      campGroup.add(log);
    }
    // stone ring
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x555a65, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMat);
      stone.position.set(Math.cos(a) * 0.7, 0.15, Math.sin(a) * 0.7);
      stone.rotation.set(Math.random(), Math.random(), Math.random());
      stone.castShadow = true;
      campGroup.add(stone);
    }
    campGroup.position.copy(campfirePos);
    scene.add(campGroup);

    // Campfire light (warm flicker)
    const fireLight = new THREE.PointLight(0xff8a3a, 3.5, 14, 1.6);
    fireLight.position.set(campfirePos.x, 0.8, campfirePos.z);
    scene.add(fireLight);

    // Fire particles
    const fireGeo = new THREE.BufferGeometry();
    const fireCount = 35;
    const firePos = new Float32Array(fireCount * 3);
    const fireData: { life: number; max: number; vx: number; vy: number; vz: number }[] = [];
    for (let i = 0; i < fireCount; i++) {
      fireData.push({ life: Math.random() * 1.2, max: 1.2, vx: 0, vy: 0, vz: 0 });
    }
    fireGeo.setAttribute("position", new THREE.BufferAttribute(firePos, 3));

    // Soft particle texture
    const partCanvas = document.createElement("canvas");
    partCanvas.width = partCanvas.height = 64;
    const pctx = partCanvas.getContext("2d")!;
    const pg = pctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    pg.addColorStop(0, "rgba(255,255,255,1)");
    pg.addColorStop(0.4, "rgba(255,255,255,0.7)");
    pg.addColorStop(1, "rgba(255,255,255,0)");
    pctx.fillStyle = pg;
    pctx.fillRect(0, 0, 64, 64);
    const partTex = new THREE.CanvasTexture(partCanvas);

    const fire = new THREE.Points(
      fireGeo,
      new THREE.PointsMaterial({
        map: partTex, color: 0xff9933, size: 0.7, transparent: true,
        opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    scene.add(fire);

    // LANTERNS along path
    const lanterns: { mesh: THREE.Group; light: THREE.PointLight; baseIntensity: number; phase: number }[] = [];
    function makeLantern(x: number, z: number) {
      const g = new THREE.Group();
      // pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 }));
      pole.position.y = 1.1; pole.castShadow = true;
      g.add(pole);
      // top arm
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x2a2018 }));
      arm.position.set(0.2, 2.1, 0);
      g.add(arm);
      // lantern box
      const lant = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.32),
        new THREE.MeshStandardMaterial({
          color: 0xffd28a, emissive: 0xffaa44, emissiveIntensity: 1.5,
          roughness: 0.4, transparent: true, opacity: 0.9,
        }));
      lant.position.set(0.4, 1.85, 0);
      lant.castShadow = false;
      g.add(lant);
      g.position.set(x, 0, z);
      scene.add(g);

      const light = new THREE.PointLight(0xffaa55, 2, 10, 1.4);
      light.position.set(x + 0.4, 1.85, z);
      scene.add(light);

      lanterns.push({ mesh: g, light, baseIntensity: 2, phase: Math.random() * Math.PI * 2 });
    }
    // path of lanterns leading to NPC
    for (let i = 0; i < 5; i++) {
      makeLantern(-2 - i * 1.5, 2 + i * 0.5);
    }

    // SNOWMEN
    function makeSnowman(x: number, z: number) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
      const b1 = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 24), mat); b1.position.y = 1.3; b1.castShadow = true;
      const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 24), mat); b2.position.y = 2.75; b2.castShadow = true;
      const b3 = new THREE.Mesh(new THREE.SphereGeometry(0.65, 24, 24), mat); b3.position.y = 4.0; b3.castShadow = true;
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
      const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeMat); e1.position.set(-0.22, 4.15, 0.58);
      const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeMat); e2.position.set(0.22, 4.15, 0.58);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 8),
        new THREE.MeshStandardMaterial({ color: 0xff7a33, emissive: 0x331100, emissiveIntensity: 0.4 }));
      nose.position.set(0, 4.0, 0.72); nose.rotation.x = Math.PI / 2;
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0xc0263a }));
      scarf.position.y = 3.4; scarf.rotation.x = Math.PI / 2;
      g.add(b1, b2, b3, e1, e2, nose, scarf);
      g.position.set(x, 0, z);
      scene.add(g);
    }
    makeSnowman(-12, -10);
    makeSnowman(16, 12);
    makeSnowman(-22, 18);
    makeSnowman(8, -22);
    makeSnowman(-30, -5);
    makeSnowman(28, -8);

    // FROZEN LAKE (ice patch)
    const lake = new THREE.Mesh(
      new THREE.CircleGeometry(10, 48),
      new THREE.MeshStandardMaterial({
        color: 0x88c0e8, roughness: 0.15, metalness: 0.4,
        emissive: 0x224466, emissiveIntensity: 0.15,
      })
    );
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(-25, 0.02, 25);
    lake.receiveShadow = true;
    scene.add(lake);
    // Cracks ring
    const lakeRing = new THREE.Mesh(
      new THREE.RingGeometry(9.7, 10.1, 64),
      new THREE.MeshBasicMaterial({ color: 0xaaddff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
    );
    lakeRing.rotation.x = -Math.PI / 2;
    lakeRing.position.set(-25, 0.03, 25);
    scene.add(lakeRing);

    // ICE CRYSTALS (glowing pillars)
    function makeIceCrystal(x: number, z: number) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: 0xa0e0ff, roughness: 0.1, metalness: 0.6,
        emissive: 0x3388cc, emissiveIntensity: 0.7,
        transparent: true, opacity: 0.85,
      });
      for (let i = 0; i < 4; i++) {
        const h = 0.8 + Math.random() * 1.4;
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.18 + Math.random() * 0.15, h, 6), mat);
        c.position.set((Math.random() - 0.5) * 0.5, h / 2, (Math.random() - 0.5) * 0.5);
        c.rotation.z = (Math.random() - 0.5) * 0.3;
        c.castShadow = true;
        g.add(c);
      }
      g.position.set(x, 0, z);
      scene.add(g);
      const l = new THREE.PointLight(0x66ccff, 0.6, 5);
      l.position.set(x, 1.2, z);
      scene.add(l);
    }
    makeIceCrystal(-20, 28);
    makeIceCrystal(-30, 22);
    makeIceCrystal(-22, 32);
    makeIceCrystal(35, 5);
    makeIceCrystal(20, -28);
    makeIceCrystal(-5, 22);

    // WOODEN CABIN
    const cabin = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b4220, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.9 });
    const snowRoofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 5), wallMat);
    walls.position.y = 1.6; walls.castShadow = true; walls.receiveShadow = true;
    cabin.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.5, 4), roofMat);
    roof.position.y = 4.5; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    cabin.add(roof);
    const snowRoof = new THREE.Mesh(new THREE.ConeGeometry(4.7, 0.5, 4), snowRoofMat);
    snowRoof.position.y = 5.5; snowRoof.rotation.y = Math.PI / 4;
    cabin.add(snowRoof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x3a2014, roughness: 0.9 }));
    door.position.set(0, 1, 2.55); cabin.add(door);
    // window with warm glow
    const wnd = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0xffd28a, emissive: 0xffaa44, emissiveIntensity: 1.3,
      }));
    wnd.position.set(2, 2, 2.55); cabin.add(wnd);
    const wnd2 = wnd.clone();
    wnd2.position.set(-2, 2, 2.55); cabin.add(wnd2);
    // chimney
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x4a3025, roughness: 0.95 }));
    chim.position.set(1.5, 5.0, -1); chim.castShadow = true;
    cabin.add(chim);
    cabin.position.set(20, 0, -10);
    cabin.rotation.y = -Math.PI / 6;
    scene.add(cabin);
    // window light
    const cabinLight = new THREE.PointLight(0xffaa55, 1.5, 12);
    cabinLight.position.set(20, 2, -7);
    scene.add(cabinLight);
    // Smoke from chimney
    const smokeGeo = new THREE.BufferGeometry();
    const smokeCount = 20;
    const smokePos = new Float32Array(smokeCount * 3);
    const smokeData: { life: number; vy: number; drift: number }[] = [];
    for (let i = 0; i < smokeCount; i++) {
      smokeData.push({ life: Math.random() * 3, vy: 0.8 + Math.random() * 0.4, drift: (Math.random() - 0.5) * 0.3 });
    }
    smokeGeo.setAttribute("position", new THREE.BufferAttribute(smokePos, 3));
    const smoke = new THREE.Points(
      smokeGeo,
      new THREE.PointsMaterial({
        map: partTex, color: 0xaaaaaa, size: 1.0, transparent: true,
        opacity: 0.5, depthWrite: false,
      })
    );
    scene.add(smoke);
    const chimneyWorld = new THREE.Vector3();
    cabin.updateMatrixWorld(true);
    chim.getWorldPosition(chimneyWorld);
    chimneyWorld.y += 0.8;

    // SIGNPOST
    function makeSignpost(x: number, z: number, label: string) {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), wallMat);
      post.position.y = 0.8; post.castShadow = true;
      g.add(post);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.08), wallMat);
      sign.position.set(0.5, 1.4, 0); sign.castShadow = true;
      g.add(sign);
      // label canvas
      const cv = document.createElement("canvas");
      cv.width = 256; cv.height = 96;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "#3a2818"; ctx.fillRect(0, 0, 256, 96);
      ctx.fillStyle = "#f0d0a0";
      ctx.font = "bold 28px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 128, 48);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const front = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.45),
        new THREE.MeshBasicMaterial({ map: tex }));
      front.position.set(0.5, 1.4, 0.05);
      g.add(front);
      g.position.set(x, 0, z);
      scene.add(g);
    }
    makeSignpost(2, 6, "VILLAGE");
    makeSignpost(35, -20, "SLOPE");
    makeSignpost(15, -5, "CABIN");

    // GRAVESTONES (small cluster)
    function makeGrave(x: number, z: number) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x556070, roughness: 0.95, flatShading: true }));
      g.position.set(x, 0.45, z);
      g.rotation.y = (Math.random() - 0.5) * 0.4;
      g.rotation.z = (Math.random() - 0.5) * 0.1;
      g.castShadow = true;
      scene.add(g);
    }
    for (let i = 0; i < 5; i++) {
      makeGrave(-35 + i * 1.5, -18 + (Math.random() - 0.5) * 1.5);
    }

    // BANNER FLAGS on poles (festive)
    function makeBanner(x: number, z: number, color: number) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a2818 }));
      pole.position.y = 2; pole.castShadow = true;
      g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8),
        new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.7 }));
      flag.position.set(0.7, 3.5, 0);
      g.add(flag);
      g.position.set(x, 0, z);
      scene.add(g);
      return flag;
    }
    const banners = [
      makeBanner(-3, 1, 0xc0263a),
      makeBanner(-11, 1, 0x2a7fff),
      makeBanner(-3, -7, 0xffd866),
      makeBanner(-11, -7, 0x19e07a),
    ];

    // ICICLE STALAGMITES near hill
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 5;
      const h = 1 + Math.random() * 1.5;
      const ic = new THREE.Mesh(
        new THREE.ConeGeometry(0.25, h, 6),
        new THREE.MeshStandardMaterial({
          color: 0xb8e8ff, roughness: 0.1, metalness: 0.5,
          emissive: 0x224488, emissiveIntensity: 0.4,
          transparent: true, opacity: 0.9,
        })
      );
      ic.position.set(45 + Math.cos(a) * r, h / 2, -35 + Math.sin(a) * r);
      ic.castShadow = true;
      scene.add(ic);
    }

    // SNOWBALL PICKUPS (interactable)
    const snowballPickups: { group: THREE.Group; pos: THREE.Vector3; collected: boolean }[] = [];
    function makeSnowballPickup(x: number, z: number) {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x6699ff, emissiveIntensity: 0.4, roughness: 0.5 })
      );
      ball.position.y = 0.4;
      ball.castShadow = true;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.6, 24),
        new THREE.MeshBasicMaterial({ color: 0x66ddff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      g.add(ball, ring);
      g.position.set(x, 0, z);
      scene.add(g);
      snowballPickups.push({ group: g, pos: new THREE.Vector3(x, 0, z), collected: false });
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 25;
      makeSnowballPickup(Math.cos(a) * r, Math.sin(a) * r);
    }

    // FALLING SNOW
    const snowGeo = new THREE.BufferGeometry();
    const snowCount = 700;
    const snowPos = new Float32Array(snowCount * 3);
    const snowVel = new Float32Array(snowCount);
    for (let i = 0; i < snowCount; i++) {
      snowPos[i * 3] = (Math.random() - 0.5) * 220;
      snowPos[i * 3 + 1] = Math.random() * 80;
      snowPos[i * 3 + 2] = (Math.random() - 0.5) * 220;
      snowVel[i] = 1.5 + Math.random() * 2.5;
    }
    snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
    const snow = new THREE.Points(
      snowGeo,
      new THREE.PointsMaterial({
        map: partTex, color: 0xffffff, size: 0.45, transparent: true,
        opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    scene.add(snow);

    // PLAYER AURA
    const auraGeo = new THREE.BufferGeometry();
    const auraCount = 30;
    const auraPos = new Float32Array(auraCount * 3);
    const auraData: { angle: number; radius: number; speed: number; height: number }[] = [];
    for (let i = 0; i < auraCount; i++) {
      auraData.push({
        angle: Math.random() * Math.PI * 2,
        radius: 0.6 + Math.random() * 0.8,
        speed: 0.5 + Math.random() * 1.5,
        height: Math.random() * 2,
      });
    }
    auraGeo.setAttribute("position", new THREE.BufferAttribute(auraPos, 3));
    const aura = new THREE.Points(
      auraGeo,
      new THREE.PointsMaterial({
        map: partTex, color: 0x66ddff, size: 0.35, transparent: true,
        opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    scene.add(aura);

    // FOOTSTEP PUFFS
    const stepGeo = new THREE.BufferGeometry();
    const stepCount = 60;
    const stepPos = new Float32Array(stepCount * 3);
    const stepData: { life: number; vx: number; vy: number; vz: number }[] = [];
    for (let i = 0; i < stepCount; i++) {
      stepData.push({ life: 0, vx: 0, vy: 0, vz: 0 });
      stepPos[i * 3 + 1] = -100;
    }
    stepGeo.setAttribute("position", new THREE.BufferAttribute(stepPos, 3));
    const stepPuff = new THREE.Points(
      stepGeo,
      new THREE.PointsMaterial({
        map: partTex, color: 0xffffff, size: 0.4, transparent: true,
        opacity: 0.7, depthWrite: false,
      })
    );
    scene.add(stepPuff);
    let stepIdx = 0;
    function spawnStep(x: number, z: number) {
      for (let k = 0; k < 4; k++) {
        const i = stepIdx % stepCount;
        stepIdx++;
        stepPos[i * 3] = x + (Math.random() - 0.5) * 0.4;
        stepPos[i * 3 + 1] = 0.1;
        stepPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
        stepData[i].life = 0.8;
        stepData[i].vx = (Math.random() - 0.5) * 0.5;
        stepData[i].vy = 1.5 + Math.random();
        stepData[i].vz = (Math.random() - 0.5) * 0.5;
      }
    }

    // HIT BURST
    const hitGeo = new THREE.BufferGeometry();
    const hitCount = 40;
    const hitPos = new Float32Array(hitCount * 3);
    const hitVel = new Float32Array(hitCount * 3);
    let hitLife = 0;
    hitGeo.setAttribute("position", new THREE.BufferAttribute(hitPos, 3));
    const hitBurst = new THREE.Points(
      hitGeo,
      new THREE.PointsMaterial({
        map: partTex, color: 0xffd866, size: 0.8, transparent: true,
        opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    scene.add(hitBurst);
    function spawnHitBurst(at: THREE.Vector3, color = 0xffd866) {
      hitLife = 0.5;
      (hitBurst.material as THREE.PointsMaterial).color.setHex(color);
      for (let i = 0; i < hitCount; i++) {
        hitPos[i * 3] = at.x;
        hitPos[i * 3 + 1] = at.y;
        hitPos[i * 3 + 2] = at.z;
        hitVel[i * 3] = (Math.random() - 0.5) * 8;
        hitVel[i * 3 + 1] = Math.random() * 6;
        hitVel[i * 3 + 2] = (Math.random() - 0.5) * 8;
      }
      (hitGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // THROWN SNOWBALLS
    const projectiles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
    function throwSnowball(from: THREE.Vector3, dir: THREE.Vector3) {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x4488ff, emissiveIntensity: 0.5 })
      );
      ball.position.copy(from);
      ball.castShadow = true;
      scene.add(ball);
      const vel = dir.clone().normalize().multiplyScalar(20);
      vel.y += 4;
      projectiles.push({ mesh: ball, vel, life: 3 });
    }

    // Player ground glow
    const playerGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 32),
      new THREE.MeshBasicMaterial({
        color: 0x66ddff, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    playerGlow.rotation.x = -Math.PI / 2;
    scene.add(playerGlow);

    // LOAD CHARACTERS
    const loader = new GLTFLoader();
    let player: THREE.Object3D | null = null;
    let playerMixer: THREE.AnimationMixer | null = null;
    let playerActions: Record<string, THREE.AnimationAction> = {};
    let currentAction: THREE.AnimationAction | null = null;

    let npc: THREE.Object3D | null = null;
    let npcMixer: THREE.AnimationMixer | null = null;

    let enemy: THREE.Object3D | null = null;
    let enemyMixer: THREE.AnimationMixer | null = null;
    let enemyActions: Record<string, THREE.AnimationAction> = {};
    let enemyCurrent: THREE.AnimationAction | null = null;

    function fadeTo(action: THREE.AnimationAction | null, target: THREE.AnimationAction | null, duration = 0.3) {
      if (target === action) return target;
      if (action) action.fadeOut(duration);
      if (target) target.reset().fadeIn(duration).play();
      return target;
    }

    function tintMaterials(obj: THREE.Object3D, tint: THREE.Color, emissive: THREE.Color, eI = 0) {
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const mesh = o as THREE.Mesh;
          mesh.castShadow = true; mesh.receiveShadow = true;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat && mat.color) {
            mat.color.multiply(tint);
            if (mat.emissive) {
              mat.emissive.copy(emissive);
              mat.emissiveIntensity = eI;
            }
          }
        }
      });
    }

    let loaded = 0;
    const total = 3;
    function progress() {
      loaded++;
      setLoadProgress(Math.round((loaded / total) * 100));
      if (loaded === total) setTimeout(() => setLoading(false), 200);
    }

    loader.load(SOLDIER_URL, (gltf) => {
      player = gltf.scene;
      player.scale.setScalar(1.4);
      player.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          (o as THREE.Mesh).castShadow = true;
          (o as THREE.Mesh).receiveShadow = true;
        }
      });
      scene.add(player);
      playerMixer = new THREE.AnimationMixer(player);
      gltf.animations.forEach((clip) => {
        playerActions[clip.name] = playerMixer!.clipAction(clip);
      });
      currentAction = playerActions["Idle"] || Object.values(playerActions)[0];
      currentAction?.play();
      progress();
    }, undefined, () => progress());

    loader.load(SOLDIER_URL, (gltf) => {
      npc = gltf.scene;
      npc.scale.setScalar(1.4);
      npc.position.set(-7, 0, -3);
      npc.rotation.y = Math.PI / 4;
      tintMaterials(npc, new THREE.Color(0xffd0a0), new THREE.Color(0x442200), 0.25);
      scene.add(npc);
      npcMixer = new THREE.AnimationMixer(npc);
      const idle = gltf.animations.find((c) => c.name === "Idle");
      if (idle) npcMixer.clipAction(idle).play();
      progress();
    }, undefined, () => progress());

    loader.load(SOLDIER_URL, (gltf) => {
      enemy = gltf.scene;
      enemy.scale.setScalar(1.55);
      enemy.position.set(18, 0, 12);
      tintMaterials(enemy, new THREE.Color(0xff8888), new THREE.Color(0x550000), 0.5);
      scene.add(enemy);
      enemyMixer = new THREE.AnimationMixer(enemy);
      gltf.animations.forEach((clip) => {
        enemyActions[clip.name] = enemyMixer!.clipAction(clip);
      });
      enemyCurrent = enemyActions["Idle"] || Object.values(enemyActions)[0];
      enemyCurrent?.play();

      const eGlow = new THREE.Mesh(
        new THREE.CircleGeometry(1.6, 32),
        new THREE.MeshBasicMaterial({
          color: 0xff2233, transparent: true, opacity: 0.45,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      eGlow.rotation.x = -Math.PI / 2;
      eGlow.position.y = 0.05;
      enemy.add(eGlow);

      const eLight = new THREE.PointLight(0xff3344, 1.8, 9);
      eLight.position.y = 1.5;
      enemy.add(eLight);

      progress();
    }, undefined, () => progress());

    // NPC marker
    const npcMarker = makeMarker(0xffd866);
    npcMarker.position.set(-7, 0.05, -3);
    scene.add(npcMarker);
    const npcLight = new THREE.PointLight(0xffd866, 1.0, 8);
    npcLight.position.set(-7, 2.2, -3);
    scene.add(npcLight);

    // INPUT
    const keys: Record<string, boolean> = {};
    let yaw = 0;
    let pitch = 0;
    let velY = 0;
    let onGround = true;
    let attackTimer = 0;

    function tryJump() {
      if (player && onGround && !stateRef.current.snowboarding) {
        velY = 8;
        onGround = false;
      }
    }

    function tryAttack() {
      if (!player || !enemy) return;
      const now = performance.now();
      if (now - stateRef.current.lastAttack < 1000) return;
      if (!stateRef.current.enemyAlive) return;
      const d = player.position.distanceTo(enemy.position);
      if (d > 3) return;
      stateRef.current.lastAttack = now;
      attackTimer = 0.5;
      const newHp = Math.max(0, stateRef.current.enemyHp - 25);
      setEnemyHp(newHp);
      const mid = new THREE.Vector3().addVectors(player.position, enemy.position).multiplyScalar(0.5);
      mid.y += 1.4;
      spawnHitBurst(mid);
      if (newHp <= 0) killEnemy();
    }

    function killEnemy() {
      setEnemyAlive(false);
      if (enemy) {
        const fall = setInterval(() => {
          if (!enemy) { clearInterval(fall); return; }
          enemy.rotation.x += 0.15;
          enemy.position.y -= 0.05;
          if (enemy.rotation.x > Math.PI / 2) {
            clearInterval(fall);
            setTimeout(() => { if (enemy) enemy.visible = false; }, 1500);
          }
        }, 30);
      }
    }

    function tryThrow() {
      if (!player) return;
      const now = performance.now();
      if (now - stateRef.current.lastThrow < 600) return;
      if (stateRef.current.snowballs <= 0) {
        notify("No snowballs! Find more on the ground.");
        return;
      }
      stateRef.current.lastThrow = now;
      setSnowballs((v) => Math.max(0, v - 1));
      // Camera-forward direction (works for FPV and TPV — throws toward where you're looking)
      const useDir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const from = new THREE.Vector3(player.position.x, player.position.y + 1.5, player.position.z);
      from.add(useDir.clone().multiplyScalar(0.7));
      throwSnowball(from, useDir);
    }

    const npcDialog = [
      { speaker: "NPC", text: "Hey traveler — that beast in the woods is terrorizing us." },
      { speaker: "You", text: "Hand me the fight. I'll deal with it." },
      { speaker: "NPC", text: "Take care. Return when the deed is done." },
    ];

    function tryInteract() {
      const now = performance.now();
      if (now - stateRef.current.lastInteract < 250) return;
      stateRef.current.lastInteract = now;

      if (!player) return;

      // Snowball pickup
      for (const sb of snowballPickups) {
        if (sb.collected) continue;
        if (player.position.distanceTo(sb.pos) < 1.5) {
          sb.collected = true;
          sb.group.visible = false;
          setSnowballs((v) => v + 1);
          notify("+1 Snowball");
          return;
        }
      }

      // Campfire heal
      if (player.position.distanceTo(campfirePos) < 3) {
        if (stateRef.current.hp < 100) {
          setHp(100);
          notify("Rested by the fire — Vitality restored.");
        } else {
          notify("You feel warm by the fire.");
        }
        return;
      }

      // Hill snowboard
      if (!stateRef.current.snowboarding) {
        if (player.position.distanceTo(hillTrigger) < 3.5) {
          setSnowboarding(true);
          player.position.set(45, 18, -35);
          velY = 0;
          return;
        }
      }

      // NPC dialog
      if (!npc) return;
      const dNpc = player.position.distanceTo(npc.position);
      if (dNpc < 3.5) {
        const cur = stateRef.current;
        if (cur.quest === "none") {
          cur.dialogStep++;
          if (cur.dialogStep < npcDialog.length) {
            setDialog(npcDialog[cur.dialogStep]);
          } else {
            setDialog(null);
            cur.dialogStep = -1;
            setQuest("active");
            notify("Quest accepted: Defeat the beast");
          }
        } else if (cur.quest === "active") {
          if (!cur.enemyAlive) {
            setDialog({ speaker: "NPC", text: "Incredible. You're a true hero. Thank you." });
            setQuest("done");
            notify("Quest complete!");
          } else {
            setDialog({ speaker: "NPC", text: "The beast still stalks the woods. Defeat it first." });
          }
        } else {
          setDialog({ speaker: "NPC", text: "Safe travels, hero." });
        }
      } else {
        setDialog(null);
      }
    }

    const downHandler = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === "1") setCamMode("first");
      if (e.key === "2") setCamMode("third");
      if (e.key === "3") setCamMode("top");
      if (e.key.toLowerCase() === "f") tryAttack();
      if (e.key.toLowerCase() === "g") tryThrow();
      if (e.key.toLowerCase() === "e") tryInteract();
      if (e.key.toLowerCase() === "h") setShowControls((v) => !v);
      if (e.key === " ") { e.preventDefault(); tryJump(); }
    };
    const upHandler = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", downHandler);
    window.addEventListener("keyup", upHandler);

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === renderer.domElement) {
        yaw -= e.movementX * 0.0025;
        pitch -= e.movementY * 0.0022;
        pitch = Math.max(-1.0, Math.min(1.0, pitch));
      }
    };
    const onClick = () => {
      try {
        const p = renderer.domElement.requestPointerLock?.();
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => {});
        }
      } catch {}
    };
    renderer.domElement.addEventListener("click", onClick);
    window.addEventListener("mousemove", onMouseMove);

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      bloom.setSize(w * 0.5, h * 0.5);
    };
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    let raf = 0;
    let lastEnemyAttack = 0;
    let walkDist = 0;
    let lastFpsTime = performance.now();
    let frameCount = 0;

    // Real top-down minimap camera
    const miniCam = new THREE.OrthographicCamera(-28, 28, 28, -28, 0.1, 200);
    miniCam.position.set(0, 80, 0);
    miniCam.up.set(0, 0, -1);
    miniCam.lookAt(0, 0, 0);
    const MINI_SIZE = 160;
    const MINI_MARGIN = 14;

    function animate() {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = performance.now() * 0.001;

      // FPS
      frameCount++;
      if (performance.now() - lastFpsTime > 500) {
        setFps(Math.round((frameCount * 1000) / (performance.now() - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = performance.now();
      }

      // Snow falling
      const sp = snow.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < snowCount; i++) {
        let y = sp.getY(i) - dt * snowVel[i];
        let x = sp.getX(i) + dt * Math.sin(t * 0.5 + i) * 0.5;
        if (y < 0) {
          y = 60 + Math.random() * 20;
          x = (Math.random() - 0.5) * 220;
          sp.setZ(i, (Math.random() - 0.5) * 220);
        }
        sp.setY(i, y);
        sp.setX(i, x);
      }
      sp.needsUpdate = true;

      // Tree sway
      for (const td of treeData) {
        td.group.rotation.z = Math.sin(t * 0.8 + td.phase) * 0.04;
      }

      // Banner sway
      for (let i = 0; i < banners.length; i++) {
        banners[i].rotation.y = Math.sin(t * 1.5 + i) * 0.25;
      }

      // Chimney smoke
      const smp = smoke.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < smokeCount; i++) {
        const d = smokeData[i];
        d.life -= dt;
        if (d.life <= 0) {
          d.life = 2.5 + Math.random();
          smp.setX(i, chimneyWorld.x + (Math.random() - 0.5) * 0.2);
          smp.setY(i, chimneyWorld.y);
          smp.setZ(i, chimneyWorld.z + (Math.random() - 0.5) * 0.2);
        } else {
          smp.setX(i, smp.getX(i) + d.drift * dt);
          smp.setY(i, smp.getY(i) + d.vy * dt);
          smp.setZ(i, smp.getZ(i) + 0.3 * dt);
        }
      }
      smp.needsUpdate = true;
      // cabin window flicker
      cabinLight.intensity = 1.3 + Math.sin(t * 6) * 0.2;

      // Campfire flicker
      fireLight.intensity = 3.0 + Math.sin(t * 12) * 0.5 + Math.random() * 0.5;
      // Fire particles
      const fp = fire.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < fireCount; i++) {
        const d = fireData[i];
        d.life -= dt;
        if (d.life <= 0) {
          d.life = d.max;
          d.vx = (Math.random() - 0.5) * 0.3;
          d.vy = 1.5 + Math.random() * 1.2;
          d.vz = (Math.random() - 0.5) * 0.3;
          fp.setX(i, campfirePos.x + (Math.random() - 0.5) * 0.4);
          fp.setY(i, 0.3);
          fp.setZ(i, campfirePos.z + (Math.random() - 0.5) * 0.4);
        } else {
          fp.setX(i, fp.getX(i) + d.vx * dt);
          fp.setY(i, fp.getY(i) + d.vy * dt);
          fp.setZ(i, fp.getZ(i) + d.vz * dt);
        }
      }
      fp.needsUpdate = true;

      // Lantern flicker
      for (const l of lanterns) {
        l.light.intensity = l.baseIntensity + Math.sin(t * 8 + l.phase) * 0.3 + (Math.random() - 0.5) * 0.2;
      }

      // Snowball pickup hover anim
      for (const sb of snowballPickups) {
        if (sb.collected) continue;
        sb.group.position.y = Math.sin(t * 2 + sb.pos.x) * 0.15;
        sb.group.rotation.y += dt * 1.5;
      }

      // Aura
      if (player) {
        const ap = aura.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < auraCount; i++) {
          const d = auraData[i];
          d.angle += dt * d.speed;
          d.height = (d.height + dt * 0.6) % 2.4;
          ap.setX(i, player.position.x + Math.cos(d.angle) * d.radius);
          ap.setY(i, player.position.y + d.height);
          ap.setZ(i, player.position.z + Math.sin(d.angle) * d.radius);
        }
        ap.needsUpdate = true;
        playerGlow.position.set(player.position.x, 0.05, player.position.z);
        playerGlow.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
      }

      // Footstep puffs
      const stp = stepPuff.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < stepCount; i++) {
        const d = stepData[i];
        if (d.life > 0) {
          d.life -= dt;
          stp.setX(i, stp.getX(i) + d.vx * dt);
          stp.setY(i, stp.getY(i) + d.vy * dt);
          stp.setZ(i, stp.getZ(i) + d.vz * dt);
          d.vy -= 4 * dt;
        } else {
          stp.setY(i, -100);
        }
      }
      stp.needsUpdate = true;

      // Hit burst
      if (hitLife > 0) {
        hitLife -= dt;
        const hp_ = hitGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < hitCount; i++) {
          hp_.setX(i, hp_.getX(i) + hitVel[i * 3] * dt);
          hp_.setY(i, hp_.getY(i) + hitVel[i * 3 + 1] * dt);
          hp_.setZ(i, hp_.getZ(i) + hitVel[i * 3 + 2] * dt);
          hitVel[i * 3 + 1] -= 18 * dt;
        }
        hp_.needsUpdate = true;
        (hitBurst.material as THREE.PointsMaterial).opacity = Math.max(0, hitLife * 2);
      } else {
        (hitBurst.material as THREE.PointsMaterial).opacity = 0;
      }

      // Projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.vel.y -= 18 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.life -= dt;
        let hit = false;
        if (enemy && stateRef.current.enemyAlive) {
          if (p.mesh.position.distanceTo(enemy.position.clone().add(new THREE.Vector3(0, 1, 0))) < 1.2) {
            const newHp = Math.max(0, stateRef.current.enemyHp - 15);
            setEnemyHp(newHp);
            spawnHitBurst(p.mesh.position.clone(), 0x66ddff);
            if (newHp <= 0) killEnemy();
            hit = true;
          }
        }
        if (p.mesh.position.y <= 0 || p.life <= 0 || hit) {
          spawnHitBurst(p.mesh.position.clone(), 0xffffff);
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
        }
      }

      // PLAYER MOVEMENT
      if (player) {
        if (stateRef.current.snowboarding) {
          player.position.y -= dt * 9;
          player.position.x -= dt * 7;
          player.position.z += dt * 9;
          player.rotation.y = Math.atan2(-1, 1);
          if (player.position.y <= 0) {
            player.position.y = 0;
            setSnowboarding(false);
          }
          if (currentAction !== playerActions["Run"]) {
            currentAction = fadeTo(currentAction, playerActions["Run"]);
          }
        } else {
          let mx = 0, mz = 0;
          if (keys["w"]) mz -= 1;
          if (keys["s"]) mz += 1;
          if (keys["a"]) mx -= 1;
          if (keys["d"]) mx += 1;

          const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
          const right = new THREE.Vector3(forward.z, 0, -forward.x);
          const moveDir = new THREE.Vector3();
          moveDir.addScaledVector(forward, -mz);
          moveDir.addScaledVector(right, mx);

          const moving = moveDir.lengthSq() > 0;
          const wantSprint = keys["shift"] && stateRef.current.stamina > 5;
          if (moving) {
            moveDir.normalize();
            const speed = wantSprint ? 8 : 5;
            player.position.addScaledVector(moveDir, speed * dt);

            if (wantSprint) {
              setStamina((v) => Math.max(0, v - dt * 25));
            }

            const targetYaw = Math.atan2(moveDir.x, moveDir.z) + Math.PI;
            let curY = player.rotation.y;
            let diff = targetYaw - curY;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            player.rotation.y = curY + diff * Math.min(1, dt * 14);

            const target = wantSprint ? playerActions["Run"] : playerActions["Walk"];
            if (target && currentAction !== target) {
              currentAction = fadeTo(currentAction, target);
            }

            // footsteps
            walkDist += speed * dt;
            if (walkDist > 1.0 && onGround) {
              walkDist = 0;
              spawnStep(player.position.x, player.position.z);
            }
          } else {
            if (currentAction !== playerActions["Idle"]) {
              currentAction = fadeTo(currentAction, playerActions["Idle"]);
            }
          }

          // Stamina regen
          if (!wantSprint || !moving) {
            setStamina((v) => Math.min(100, v + dt * 18));
          }

          // Gravity
          velY -= 22 * dt;
          player.position.y += velY * dt;
          if (player.position.y <= 0) {
            player.position.y = 0;
            velY = 0;
            onGround = true;
          }
        }
        playerMixer?.update(dt);
      }
      npcMixer?.update(dt);

      // ENEMY AI
      if (enemy && stateRef.current.enemyAlive && player) {
        const toPlayer = new THREE.Vector3().subVectors(player.position, enemy.position);
        toPlayer.y = 0;
        const dist = toPlayer.length();
        if (dist < 16 && dist > 1.6) {
          toPlayer.normalize();
          enemy.position.addScaledVector(toPlayer, 3 * dt);
          enemy.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
          const target = enemyActions["Run"] || enemyActions["Walk"];
          if (target && enemyCurrent !== target) {
            enemyCurrent = fadeTo(enemyCurrent, target);
          }
        } else {
          const target = enemyActions["Idle"];
          if (target && enemyCurrent !== target) {
            enemyCurrent = fadeTo(enemyCurrent, target);
          }
        }
        if (dist < 1.8) {
          const now = performance.now();
          if (now - lastEnemyAttack > 900) {
            lastEnemyAttack = now;
            const newHp = Math.max(0, stateRef.current.hp - 10);
            setHp(newHp);
            setHitFlash((v) => v + 1);
            const mid = new THREE.Vector3().addVectors(player.position, enemy.position).multiplyScalar(0.5);
            mid.y += 1.2;
            spawnHitBurst(mid, 0xff3344);
          }
        }
        enemyMixer?.update(dt);
      } else if (enemyMixer) {
        enemyMixer.update(dt);
      }

      // Proximity
      if (player && npc) setNearNpc(player.position.distanceTo(npc.position) < 3.5);
      if (player) setNearHill(player.position.distanceTo(hillTrigger) < 3.5 && !stateRef.current.snowboarding);
      if (player) setNearCampfire(player.position.distanceTo(campfirePos) < 3);

      // Markers
      const ms = 1 + Math.sin(t * 3) * 0.15;
      npcMarker.scale.setScalar(ms);
      hillMarker.scale.setScalar(1 + Math.sin(t * 3.5) * 0.18);
      npcMarker.rotation.z += dt * 0.6;
      hillMarker.rotation.z += dt * 0.6;

      // CAMERA
      if (player) {
        const head = new THREE.Vector3(player.position.x, player.position.y + 1.7, player.position.z);
        if (stateRef.current.camMode === "first") {
          const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
          camera.position.copy(head);
          camera.lookAt(head.clone().add(dir));
        } else if (stateRef.current.camMode === "top") {
          camera.position.set(player.position.x, 38, player.position.z + 0.01);
          camera.lookAt(player.position);
        } else {
          const distance = stateRef.current.snowboarding ? 16 : 8;
          const offset = new THREE.Vector3(
            -Math.sin(yaw) * distance,
            4 + Math.sin(pitch) * 3,
            -Math.cos(yaw) * distance
          );
          const target = head.clone().add(offset);
          camera.position.lerp(target, 0.15);
          camera.lookAt(head);
        }
      }

      composer.render();

      // REAL TOP-DOWN MINIMAP RENDER (overlays main viewport)
      if (player) {
        miniCam.position.set(player.position.x, 80, player.position.z);
        miniCam.lookAt(player.position.x, 0, player.position.z);
      }
      const W = mount.clientWidth, H = mount.clientHeight;
      // y in WebGL is bottom-left origin, so top-right means y = H - size - topMargin
      const x = W - MINI_SIZE - MINI_MARGIN;
      const y = H - MINI_SIZE - MINI_MARGIN;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.setScissorTest(true);
      renderer.setScissor(x, y, MINI_SIZE, MINI_SIZE);
      renderer.setViewport(x, y, MINI_SIZE, MINI_SIZE);
      renderer.render(scene, miniCam);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, W, H);
      renderer.autoClear = true;
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", downHandler);
      window.removeEventListener("keyup", upHandler);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onClick);
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      renderer.dispose();
      composer.dispose();
    };
  }, []);

  const dead = hp <= 0;
  const atkCD = Math.max(0, 1000 - (performance.now() - stateRef.current.lastAttack));
  const throwCD = Math.max(0, 600 - (performance.now() - stateRef.current.lastThrow));

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div ref={mountRef} className="absolute inset-0" />

      <div key={hitFlash} className={hitFlash > 0 ? "absolute inset-0 hit-flash pointer-events-none" : "absolute inset-0 pointer-events-none"} />

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: "linear-gradient(135deg, #0a0e1a 0%, #14213d 100%)", zIndex: 50 }}>
          <div className="hud-label glow-cyan text-3xl mb-2" style={{ fontFamily: "Orbitron" }}>SNOW RPG</div>
          <div className="text-xs hud-label opacity-60 mb-8" style={{ letterSpacing: "0.3em" }}>LOADING ASSETS</div>
          <div className="loading-bar mb-3" />
          <div className="text-xs glow-cyan font-mono">{loadProgress}%</div>
        </div>
      )}

      {/* TOP-LEFT: Vitality + Stamina + FPS */}
      <div className="absolute top-3 left-3 space-y-2 pointer-events-none" style={{ zIndex: 10 }}>
        <div className="hud-panel hud-corner px-3 py-2 w-64">
          <div className="flex items-center justify-between mb-1">
            <div className="hud-label glow-green text-[9px]">▰ VITALITY</div>
            <div className="text-[10px] font-mono glow-green">{hp}/100</div>
          </div>
          <div className="hud-bar-bg h-2.5 rounded-sm">
            <div className="hud-bar-fill hp-fill rounded-sm" style={{ width: `${hp}%` }} />
          </div>
          <div className="flex items-center justify-between mb-1 mt-2">
            <div className="hud-label text-[9px]" style={{ color: "#ffd866", textShadow: "0 0 8px rgba(255,216,102,0.6)" }}>▰ STAMINA</div>
            <div className="text-[10px] font-mono" style={{ color: "#ffd866" }}>{Math.round(stamina)}</div>
          </div>
          <div className="hud-bar-bg h-1.5 rounded-sm">
            <div className="hud-bar-fill rounded-sm" style={{ width: `${stamina}%`, backgroundColor: "#ffd866", boxShadow: "0 0 8px #ffd866" }} />
          </div>
        </div>
        {enemyAlive && (
          <div className="hud-panel hud-corner px-3 py-2 w-64">
            <div className="flex items-center justify-between mb-1">
              <div className="hud-label glow-red text-[9px]">⚠ HOSTILE</div>
              <div className="text-[10px] font-mono glow-red">{enemyHp}/80</div>
            </div>
            <div className="hud-bar-bg h-2.5 rounded-sm">
              <div className="hud-bar-fill enemy-fill rounded-sm" style={{ width: `${(enemyHp / 80) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* TOP-RIGHT: Minimap frame overlay (the live camera renders behind via WebGL viewport) */}
      <div className="absolute pointer-events-none" style={{ top: 14, right: 14, width: 160, height: 160, zIndex: 10 }}>
        <div className="absolute inset-0" style={{
          border: "1px solid rgba(120,200,255,0.6)",
          boxShadow: "0 0 16px rgba(80,140,255,0.4), inset 0 0 12px rgba(0,0,0,0.5)",
          clipPath: "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)",
        }} />
        <div className="absolute" style={{ top: 4, left: 8, fontSize: 9, fontFamily: "Orbitron", color: "#7fc4ff", textShadow: "0 0 6px #7fc4ff", letterSpacing: "0.2em", fontWeight: 700 }}>
          ⊕ RADAR
        </div>
        {/* center crosshair on minimap */}
        <div className="absolute" style={{
          left: "50%", top: "50%", width: 10, height: 10, transform: "translate(-50%,-50%)",
          border: "1.5px solid #19e07a", borderRadius: "50%", boxShadow: "0 0 6px #19e07a",
        }} />
      </div>

      {/* Quest panel — moved below minimap */}
      <div className="absolute pointer-events-none hud-panel hud-corner px-3 py-2" style={{ top: 14 + 160 + 10, right: 14, width: 220, zIndex: 10 }}>
        <div className="hud-label glow-yellow text-[9px] mb-1">▸ QUEST</div>
        {quest === "none" && <div className="text-xs">Speak with the wandering NPC.</div>}
        {quest === "active" && enemyAlive && <div className="text-xs">Hunt the corrupted beast.</div>}
        {quest === "active" && !enemyAlive && <div className="text-xs glow-green">Return to NPC.</div>}
        {quest === "done" && <div className="text-xs glow-green">✓ Complete</div>}
      </div>

      {/* BOTTOM-CENTER: Unity-style Ability Hotbar */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-3 pointer-events-none" style={{ zIndex: 10 }}>
        <div className="flex items-end gap-2">
          <AbilitySlot keyLabel="F" name="ATTACK" color="#ff3a55" cooldown={atkCD / 1000} cdMax={1} />
          <AbilitySlot keyLabel="G" name="THROW" color="#66ddff" cooldown={throwCD / 600} cdMax={1} count={snowballs} />
          <AbilitySlot keyLabel="␣" name="JUMP" color="#19e07a" />
          <AbilitySlot keyLabel="E" name="USE" color="#ffd866" />
        </div>
        <div className="flex justify-center mt-1">
          <div className="text-[9px] hud-label opacity-50">PRESS <span className="key-cap" style={{ height: 16, minWidth: 16, fontSize: 9 }}>H</span> FOR CONTROLS</div>
        </div>
      </div>

      {/* BOTTOM-LEFT: Controls (toggleable, compact) */}
      <div className="absolute bottom-3 left-3" style={{ zIndex: 10 }}>
        {showControls ? (
          <div className="hud-panel hud-corner px-3 py-3 pointer-events-none" style={{ width: 220 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="hud-label glow-cyan text-[9px]">⌖ CONTROLS</div>
              <div className="text-[8px] opacity-60">[H] HIDE</div>
            </div>
            <div className="space-y-1 text-[10px]">
              <div className="flex items-center gap-1.5"><span className="key-cap">W</span><span className="key-cap">A</span><span className="key-cap">S</span><span className="key-cap">D</span><span className="opacity-70 ml-1">Move</span></div>
              <div className="flex items-center gap-1.5"><span className="key-cap">⇧</span><span className="opacity-70">Sprint</span></div>
              <div className="flex items-center gap-1.5"><span className="key-cap">␣</span><span className="opacity-70">Jump</span></div>
              <div className="flex items-center gap-1.5"><span className="key-cap">F</span><span className="opacity-70">Attack</span></div>
              <div className="flex items-center gap-1.5"><span className="key-cap">G</span><span className="opacity-70">Throw snowball</span></div>
              <div className="flex items-center gap-1.5"><span className="key-cap">E</span><span className="opacity-70">Interact</span></div>
              <div className="flex items-center gap-1.5"><span className="key-cap">1</span><span className="key-cap">2</span><span className="key-cap">3</span><span className="opacity-70">Camera</span></div>
              <div className="flex items-center gap-1.5"><span className="opacity-70">Mouse</span><span className="opacity-50">— Look (click to lock)</span></div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowControls(true)}
            className="hud-panel hud-corner px-3 py-2 cursor-pointer flex items-center gap-2"
            style={{ border: "1px solid rgba(120,200,255,0.5)" }}
          >
            <span className="key-cap">H</span>
            <span className="hud-label glow-cyan text-[10px]">CONTROLS</span>
          </button>
        )}
      </div>

      {/* BOTTOM-RIGHT: Cam mode + FPS */}
      <div className="absolute bottom-3 right-3 space-y-2 pointer-events-none" style={{ zIndex: 10 }}>
        {snowboarding && (
          <div className="hud-panel hud-corner px-3 py-1.5 pulse">
            <span className="hud-label glow-cyan text-[10px]">⛷ SNOWBOARDING</span>
          </div>
        )}
        <div className="hud-panel hud-corner px-3 py-1.5 flex gap-1.5">
          {(["first", "third", "top"] as CamMode[]).map((m, i) => (
            <div key={m} className={`px-1.5 py-0.5 text-[9px] hud-label ${camMode === m ? "glow-cyan" : "opacity-40"}`}>
              {i + 1}·{m === "first" ? "FPV" : m === "third" ? "TPV" : "TOP"}
            </div>
          ))}
        </div>
        <div className="hud-panel hud-corner px-3 py-1 text-[9px] hud-label opacity-70">
          FPS <span className="glow-green">{fps}</span>
        </div>
      </div>

      {/* Notification (top-center) */}
      {notification && (
        <div className="absolute left-1/2 -translate-x-1/2 top-24 pointer-events-none" style={{ zIndex: 25 }}>
          <div className="hud-panel hud-corner px-5 py-2 pulse">
            <span className="hud-label glow-yellow text-xs">{notification}</span>
          </div>
        </div>
      )}

      {/* Interact prompts (above hotbar but not blocking center) */}
      {(nearNpc || nearHill || nearCampfire) && !dialog && !loading && (
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ zIndex: 15, bottom: 110 }}>
          <div className="hud-panel hud-corner px-4 py-2 flex items-center gap-3 pulse">
            <span className="key-cap">E</span>
            <span className="hud-label text-xs">
              {nearNpc && <span className="glow-yellow">TALK TO NPC</span>}
              {!nearNpc && nearCampfire && <span className="glow-yellow">REST AT CAMPFIRE</span>}
              {!nearNpc && !nearCampfire && nearHill && <span className="glow-cyan">START SNOWBOARD</span>}
            </span>
          </div>
        </div>
      )}

      {/* Dialog */}
      {dialog && (
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ zIndex: 20, bottom: 110 }}>
          <div className="dialog-box px-7 py-5" style={{ width: 600, maxWidth: "92vw" }}>
            <div className="hud-label glow-yellow text-[11px] mb-2">◆ {dialog.speaker}</div>
            <div className="text-base leading-relaxed" style={{ fontFamily: "Rajdhani", fontWeight: 500 }}>{dialog.text}</div>
            <div className="text-[10px] mt-3 opacity-60 hud-label">PRESS <span className="key-cap" style={{ height: 18, minWidth: 18, fontSize: 9 }}>E</span> TO CONTINUE</div>
          </div>
        </div>
      )}

      {/* Death */}
      {dead && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "radial-gradient(circle, rgba(80,0,0,0.7) 0%, rgba(0,0,0,0.95) 100%)", zIndex: 30 }}>
          <div className="text-center">
            <div className="hud-label glow-red text-6xl mb-3" style={{ fontFamily: "Orbitron" }}>YOU DIED</div>
            <div className="text-sm opacity-60 mb-6 hud-label">THE COLD CONSUMED YOU</div>
            <button className="unity-btn" onClick={() => window.location.reload()}>Respawn</button>
          </div>
        </div>
      )}

      {camMode === "first" && !loading && <div className="crosshair" />}
    </div>
  );
}

function AbilitySlot({
  keyLabel, name, color, cooldown = 0, cdMax = 1, count,
}: { keyLabel: string; name: string; color: string; cooldown?: number; cdMax?: number; count?: number }) {
  const cdPct = Math.max(0, Math.min(1, cooldown / cdMax));
  return (
    <div className="relative" style={{ width: 56, height: 56 }}>
      <div
        className="hud-panel"
        style={{
          width: 56, height: 56, position: "relative",
          clipPath: "polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)",
          border: `1px solid ${color}80`,
          boxShadow: `0 0 16px ${color}60, inset 0 0 8px ${color}30`,
          background: `linear-gradient(135deg, rgba(15,25,45,0.95) 0%, rgba(10,15,30,0.98) 100%)`,
        }}
      >
        <div className="absolute top-1 left-1.5 text-[9px] hud-label" style={{ color, textShadow: `0 0 6px ${color}` }}>{keyLabel}</div>
        <div className="absolute bottom-1 left-0 right-0 text-center text-[8px] hud-label" style={{ color, opacity: 0.85 }}>{name}</div>
        {count !== undefined && (
          <div className="absolute top-0.5 right-1 text-[10px] font-mono font-bold" style={{ color: "#fff", textShadow: "0 0 4px rgba(0,0,0,0.8)" }}>×{count}</div>
        )}
        {cdPct > 0 && (
          <div className="absolute inset-0" style={{
            background: `rgba(0,0,0,0.6)`,
            clipPath: `inset(0 0 ${(1 - cdPct) * 100}% 0)`,
          }} />
        )}
      </div>
    </div>
  );
}
