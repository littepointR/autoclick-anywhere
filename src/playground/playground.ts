function logEvent(arena: string, type: string, detail: string, isTrusted: boolean): void {
  const container = document.getElementById('event-logs');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'log-item';
  const trustCls = isTrusted ? 'trusted-yes' : 'trusted-no';
  row.innerHTML = `
    <span>[${arena}] ${type} ${detail}</span>
    <span class="${trustCls}">isTrusted=${String(isTrusted)}</span>
  `;
  container.prepend(row);
  while (container.children.length > 18) {
    container.lastElementChild?.remove();
  }
}

function setupEnvTip(): void {
  const tip = document.getElementById('env-tip');
  if (!tip) return;
  if (window.location.protocol === 'chrome-extension:') {
    tip.textContent = '扩展本地页：Chrome 限制对扩展页附加 CDP，此处默认自动使用 DOM 合成引擎；执行 `npm run playground` 可在 localhost 测试完整 CDP isTrusted=true！';
  } else {
    tip.textContent = 'HTTP 页面模式：可同时验证 CDP 原生可信输入 (isTrusted=true) 与 DOM 静默模式！';
  }
}

function setupDomArena(): void {
  let clicks = 0;
  let dbls = 0;
  let rights = 0;
  let movingHits = 0;
  let movingEnabled = false;
  let movingStep = 0;
  let movingTimer: ReturnType<typeof setInterval> | null = null;

  const clickCountEl = document.getElementById('dom-click-count')!;
  const dblCountEl = document.getElementById('dom-dbl-count')!;
  const rightCountEl = document.getElementById('dom-right-count')!;
  const movingCountEl = document.getElementById('moving-count')!;
  const movingBtn = document.getElementById('moving-target-btn')!;
  const toggleMovingBtn = document.getElementById('toggle-moving-btn')!;
  const scrollBox = document.getElementById('dom-scroll-box')!;
  const scrollPosEl = document.getElementById('dom-scroll-pos')!;

  document.getElementById('dom-click-btn')?.addEventListener('click', (ev) => {
    clicks += 1;
    clickCountEl.textContent = String(clicks);
    logEvent('DOM', 'click', `(${Math.round(ev.clientX)},${Math.round(ev.clientY)})`, ev.isTrusted);
  });

  document.getElementById('dom-dbl-btn')?.addEventListener('dblclick', (ev) => {
    dbls += 1;
    dblCountEl.textContent = String(dbls);
    logEvent('DOM', 'dblclick', `(${Math.round(ev.clientX)},${Math.round(ev.clientY)})`, ev.isTrusted);
  });

  document.getElementById('dom-right-btn')?.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    rights += 1;
    rightCountEl.textContent = String(rights);
    logEvent('DOM', 'contextmenu', `(${Math.round(ev.clientX)},${Math.round(ev.clientY)})`, ev.isTrusted);
  });

  movingBtn.addEventListener('click', (ev) => {
    movingHits += 1;
    movingCountEl.textContent = String(movingHits);
    logEvent('DOM-Move', 'click', `(${Math.round(ev.clientX)},${Math.round(ev.clientY)})`, ev.isTrusted);
  });

  toggleMovingBtn.addEventListener('click', () => {
    movingEnabled = !movingEnabled;
    toggleMovingBtn.textContent = movingEnabled ? '停止移动' : '开启移动';
    if (movingEnabled) {
      movingTimer = setInterval(() => {
        movingStep = (movingStep + 1) % 3;
        const offsets = [0, 95, 190];
        movingBtn.style.transform = `translateX(${offsets[movingStep]}px)`;
      }, 1100);
    } else if (movingTimer) {
      clearInterval(movingTimer);
      movingTimer = null;
      movingBtn.style.transform = 'translateX(0px)';
    }
  });

  scrollBox.addEventListener('scroll', () => {
    scrollPosEl.textContent = `scrollTop: ${Math.round(scrollBox.scrollTop)}px`;
  });
}

function setupCanvas2dArena(): void {
  const canvas = document.getElementById('canvas2d') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const atkEl = document.getElementById('c2d-atk')!;
  const goldEl = document.getElementById('c2d-gold')!;
  const holdEl = document.getElementById('c2d-hold')!;
  const zoomEl = document.getElementById('c2d-zoom')!;

  let atk = 0;
  let gold = 0;
  let hold = 0;
  let zoom = 1;
  let orb = { x: 385, y: 175, r: 24, dragging: false };
  let holdInterval: ReturnType<typeof setInterval> | null = null;

  const buttons = [
    { id: 'atk', label: '⚔️ 攻击 Boss', x: 26, y: 34, w: 148, h: 52, color: '#0284c7' },
    { id: 'gold', label: '💎 采集金币', x: 26, y: 106, w: 148, h: 52, color: '#7c3aed' },
    { id: 'hold', label: '🛡️ 蓄力长按', x: 26, y: 178, w: 148, h: 52, color: '#059669' },
  ];

  const effects: Array<{ x: number; y: number; text: string; life: number }> = [];

  const toCanvasCoords = (ev: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (ev.clientX - rect.left) * scaleX,
      y: (ev.clientY - rect.top) * scaleY,
    };
  };

  canvas.addEventListener('pointerdown', (ev) => {
    const pt = toCanvasCoords(ev);
    if (Math.hypot(pt.x - orb.x, pt.y - orb.y) <= orb.r + 6) {
      orb.dragging = true;
      logEvent('Canvas2D', 'orb-grab', `(${Math.round(pt.x)},${Math.round(pt.y)})`, ev.isTrusted);
      return;
    }

    for (const btn of buttons) {
      if (pt.x >= btn.x && pt.x <= btn.x + btn.w && pt.y >= btn.y && pt.y <= btn.y + btn.h) {
        if (btn.id === 'atk') {
          atk += 1;
          atkEl.textContent = String(atk);
          effects.push({ x: pt.x, y: pt.y, text: '⚔️ -100 HP', life: 1 });
        } else if (btn.id === 'gold') {
          gold += 10;
          goldEl.textContent = String(gold);
          effects.push({ x: pt.x, y: pt.y, text: '💎 +10G', life: 1 });
        } else if (btn.id === 'hold') {
          hold += 1;
          holdEl.textContent = String(hold);
          effects.push({ x: pt.x, y: pt.y, text: '🛡️ 蓄力!', life: 1 });
          if (holdInterval) clearInterval(holdInterval);
          holdInterval = setInterval(() => {
            hold += 1;
            holdEl.textContent = String(hold);
          }, 140);
        }
        logEvent('Canvas2D', `hit:${btn.id}`, `(${Math.round(pt.x)},${Math.round(pt.y)})`, ev.isTrusted);
        return;
      }
    }

    effects.push({ x: pt.x, y: pt.y, text: '•', life: 1 });
    logEvent('Canvas2D', 'pointerdown', `(${Math.round(pt.x)},${Math.round(pt.y)})`, ev.isTrusted);
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!orb.dragging) return;
    const pt = toCanvasCoords(ev);
    orb.x = Math.max(210, Math.min(canvas.width - 30, pt.x));
    orb.y = Math.max(30, Math.min(canvas.height - 30, pt.y));
  });

  const stopHoldOrDrag = (ev: PointerEvent) => {
    if (orb.dragging) {
      orb.dragging = false;
      const pt = toCanvasCoords(ev);
      logEvent('Canvas2D', 'orb-drop', `(${Math.round(pt.x)},${Math.round(pt.y)})`, ev.isTrusted);
    }
    if (holdInterval) {
      clearInterval(holdInterval);
      holdInterval = null;
    }
  };

  canvas.addEventListener('pointerup', stopHoldOrDrag);
  canvas.addEventListener('pointercancel', stopHoldOrDrag);

  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      zoom = Math.max(0.4, Math.min(3, zoom + (ev.deltaY < 0 ? 0.12 : -0.12)));
      zoomEl.textContent = `${zoom.toFixed(2)}x`;
      logEvent('Canvas2D', 'wheel', `ΔY=${Math.round(ev.deltaY)}`, ev.isTrusted);
    },
    { passive: false },
  );

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Subtle cyber grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw Canvas-only buttons
    for (const btn of buttons) {
      ctx.fillStyle = btn.color;
      ctx.beginPath();
      ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    }

    // Drag Arena Box
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.35)';
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(200, 24, 296, 272);
    ctx.setLineDash([]);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(`可拖拽能量球区域 · 缩放 ${zoom.toFixed(2)}x`, 348, 42);

    // Orb
    const scaledR = orb.r * (0.65 + zoom * 0.35);
    const grad = ctx.createRadialGradient(orb.x - 4, orb.y - 4, 4, orb.x, orb.y, scaledR);
    grad.addColorStop(0, '#a5f3fc');
    grad.addColorStop(0.6, '#06b6d4');
    grad.addColorStop(1, 'rgba(139, 92, 246, 0.2)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, scaledR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = orb.dragging ? '#f59e0b' : '#e0f2fe';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Floating hit effects
    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i];
      ctx.fillStyle = `rgba(56, 189, 248, ${fx.life})`;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(fx.text, fx.x, fx.y - (1 - fx.life) * 26);
      fx.life -= 0.03;
      if (fx.life <= 0) effects.splice(i, 1);
    }

    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

function setupWebGlArena(): void {
  const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
  const gl = canvas.getContext('webgl');
  const hitsEl = document.getElementById('wgl-hits')!;
  const rotEl = document.getElementById('wgl-rot')!;
  const zoomEl = document.getElementById('wgl-zoom')!;

  if (!gl) {
    hitsEl.textContent = 'WebGL 不可用';
    return;
  }

  const vsSource = `
    attribute vec3 aPos;
    attribute vec3 aColor;
    uniform float uRotX;
    uniform float uRotY;
    uniform float uScale;
    uniform float uPulse;
    varying vec3 vColor;
    void main() {
      float cx = cos(uRotX), sx = sin(uRotX);
      float cy = cos(uRotY), sy = sin(uRotY);
      vec3 p = aPos * (uScale + uPulse * 0.14);
      // Rotate Y then X
      vec3 py = vec3(p.x * cy - p.z * sy, p.y, p.x * sy + p.z * cy);
      vec3 px = vec3(py.x, py.y * cx - py.z * sx, py.y * sx + py.z * cx);
      float aspect = ${canvas.width}.0 / ${canvas.height}.0;
      gl_Position = vec4(px.x / aspect, px.y, px.z * 0.4, 1.0 + px.z * 0.35);
      vColor = aColor + vec3(uPulse * 0.35);
    }
  `;

  const fsSource = `
    precision mediump float;
    varying vec3 vColor;
    void main() {
      gl_FragColor = vec4(vColor, 1.0);
    }
  `;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  // Octahedron 3D vertices (8 triangles * 3 vertices = 24 vertices)
  const top = [0, 0.72, 0];
  const bot = [0, -0.72, 0];
  const ring = [
    [0.62, 0, 0],
    [0, 0, 0.62],
    [-0.62, 0, 0],
    [0, 0, -0.62],
  ];
  const palette = [
    [0.13, 0.83, 0.93],
    [0.55, 0.36, 0.96],
    [0.96, 0.25, 0.45],
    [0.06, 0.73, 0.51],
  ];

  const data: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 4];
    const c = palette[i];
    const c2 = palette[(i + 2) % 4];
    data.push(...top, ...c, ...a, ...c, ...b, ...c);
    data.push(...bot, ...c2, ...b, ...c2, ...a, ...c2);
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);

  const stride = 6 * 4;
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);

  const aColor = gl.getAttribLocation(prog, 'aColor');
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 3 * 4);

  const uRotX = gl.getUniformLocation(prog, 'uRotX');
  const uRotY = gl.getUniformLocation(prog, 'uRotY');
  const uScale = gl.getUniformLocation(prog, 'uScale');
  const uPulse = gl.getUniformLocation(prog, 'uPulse');

  gl.enable(gl.DEPTH_TEST);

  let hits = 0;
  let rotX = 0.35;
  let rotY = 0.4;
  let zoom = 1.0;
  let pulse = 0;
  let dragging = false;
  let movedDist = 0;
  let lastPt = { x: 0, y: 0 };

  canvas.addEventListener('pointerdown', (ev) => {
    dragging = true;
    movedDist = 0;
    lastPt = { x: ev.clientX, y: ev.clientY };
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const dx = ev.clientX - lastPt.x;
    const dy = ev.clientY - lastPt.y;
    movedDist += Math.hypot(dx, dy);
    rotY += dx * 0.012;
    rotX += dy * 0.012;
    lastPt = { x: ev.clientX, y: ev.clientY };
    rotEl.textContent = `${Math.round((rotX * 180) / Math.PI)}°, ${Math.round((rotY * 180) / Math.PI)}°`;
  });

  const endDrag = (ev: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (movedDist < 8) {
      hits += 1;
      pulse = 1;
      hitsEl.textContent = String(hits);
      logEvent('WebGL', '3D-hit', `(${Math.round(ev.clientX)},${Math.round(ev.clientY)})`, ev.isTrusted);
    } else {
      logEvent('WebGL', 'orbit-drag', `dist=${Math.round(movedDist)}px`, ev.isTrusted);
    }
  };

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      zoom = Math.max(0.45, Math.min(2.2, zoom + (ev.deltaY < 0 ? 0.1 : -0.1)));
      zoomEl.textContent = `${zoom.toFixed(2)}x`;
      logEvent('WebGL', 'wheel', `ΔY=${Math.round(ev.deltaY)}`, ev.isTrusted);
    },
    { passive: false },
  );

  const render = () => {
    if (!dragging) {
      rotY += 0.008;
    }
    if (pulse > 0) {
      pulse = Math.max(0, pulse - 0.04);
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.03, 0.09, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.uniform1f(uRotX, rotX);
    gl.uniform1f(uRotY, rotY);
    gl.uniform1f(uScale, zoom);
    gl.uniform1f(uPulse, pulse);
    gl.drawArrays(gl.TRIANGLES, 0, 24);

    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);
}

setupEnvTip();
setupDomArena();
setupCanvas2dArena();
setupWebGlArena();
document.getElementById('clear-logs-btn')?.addEventListener('click', () => {
  const logs = document.getElementById('event-logs');
  if (logs) logs.innerHTML = '';
});
