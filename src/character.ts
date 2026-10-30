import * as THREE from 'three';
import { createToonMaterial, createToonGradientMap } from './lib';

export type EyeExpression = 'dot' | 'arc' | 'blink' | 'surprised' | 'happy' | 'squint';
export type MouthExpression = 'neutral' | 'smile' | 'talk' | 'surprised' | 'open';

export interface FaceState {
  eyes: EyeExpression;
  mouth: MouthExpression;
  eyeLookX: number; // -1 to 1
  eyeLookY: number; // -1 to 1
  blush: boolean;
}

export interface CharacterOptions {
  skinColor?: THREE.ColorRepresentation;
  torsoColor?: THREE.ColorRepresentation;
  limbColor?: THREE.ColorRepresentation;
  shoeColor?: THREE.ColorRepresentation;
  beanieColor?: THREE.ColorRepresentation;
  glassesColor?: THREE.ColorRepresentation;
  hasGlasses?: boolean;
  hasBeanie?: boolean;
  scale?: number;
}

export interface PoseOptions {
  headPitch?: number; // radians
  headYaw?: number;
  headRoll?: number;
  torsoPitch?: number;
  torsoYaw?: number;
  leftArmPitch?: number;
  leftArmRoll?: number;
  leftElbowBend?: number;
  rightArmPitch?: number;
  rightArmRoll?: number;
  rightElbowBend?: number;
  leftLegPitch?: number;
  leftKneeBend?: number;
  rightLegPitch?: number;
  rightKneeBend?: number;
  bounceY?: number;
}

/**
 * Creates dynamic 2D canvas texture for cartoon face expressions
 */
export class FaceTextureManager {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public texture: THREE.CanvasTexture;
  public state: FaceState;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d')!;

    this.state = {
      eyes: 'dot',
      mouth: 'smile',
      eyeLookX: 0,
      eyeLookY: 0,
      blush: true,
    };

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.redraw();
  }

  public setExpression(eyes: EyeExpression, mouth: MouthExpression): void {
    this.state.eyes = eyes;
    this.state.mouth = mouth;
    this.redraw();
  }

  public setLook(lookX: number, lookY: number): void {
    this.state.eyeLookX = Math.max(-1, Math.min(1, lookX));
    this.state.eyeLookY = Math.max(-1, Math.min(1, lookY));
    this.redraw();
  }

  public redraw(): void {
    const { ctx, canvas, state } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const eyeCenterY = 220;
    const eyeSpacing = 95;
    const lookOffsetX = state.eyeLookX * 18;
    const lookOffsetY = state.eyeLookY * 14;

    // 1. Cute cartoon blush circles
    if (state.blush) {
      ctx.fillStyle = 'rgba(255, 120, 140, 0.35)';
      ctx.beginPath();
      ctx.arc(w / 2 - eyeSpacing - 20, eyeCenterY + 45, 24, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(w / 2 + eyeSpacing + 20, eyeCenterY + 45, 24, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Eyebrows
    ctx.strokeStyle = '#181818';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.arc(w / 2 - eyeSpacing, eyeCenterY - 32, 22, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w / 2 + eyeSpacing, eyeCenterY - 32, 22, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();

    // 3. Eyes
    ctx.strokeStyle = '#181818';
    ctx.fillStyle = '#181818';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';

    const drawEye = (centerX: number) => {
      const ex = centerX + lookOffsetX;
      const ey = eyeCenterY + lookOffsetY;

      if (state.eyes === 'dot') {
        ctx.beginPath();
        ctx.arc(ex, ey, 14, 0, Math.PI * 2);
        ctx.fill();
        // Catchlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex - 4, ey - 4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#181818';
      } else if (state.eyes === 'arc' || state.eyes === 'happy') {
        ctx.beginPath();
        ctx.arc(centerX, eyeCenterY - 4, 20, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.stroke();
      } else if (state.eyes === 'blink') {
        ctx.beginPath();
        ctx.moveTo(centerX - 18, eyeCenterY);
        ctx.lineTo(centerX + 18, eyeCenterY);
        ctx.stroke();
      } else if (state.eyes === 'surprised') {
        ctx.beginPath();
        ctx.arc(ex, ey, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, ey, 7, 0, Math.PI * 2);
        ctx.fill();
      } else if (state.eyes === 'squint') {
        ctx.beginPath();
        ctx.moveTo(centerX - 16, eyeCenterY - 6);
        ctx.lineTo(centerX, eyeCenterY + 2);
        ctx.lineTo(centerX + 16, eyeCenterY - 6);
        ctx.stroke();
      }
    };

    drawEye(w / 2 - eyeSpacing);
    drawEye(w / 2 + eyeSpacing);

    // 3. Mouth
    const mouthY = 325;
    ctx.strokeStyle = '#222222';
    ctx.fillStyle = '#ff6b6b';
    ctx.lineWidth = 8;

    if (state.mouth === 'smile') {
      ctx.beginPath();
      ctx.arc(w / 2, mouthY - 10, 22, 0.15 * Math.PI, 0.85 * Math.PI, false);
      ctx.stroke();
    } else if (state.mouth === 'talk') {
      ctx.beginPath();
      ctx.ellipse(w / 2, mouthY, 18, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Tongue detail
      ctx.fillStyle = '#ff8787';
      ctx.beginPath();
      ctx.ellipse(w / 2, mouthY + 6, 12, 6, 0, 0, Math.PI);
      ctx.fill();
    } else if (state.mouth === 'open') {
      ctx.beginPath();
      ctx.arc(w / 2, mouthY - 15, 26, 0, Math.PI, false);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (state.mouth === 'surprised') {
      ctx.beginPath();
      ctx.arc(w / 2, mouthY, 12, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Neutral dash
      ctx.beginPath();
      ctx.moveTo(w / 2 - 14, mouthY);
      ctx.lineTo(w / 2 + 14, mouthY);
      ctx.stroke();
    }

    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.texture.dispose();
  }
}

/**
 * Rigged 2.5D Cartoon Character Builder
 */
export class CartoonCharacter {
  public group: THREE.Group;
  public face: FaceTextureManager;

  // Hierarchical Body Rig Nodes
  public torsoGroup: THREE.Group;
  public torsoMesh: THREE.Mesh;
  public headPivot: THREE.Group;
  public headMesh: THREE.Mesh;
  public faceMesh: THREE.Mesh;

  public glassesGroup?: THREE.Group;
  public beanieGroup?: THREE.Group;

  // Stick Limbs (Left / Right Arm)
  public leftShoulder: THREE.Group;
  public leftUpperArm: THREE.Mesh;
  public leftElbow: THREE.Group;
  public leftForearm: THREE.Mesh;
  public leftHand: THREE.Mesh;

  public rightShoulder: THREE.Group;
  public rightUpperArm: THREE.Mesh;
  public rightElbow: THREE.Group;
  public rightForearm: THREE.Mesh;
  public rightHand: THREE.Mesh;

  // Stick Limbs (Left / Right Leg)
  public leftHip: THREE.Group;
  public leftThigh: THREE.Mesh;
  public leftKnee: THREE.Group;
  public leftShin: THREE.Mesh;
  public leftFoot: THREE.Mesh;

  public rightHip: THREE.Group;
  public rightThigh: THREE.Mesh;
  public rightKnee: THREE.Group;
  public rightShin: THREE.Mesh;
  public rightFoot: THREE.Mesh;

  private limbMaterial: THREE.MeshToonMaterial;

  constructor(options: CharacterOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = 'CartoonCharacter';

    const skinColor = options.skinColor ?? 0xffe8d6;
    const torsoColor = options.torsoColor ?? 0xff6b6b; // Warm coral sweater
    const limbColor = options.limbColor ?? 0x1a1a1a; // Pure cartoon ink black stick limbs
    const shoeColor = options.shoeColor ?? 0x2e3440;
    const beanieColor = options.beanieColor ?? 0x48dbfb;
    const glassesColor = options.glassesColor ?? 0x222222;

    const toonRamp = createToonGradientMap(3);

    // Materials
    const skinMaterial = new THREE.MeshToonMaterial({
      color: skinColor,
      gradientMap: toonRamp,
    });
    const torsoMaterial = new THREE.MeshToonMaterial({
      color: torsoColor,
      gradientMap: toonRamp,
    });
    this.limbMaterial = new THREE.MeshToonMaterial({
      color: limbColor,
      gradientMap: toonRamp,
    });
    const shoeMaterial = new THREE.MeshToonMaterial({
      color: shoeColor,
      gradientMap: toonRamp,
    });

    // 1. Torso (Slimmer Rounded Capsule - reduced radius by 25%)
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 1.45, 0);
    this.group.add(this.torsoGroup);

    const torsoGeom = new THREE.CapsuleGeometry(0.32, 0.74, 16, 24);
    this.torsoMesh = new THREE.Mesh(torsoGeom, torsoMaterial);
    this.torsoMesh.castShadow = true;
    this.torsoMesh.receiveShadow = true;
    this.torsoGroup.add(this.torsoMesh);

    // 2. Head Pivot & Large Spherical Head
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.74, 0);
    this.torsoGroup.add(this.headPivot);

    const headGeom = new THREE.SphereGeometry(0.68, 36, 28);
    this.headMesh = new THREE.Mesh(headGeom, skinMaterial);
    this.headMesh.castShadow = true;
    this.headMesh.receiveShadow = true;
    this.headPivot.add(this.headMesh);

    // 3. 2D Canvas Face on offset Spherical Cap (no rectangular box seams)
    this.face = new FaceTextureManager();
    const faceGeom = new THREE.SphereGeometry(
      0.684,
      32,
      16,
      Math.PI * 0.5 - 0.55,
      1.1,
      Math.PI * 0.5 - 0.55,
      1.1
    );
    const faceMat = new THREE.MeshBasicMaterial({
      map: this.face.texture,
      transparent: true,
      depthWrite: false,
    });
    this.faceMesh = new THREE.Mesh(faceGeom, faceMat);
    this.faceMesh.name = 'faceMesh';
    this.faceMesh.userData = { excludeFromOutline: true };
    this.headPivot.add(this.faceMesh);

    // 4. Optional Glasses
    if (options.hasGlasses ?? true) {
      this.glassesGroup = this.buildGlasses(glassesColor);
      this.glassesGroup.position.set(0, 0.08, 0.65);
      this.headPivot.add(this.glassesGroup);
    }

    // 5. Optional Beanie
    if (options.hasBeanie ?? true) {
      this.beanieGroup = this.buildBeanie(beanieColor);
      this.beanieGroup.position.set(0, 0.38, -0.05);
      this.headPivot.add(this.beanieGroup);
    }

    // 6. Arms (Visible thin black cylinders: shoulder x = ±0.36, total arm length = 0.65)
    const armRadius = 0.035;
    const upperArmLen = 0.33;
    const foreArmLen = 0.32;

    // --- Left Arm ---
    this.leftShoulder = new THREE.Group();
    this.leftShoulder.position.set(-0.36, 0.34, 0);
    this.torsoGroup.add(this.leftShoulder);

    const leftUpperGeom = new THREE.CylinderGeometry(armRadius, armRadius, upperArmLen, 16);
    leftUpperGeom.translate(0, -upperArmLen / 2, 0);
    this.leftUpperArm = new THREE.Mesh(leftUpperGeom, this.limbMaterial);
    this.leftUpperArm.castShadow = true;
    this.leftShoulder.add(this.leftUpperArm);

    this.leftElbow = new THREE.Group();
    this.leftElbow.position.set(0, -upperArmLen, 0);
    this.leftShoulder.add(this.leftElbow);

    const leftForeGeom = new THREE.CylinderGeometry(armRadius, armRadius, foreArmLen, 16);
    leftForeGeom.translate(0, -foreArmLen / 2, 0);
    this.leftForearm = new THREE.Mesh(leftForeGeom, this.limbMaterial);
    this.leftForearm.castShadow = true;
    this.leftElbow.add(this.leftForearm);

    this.leftHand = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 12),
      skinMaterial
    );
    this.leftHand.position.set(0, -foreArmLen, 0);
    this.leftHand.castShadow = true;
    this.leftElbow.add(this.leftHand);

    // Upper arm angles slightly OUTWARD (x = -0.46), forearm goes down to x = -0.42
    this.leftShoulder.rotation.z = 0.28;
    this.leftElbow.rotation.z = -0.14;

    // --- Right Arm ---
    this.rightShoulder = new THREE.Group();
    this.rightShoulder.position.set(0.36, 0.34, 0);
    this.torsoGroup.add(this.rightShoulder);

    const rightUpperGeom = new THREE.CylinderGeometry(armRadius, armRadius, upperArmLen, 16);
    rightUpperGeom.translate(0, -upperArmLen / 2, 0);
    this.rightUpperArm = new THREE.Mesh(rightUpperGeom, this.limbMaterial);
    this.rightUpperArm.castShadow = true;
    this.rightShoulder.add(this.rightUpperArm);

    this.rightElbow = new THREE.Group();
    this.rightElbow.position.set(0, -upperArmLen, 0);
    this.rightShoulder.add(this.rightElbow);

    const rightForeGeom = new THREE.CylinderGeometry(armRadius, armRadius, foreArmLen, 16);
    rightForeGeom.translate(0, -foreArmLen / 2, 0);
    this.rightForearm = new THREE.Mesh(rightForeGeom, this.limbMaterial);
    this.rightForearm.castShadow = true;
    this.rightElbow.add(this.rightForearm);

    this.rightHand = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 12),
      skinMaterial
    );
    this.rightHand.position.set(0, -foreArmLen, 0);
    this.rightHand.castShadow = true;
    this.rightElbow.add(this.rightHand);

    // Upper arm angles slightly OUTWARD (x = +0.46), forearm goes down to x = +0.42
    this.rightShoulder.rotation.z = -0.28;
    this.rightElbow.rotation.z = 0.14;

    // 7. Legs (Stick Limbs using thin black cylinders)
    const legRadius = 0.05;
    const legSegLen = 0.52;

    // --- Left Leg ---
    this.leftHip = new THREE.Group();
    this.leftHip.position.set(-0.22, -0.42, 0);
    this.torsoGroup.add(this.leftHip);

    const leftThighGeom = new THREE.CylinderGeometry(legRadius, legRadius, legSegLen, 16);
    leftThighGeom.translate(0, -legSegLen / 2, 0);
    this.leftThigh = new THREE.Mesh(leftThighGeom, this.limbMaterial);
    this.leftThigh.castShadow = true;
    this.leftHip.add(this.leftThigh);

    this.leftKnee = new THREE.Group();
    this.leftKnee.position.set(0, -legSegLen, 0);
    this.leftHip.add(this.leftKnee);

    const leftShinGeom = new THREE.CylinderGeometry(legRadius, legRadius, legSegLen, 16);
    leftShinGeom.translate(0, -legSegLen / 2, 0);
    this.leftShin = new THREE.Mesh(leftShinGeom, this.limbMaterial);
    this.leftShin.castShadow = true;
    this.leftKnee.add(this.leftShin);

    const shoeGeom = new THREE.CapsuleGeometry(0.09, 0.22, 12, 16);
    shoeGeom.rotateX(Math.PI / 2);
    this.leftFoot = new THREE.Mesh(shoeGeom, shoeMaterial);
    this.leftFoot.position.set(0, -legSegLen, 0.08);
    this.leftFoot.castShadow = true;
    this.leftKnee.add(this.leftFoot);

    // --- Right Leg ---
    this.rightHip = new THREE.Group();
    this.rightHip.position.set(0.22, -0.42, 0);
    this.torsoGroup.add(this.rightHip);

    const rightThighGeom = new THREE.CylinderGeometry(legRadius, legRadius, legSegLen, 16);
    rightThighGeom.translate(0, -legSegLen / 2, 0);
    this.rightThigh = new THREE.Mesh(rightThighGeom, this.limbMaterial);
    this.rightThigh.castShadow = true;
    this.rightHip.add(this.rightThigh);

    this.rightKnee = new THREE.Group();
    this.rightKnee.position.set(0, -legSegLen, 0);
    this.rightHip.add(this.rightKnee);

    const rightShinGeom = new THREE.CylinderGeometry(legRadius, legRadius, legSegLen, 16);
    rightShinGeom.translate(0, -legSegLen / 2, 0);
    this.rightShin = new THREE.Mesh(rightShinGeom, this.limbMaterial);
    this.rightShin.castShadow = true;
    this.rightKnee.add(this.rightShin);

    this.rightFoot = new THREE.Mesh(shoeGeom.clone(), shoeMaterial);
    this.rightFoot.position.set(0, -legSegLen, 0.08);
    this.rightFoot.castShadow = true;
    this.rightKnee.add(this.rightFoot);

    if (options.scale) {
      this.group.scale.setScalar(options.scale);
    }
  }

  private buildGlasses(color: THREE.ColorRepresentation): THREE.Group {
    const group = new THREE.Group();
    const frameMat = new THREE.MeshToonMaterial({ color });

    const torusGeom = new THREE.TorusGeometry(0.13, 0.024, 12, 24);

    const leftLens = new THREE.Mesh(torusGeom, frameMat);
    leftLens.position.set(-0.21, 0, 0);
    group.add(leftLens);

    const rightLens = new THREE.Mesh(torusGeom, frameMat);
    rightLens.position.set(0.21, 0, 0);
    group.add(rightLens);

    const bridgeGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.16, 12);
    bridgeGeom.rotateZ(Math.PI / 2);
    const bridge = new THREE.Mesh(bridgeGeom, frameMat);
    bridge.position.set(0, 0.02, 0);
    group.add(bridge);

    return group;
  }

  private buildBeanie(color: THREE.ColorRepresentation): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshToonMaterial({
      color,
      gradientMap: createToonGradientMap(3),
    });

    // Beanie Dome
    const domeGeom = new THREE.SphereGeometry(0.71, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const dome = new THREE.Mesh(domeGeom, mat);
    dome.castShadow = true;
    group.add(dome);

    // Beanie Fold Rim
    const rimGeom = new THREE.TorusGeometry(0.68, 0.08, 14, 28);
    rimGeom.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeom, mat);
    rim.castShadow = true;
    group.add(rim);

    // Pom-pom on top
    const pomGeom = new THREE.SphereGeometry(0.12, 16, 12);
    const pomMat = new THREE.MeshToonMaterial({ color: 0xffffff });
    const pom = new THREE.Mesh(pomGeom, pomMat);
    pom.position.set(0, 0.72, 0);
    pom.castShadow = true;
    group.add(pom);

    return group;
  }

  /**
   * Directly sets joints and poses
   */
  public setPose(pose: PoseOptions): void {
    if (pose.headPitch !== undefined) this.headPivot.rotation.x = pose.headPitch;
    if (pose.headYaw !== undefined) this.headPivot.rotation.y = pose.headYaw;
    if (pose.headRoll !== undefined) this.headPivot.rotation.z = pose.headRoll;

    if (pose.torsoPitch !== undefined) this.torsoGroup.rotation.x = pose.torsoPitch;
    if (pose.torsoYaw !== undefined) this.torsoGroup.rotation.y = pose.torsoYaw;
    if (pose.bounceY !== undefined) this.torsoGroup.position.y = 1.45 + pose.bounceY;

    if (pose.leftArmPitch !== undefined) this.leftShoulder.rotation.x = pose.leftArmPitch;
    if (pose.leftArmRoll !== undefined) this.leftShoulder.rotation.z = pose.leftArmRoll;
    if (pose.leftElbowBend !== undefined) this.leftElbow.rotation.x = pose.leftElbowBend;

    if (pose.rightArmPitch !== undefined) this.rightShoulder.rotation.x = pose.rightArmPitch;
    if (pose.rightArmRoll !== undefined) this.rightShoulder.rotation.z = pose.rightArmRoll;
    if (pose.rightElbowBend !== undefined) this.rightElbow.rotation.x = pose.rightElbowBend;

    if (pose.leftLegPitch !== undefined) this.leftHip.rotation.x = pose.leftLegPitch;
    if (pose.leftKneeBend !== undefined) this.leftKnee.rotation.x = pose.leftKneeBend;

    if (pose.rightLegPitch !== undefined) this.rightHip.rotation.x = pose.rightLegPitch;
    if (pose.rightKneeBend !== undefined) this.rightKnee.rotation.x = pose.rightKneeBend;
  }

  /**
   * Deterministic Walk Cycle based on time/frame (No clocks or random values)
   */
  public walk(timeInSeconds: number, speed: number = 4.0, stride: number = 0.55): void {
    const cycle = timeInSeconds * speed * Math.PI * 2;

    const leftLeg = Math.sin(cycle) * stride;
    const rightLeg = -Math.sin(cycle) * stride;

    const leftArm = -Math.sin(cycle) * stride * 0.75;
    const rightArm = Math.sin(cycle) * stride * 0.75;

    const bounce = Math.abs(Math.cos(cycle)) * 0.08;
    const headBob = Math.sin(cycle * 2) * 0.03;

    this.setPose({
      bounceY: bounce,
      headPitch: headBob,
      leftLegPitch: leftLeg,
      leftKneeBend: Math.max(0, -leftLeg * 0.6),
      rightLegPitch: rightLeg,
      rightKneeBend: Math.max(0, -rightLeg * 0.6),
      leftArmPitch: leftArm,
      leftElbowBend: 0.2,
      rightArmPitch: rightArm,
      rightElbowBend: 0.2,
      torsoYaw: Math.sin(cycle) * 0.08,
    });
  }

  /**
   * Deterministic Idle breathing and subtle head movement
   */
  public idle(timeInSeconds: number): void {
    const breath = Math.sin(timeInSeconds * 2.5);
    this.setPose({
      bounceY: breath * 0.02,
      headPitch: Math.sin(timeInSeconds * 1.5) * 0.04,
      leftArmPitch: 0.05 + breath * 0.03,
      leftArmRoll: 0.15,
      rightArmPitch: 0.05 + breath * 0.03,
      rightArmRoll: -0.15,
      leftLegPitch: 0,
      rightLegPitch: 0,
      leftKneeBend: 0,
      rightKneeBend: 0,
    });
  }

  /**
   * Deterministic Wave gesture
   */
  public wave(timeInSeconds: number): void {
    const waveCycle = Math.sin(timeInSeconds * 8.0);
    this.setPose({
      rightArmRoll: -2.3,
      rightArmPitch: -0.2,
      rightElbowBend: -0.3 + waveCycle * 0.35,
      headRoll: -0.06,
      headPitch: 0.02,
    });
  }

  /**
   * Deterministic Blinking (e.g., blinks once every ~3 seconds for 4 frames)
   */
  public updateBlink(frame: number, periodInFrames: number = 90): void {
    const localFrame = frame % periodInFrames;
    if (localFrame >= 0 && localFrame <= 4) {
      this.face.setExpression('blink', this.face.state.mouth);
    } else if (this.face.state.eyes === 'blink') {
      this.face.setExpression('dot', this.face.state.mouth);
    }
  }

  public dispose(): void {
    this.face.dispose();
    this.limbMaterial.dispose();
  }
}
