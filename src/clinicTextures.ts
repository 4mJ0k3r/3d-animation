import * as THREE from 'three';

/** Shared canvas UV landmarks: origin top-left, normalized independently of resolution. */
export const MEDICAL_CHART_POINTS=Object.freeze({head:Object.freeze([.76,.28] as const),node:Object.freeze([.38,.68] as const)});
/** Pixel drawing metrics shared with semantic content-region bounds. */
export const MEDICAL_CHART_ART=Object.freeze({headRadius:36,lineWidth:14,spineBottom:.82,shoulderDrop:95,armLeft:85,armRight:35,glowRadius:38});

/**
 * Generates the blue medical chart whiteboard texture with the stick figure diagram
 * matching the reference image.
 */
export function createMedicalChartTexture(width = 1024, height = 640): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // 1. Blue board background
  ctx.fillStyle = '#1e65c0';
  ctx.fillRect(0, 0, width, height);

  // Subtle inner border
  ctx.strokeStyle = '#2977d6';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  // 2. White Stick Figure Diagram (right side of chart)
  const figX = width * MEDICAL_CHART_POINTS.head[0];
  const figHeadY = height * MEDICAL_CHART_POINTS.head[1];
  const figSpineBottom = height * MEDICAL_CHART_ART.spineBottom;

  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = MEDICAL_CHART_ART.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Head circle
  ctx.beginPath();
  ctx.arc(figX, figHeadY, MEDICAL_CHART_ART.headRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Spine
  ctx.beginPath();
  ctx.moveTo(figX, figHeadY + MEDICAL_CHART_ART.headRadius);
  ctx.lineTo(figX, figSpineBottom);
  ctx.stroke();

  // Shoulder / arm horizontal bar
  const shoulderY = figHeadY + MEDICAL_CHART_ART.shoulderDrop;
  ctx.beginPath();
  ctx.moveTo(figX - MEDICAL_CHART_ART.armLeft, shoulderY);
  ctx.lineTo(figX + MEDICAL_CHART_ART.armRight, shoulderY);
  ctx.stroke();

  // 3. Dashed Trajectory Arc (connecting spine to target node)
  ctx.save();
  ctx.strokeStyle = '#e0f2fe';
  ctx.lineWidth = 8;
  ctx.setLineDash([16, 12]);

  const targetX = width * MEDICAL_CHART_POINTS.node[0];
  const targetY = height * MEDICAL_CHART_POINTS.node[1];
  const cpX = width * 0.58;
  const cpY = height * 0.32;

  ctx.beginPath();
  ctx.moveTo(figX - MEDICAL_CHART_ART.armLeft, shoulderY);
  ctx.quadraticCurveTo(cpX, cpY, targetX, targetY);
  ctx.stroke();
  ctx.restore();

  // 4. Glowing Yellow Target Node (circle at end of trajectory arc)
  // Outer soft glow
  const glowGrad = ctx.createRadialGradient(targetX, targetY, 4, targetX, targetY, MEDICAL_CHART_ART.glowRadius);
  glowGrad.addColorStop(0, '#fffbeb');
  glowGrad.addColorStop(0.4, '#fef08a');
  glowGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(targetX, targetY, MEDICAL_CHART_ART.glowRadius, 0, Math.PI * 2);
  ctx.fill();

  // Solid yellow node
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(targetX, targetY, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.stroke();

  // 5. Subtle medical grid lines / tick marks
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  for (let x = 60; x < width - 60; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x, height - 40);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Generates the "HEALTH - Congenital insensitivity to pain" wall poster
 * matching the reference image.
 */
export function createHealthPosterTexture(width = 512, height = 680): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // 1. Poster background (clean clinical paper)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Subtle paper border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, width - 12, height - 12);

  // 2. "HEALTH" top banner
  ctx.fillStyle = '#1e7b85';
  ctx.fillRect(40, 40, width - 80, 72);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 36px "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HEALTH', width / 2, 76);

  // 3. Subtitle lines
  ctx.fillStyle = '#1e293b';
  ctx.font = '700 24px "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Congenital', width / 2, 160);
  ctx.fillText('insensitivity', width / 2, 195);
  ctx.fillText('to pain', width / 2, 230);

  // 4. Dumbbell synapse / neural diagram (blue node connected to red node)
  const nodeY = 380;
  const leftX = 140;
  const rightX = width - 140;

  // Connecting wavy nerve path
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(leftX, nodeY);
  ctx.bezierCurveTo(leftX + 60, nodeY - 35, rightX - 60, nodeY + 35, rightX, nodeY);
  ctx.stroke();

  // Left blue node
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(leftX, nodeY, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Right coral/red node
  ctx.fillStyle = '#f87171';
  ctx.beginPath();
  ctx.arc(rightX, nodeY, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 6;
  ctx.stroke();

  // 5. Bottom fake text lines (clinical notes)
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(60, 490, width - 120, 12);
  ctx.fillRect(60, 520, width - 160, 12);
  ctx.fillRect(60, 550, width - 200, 12);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Generates texture for Doctor's torso:
 * Front center prominently shows the teal scrub shirt, with crisp white lab coat
 * side-panels and V-lapels over it, matching the exact reference image.
 */
export function createDoctorTorsoTexture(width = 1024, height = 1024): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const cx = width / 2;

  // 1. White lab coat base for the back and sides
  ctx.fillStyle = '#fcfcfd';
  ctx.fillRect(0, 0, width, height);

  // 2. Teal / turquoise scrub shirt in the front center (cx ± 170px)
  const shirtW = 340;
  ctx.fillStyle = '#14929a';
  ctx.fillRect(cx - shirtW / 2, 0, shirtW, height);

  // V-neck dark collar
  ctx.strokeStyle = '#0e696f';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(cx - 120, 0);
  ctx.lineTo(cx, 240);
  ctx.lineTo(cx + 120, 0);
  ctx.stroke();

  // 3. White Lab Coat Front Borders and Lapels
  ctx.fillStyle = '#fcfcfd';
  ctx.strokeStyle = '#181818';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Left coat front panel outline
  ctx.beginPath();
  ctx.moveTo(cx - shirtW / 2, 0);
  ctx.lineTo(cx - shirtW / 2, height);
  ctx.stroke();

  // Right coat front panel outline
  ctx.beginPath();
  ctx.moveTo(cx + shirtW / 2, 0);
  ctx.lineTo(cx + shirtW / 2, height);
  ctx.stroke();

  // Left Lapel (white folded triangular flap over the teal shirt)
  ctx.beginPath();
  ctx.moveTo(cx - shirtW / 2, 0);
  ctx.lineTo(cx - 90, 180);
  ctx.lineTo(cx - shirtW / 2, 340);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();

  // Right Lapel (white folded flap)
  ctx.beginPath();
  ctx.moveTo(cx + shirtW / 2, 0);
  ctx.lineTo(cx + 90, 180);
  ctx.lineTo(cx + shirtW / 2, 340);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();

  // 4. Stethoscope Tubing (dark navy loop draped across the chest)
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(cx - 110, 0);
  ctx.bezierCurveTo(cx - 120, 240, cx - 80, 480, cx - 45, 520);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + 110, 0);
  ctx.bezierCurveTo(cx + 120, 240, cx + 70, 440, cx - 20, 520);
  ctx.stroke();

  // Stethoscope Bell / Chestpiece (silver disc)
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(cx - 40, 530, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 9;
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Generates texture for Patient's cyan/teal hoodie:
 * Cyan torso, hoodie string accents, and front kangaroo pocket.
 */
export function createPatientTorsoTexture(width = 1024, height = 1024): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Teal/cyan hoodie base
  ctx.fillStyle = '#00a3af';
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;

  // Kangaroo pocket in front
  const pocketW = 440;
  const pocketH = 220;
  const pocketY = height - 320;

  ctx.fillStyle = '#02929d';
  ctx.strokeStyle = '#181818';
  ctx.lineWidth = 14;

  ctx.beginPath();
  ctx.moveTo(cx - pocketW / 2 + 50, pocketY);
  ctx.lineTo(cx + pocketW / 2 - 50, pocketY);
  ctx.lineTo(cx + pocketW / 2, pocketY + pocketH);
  ctx.lineTo(cx - pocketW / 2, pocketY + pocketH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Hoodie collar V-seam
  ctx.strokeStyle = '#181818';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(cx - 100, 0);
  ctx.lineTo(cx, 160);
  ctx.lineTo(cx + 100, 0);
  ctx.stroke();

  // White hoodie strings
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(cx - 45, 140);
  ctx.lineTo(cx - 45, 340);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + 45, 140);
  ctx.lineTo(cx + 45, 340);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
