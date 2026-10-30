import * as THREE from 'three';

export interface TextTextureOptions {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
  width?: number;
  height?: number;
  align?: 'left' | 'center' | 'right';
}

export interface SignTextureOptions {
  type?: 'warning' | 'stop' | 'info' | 'direction';
  title: string;
  subtitle?: string;
  icon?: string;
  width?: number;
  height?: number;
}

export interface UiScreenOptions {
  theme?: 'terminal' | 'cyber' | 'retro-mac' | 'game';
  title?: string;
  lines?: string[];
  progressPercent?: number; // 0 to 100
  width?: number;
  height?: number;
  showStatusBar?: boolean;
}

/**
 * Creates dynamic high-resolution text texture on 2D canvas
 */
export function createCanvasTextTexture(options: TextTextureOptions): {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  updateText: (newText: string) => void;
} {
  const width = options.width ?? 1024;
  const height = options.height ?? 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d')!;
  let currentText = options.text;

  const render = () => {
    ctx.clearRect(0, 0, width, height);

    // Background
    if (options.backgroundColor) {
      ctx.fillStyle = options.backgroundColor;
      if (options.borderRadius) {
        drawRoundedRect(ctx, 10, 10, width - 20, height - 20, options.borderRadius);
        ctx.fill();
      } else {
        ctx.fillRect(0, 0, width, height);
      }
    }

    // Border
    if (options.borderColor && options.borderWidth) {
      ctx.strokeStyle = options.borderColor;
      ctx.lineWidth = options.borderWidth;
      if (options.borderRadius) {
        drawRoundedRect(ctx, 10, 10, width - 20, height - 20, options.borderRadius);
        ctx.stroke();
      } else {
        ctx.strokeRect(10, 10, width - 20, height - 20);
      }
    }

    // Text configuration
    const fontSize = options.fontSize ?? 64;
    const fontFamily = options.fontFamily ?? '"Arial Black", "Impact", "Helvetica Neue", sans-serif';
    ctx.font = `900 ${fontSize}px ${fontFamily}`;
    ctx.textAlign = options.align ?? 'center';
    ctx.textBaseline = 'middle';

    const x = options.align === 'left' ? 40 : options.align === 'right' ? width - 40 : width / 2;
    const y = height / 2;

    // Stroke
    if (options.strokeColor && options.strokeWidth) {
      ctx.strokeStyle = options.strokeColor;
      ctx.lineWidth = options.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(currentText, x, y);
    }

    // Fill
    ctx.fillStyle = options.textColor ?? '#ffffff';
    ctx.fillText(currentText, x, y);
  };

  render();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  return {
    texture,
    canvas,
    updateText: (newText: string) => {
      currentText = newText;
      render();
      texture.needsUpdate = true;
    },
  };
}

/**
 * Creates cartoon warning, stop, and info signs for environments
 */
export function createSignTexture(options: SignTextureOptions): {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
} {
  const width = options.width ?? 512;
  const height = options.height ?? 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const type = options.type ?? 'warning';

  if (type === 'warning') {
    // Yellow caution sign with hazard borders
    ctx.fillStyle = '#feca57';
    drawRoundedRect(ctx, 16, 16, width - 32, height - 32, 36);
    ctx.fill();

    ctx.strokeStyle = '#222f3e';
    ctx.lineWidth = 14;
    ctx.stroke();

    // Inner black triangle
    ctx.fillStyle = '#222f3e';
    ctx.beginPath();
    ctx.moveTo(width / 2, 80);
    ctx.lineTo(width - 90, height - 160);
    ctx.lineTo(90, height - 160);
    ctx.closePath();
    ctx.fill();

    // Inner exclamation mark
    ctx.fillStyle = '#feca57';
    ctx.fillRect(width / 2 - 10, 160, 20, 90);
    ctx.beginPath();
    ctx.arc(width / 2, 290, 12, 0, Math.PI * 2);
    ctx.fill();

    // Text
    ctx.fillStyle = '#222f3e';
    ctx.font = '900 38px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(options.title.toUpperCase(), width / 2, height - 90);

    if (options.subtitle) {
      ctx.font = '700 22px sans-serif';
      ctx.fillText(options.subtitle, width / 2, height - 52);
    }
  } else if (type === 'stop') {
    // Red Octagon
    ctx.fillStyle = '#ee5253';
    ctx.beginPath();
    const cx = width / 2;
    const cy = height / 2;
    const r = width / 2 - 24;
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4 + Math.PI / 8;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // White inner border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 12;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 68px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(options.title.toUpperCase(), cx, cy);
  } else {
    // Info / Direction sign (vibrant blue)
    ctx.fillStyle = '#2e86de';
    drawRoundedRect(ctx, 16, 16, width - 32, height - 32, 28);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 48px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(options.title, width / 2, height / 2 - 10);

    if (options.subtitle) {
      ctx.font = '600 24px sans-serif';
      ctx.fillText(options.subtitle, width / 2, height / 2 + 50);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  return { texture, canvas };
}

/**
 * Creates dynamic cartoon UI screens (terminals, sci-fi consoles, smart devices)
 */
export function createUiScreenTexture(options: UiScreenOptions = {}): {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  renderUiFrame: (frame: number) => void;
} {
  const width = options.width ?? 640;
  const height = options.height ?? 480;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const theme = options.theme ?? 'terminal';
  const title = options.title ?? 'SYSTEM V1.0';
  const lines = options.lines ?? [
    '> INITIALIZING CORE...',
    '> LOAD_ASSETS [OK]',
    '> ANGLE_OPENGL [CONNECTED]',
    '> READY FOR STREAM.',
  ];

  const renderUiFrame = (frame: number) => {
    ctx.clearRect(0, 0, width, height);

    // 1. Device Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    if (theme === 'terminal') {
      bgGrad.addColorStop(0, '#0d1117');
      bgGrad.addColorStop(1, '#161b22');
    } else {
      bgGrad.addColorStop(0, '#1e272e');
      bgGrad.addColorStop(1, '#2f3640');
    }
    ctx.fillStyle = bgGrad;
    drawRoundedRect(ctx, 10, 10, width - 20, height - 20, 20);
    ctx.fill();

    // Screen Bezel
    ctx.strokeStyle = '#383e4a';
    ctx.lineWidth = 8;
    ctx.stroke();

    // 2. Title bar / window buttons
    ctx.fillStyle = '#ff5f56';
    ctx.beginPath();
    ctx.arc(36, 36, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffbd2e';
    ctx.beginPath();
    ctx.arc(60, 36, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#27c93f';
    ctx.beginPath();
    ctx.arc(84, 36, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8b949e';
    ctx.font = '700 16px "SF Mono", "Consolas", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 40);

    // Divider line
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 60);
    ctx.lineTo(width - 20, 60);
    ctx.stroke();

    // 3. Screen content / Terminal log lines
    ctx.font = '600 20px "Courier New", monospace';
    ctx.textAlign = 'left';

    lines.forEach((line, idx) => {
      ctx.fillStyle = idx === lines.length - 1 ? '#58a6ff' : '#3fb950';
      ctx.fillText(line, 36, 105 + idx * 36);
    });

    // 4. Deterministic Blinking Cursor
    const cursorY = 105 + lines.length * 36;
    const isCursorOn = Math.floor(frame / 15) % 2 === 0;
    if (isCursorOn) {
      ctx.fillStyle = '#58a6ff';
      ctx.fillRect(36, cursorY - 18, 12, 22);
    }

    // 5. Progress Bar
    const prog = options.progressPercent ?? ((frame % 120) / 120) * 100;
    const barX = 36;
    const barY = height - 60;
    const barW = width - 72;
    const barH = 20;

    // Bar background
    ctx.fillStyle = '#21262d';
    drawRoundedRect(ctx, barX, barY, barW, barH, 10);
    ctx.fill();

    // Filled progress
    const fillW = Math.max(0, Math.min(barW, (barW * prog) / 100));
    ctx.fillStyle = '#00d2d3';
    drawRoundedRect(ctx, barX, barY, fillW, barH, 10);
    ctx.fill();

    // Progress label
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(prog)}%`, width - 42, barY - 8);
  };

  renderUiFrame(0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  return {
    texture,
    canvas,
    renderUiFrame: (frame: number) => {
      renderUiFrame(frame);
      texture.needsUpdate = true;
    },
  };
}

/**
 * Helper to draw rounded rectangle on 2D canvas context
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
