import * as THREE from 'three';
import { createToonMaterial, createToonGradientMap } from './lib';
import { FaceTextureManager } from './character';

export class DoctorCharacter {
  public group: THREE.Group;
  public face: FaceTextureManager;

  public torsoGroup: THREE.Group;
  public torsoMesh: THREE.Mesh;
  public headPivot: THREE.Group;
  public headMesh: THREE.Mesh;
  public hairGroup: THREE.Group;
  public faceMesh: THREE.Mesh;
  public stethoscopeGroup: THREE.Group;

  // Arms (Total length 0.70, thick black stick cylinders radius 0.045)
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

  // Legs (Thin black cylinders)
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

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Doctor';

    const tanSkin = 0xd98236; // Warm caramel/tan skin from reference image
    const greyHair = 0xdde3ea; // Clean grey/white anime hair
    const blackLimb = 0x111113; // Bold black stick limbs
    const whiteCoat = 0xfcfcfd; // Pure white lab coat
    const tealShirt = 0x14929a; // Teal scrub shirt
    const silverSteth = 0xa0aec0;
    const shoeColor = 0x1a1a1c;

    const toonRamp = createToonGradientMap(2);

    const skinMaterial = new THREE.MeshToonMaterial({
      color: tanSkin,
      gradientMap: toonRamp,
    });
    const hairMaterial = new THREE.MeshToonMaterial({
      color: greyHair,
      gradientMap: toonRamp,
    });
    const limbMaterial = new THREE.MeshToonMaterial({
      color: blackLimb,
      gradientMap: toonRamp,
    });
    const coatMaterial = new THREE.MeshToonMaterial({
      color: whiteCoat,
      gradientMap: toonRamp,
    });
    const tealMaterial = new THREE.MeshToonMaterial({
      color: tealShirt,
      gradientMap: toonRamp,
    });
    const shoeMaterial = new THREE.MeshToonMaterial({
      color: shoeColor,
      gradientMap: toonRamp,
    });

    // 1. Torso: PURE WHITE LAB COAT CAPSULE (radius: 0.33, length: 0.74)
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 1.48, 0);
    this.group.add(this.torsoGroup);

    const torsoGeom = new THREE.CapsuleGeometry(0.33, 0.74, 16, 24);
    this.torsoMesh = new THREE.Mesh(torsoGeom, coatMaterial);
    this.torsoMesh.castShadow = true;
    this.torsoMesh.receiveShadow = true;
    this.torsoGroup.add(this.torsoMesh);

    // Front Center: Narrow Teal Scrub Shirt Strip (width: 0.22 on +Z face)
    const shirtGeom = new THREE.PlaneGeometry(0.22, 0.62);
    const shirtStrip = new THREE.Mesh(shirtGeom, tealMaterial);
    shirtStrip.position.set(0, 0.04, 0.334);
    shirtStrip.userData = { excludeFromOutline: true };
    this.torsoGroup.add(shirtStrip);

    // Black V-neck collar lines and lab coat lapel outlines
    const lapelLineMat = new THREE.LineBasicMaterial({ color: 0x181818, linewidth: 3 });
    const lapelPoints = [
      new THREE.Vector3(-0.11, 0.35, 0.336),
      new THREE.Vector3(0, 0.12, 0.336),
      new THREE.Vector3(0.11, 0.35, 0.336),
    ];
    const lapelGeom = new THREE.BufferGeometry().setFromPoints(lapelPoints);
    const lapelLine = new THREE.Line(lapelGeom, lapelLineMat);
    lapelLine.userData = { excludeFromOutline: true };
    this.torsoGroup.add(lapelLine);

    // Left and Right coat borders along the teal strip
    const leftBorderPoints = [
      new THREE.Vector3(-0.11, 0.35, 0.336),
      new THREE.Vector3(-0.11, -0.27, 0.336),
    ];
    const leftBorder = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(leftBorderPoints),
      lapelLineMat
    );
    leftBorder.userData = { excludeFromOutline: true };
    this.torsoGroup.add(leftBorder);

    const rightBorderPoints = [
      new THREE.Vector3(0.11, 0.35, 0.336),
      new THREE.Vector3(0.11, -0.27, 0.336),
    ];
    const rightBorder = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(rightBorderPoints),
      lapelLineMat
    );
    rightBorder.userData = { excludeFromOutline: true };
    this.torsoGroup.add(rightBorder);

    // 2. Head Pivot & Spherical Head (radius: 0.58, pivot: y = 0.92 so chin is at y = 0.34)
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.92, 0);
    this.torsoGroup.add(this.headPivot);

    const headGeom = new THREE.SphereGeometry(0.58, 36, 28);
    this.headMesh = new THREE.Mesh(headGeom, skinMaterial);
    this.headMesh.castShadow = true;
    this.headMesh.receiveShadow = true;
    this.headPivot.add(this.headMesh);

    // Doctor Hair: Smooth short grey/white anime hair
    this.hairGroup = new THREE.Group();
    const hairCapGeom = new THREE.SphereGeometry(0.588, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.42);
    const hairCap = new THREE.Mesh(hairCapGeom, hairMaterial);
    hairCap.position.set(0, 0.04, -0.02);
    hairCap.castShadow = true;
    this.hairGroup.add(hairCap);

    // Smooth side sweep
    const sweepGeom = new THREE.SphereGeometry(
      0.59,
      36,
      24,
      Math.PI * 0.72,
      Math.PI * 0.55,
      Math.PI * 0.12,
      Math.PI * 0.35
    );
    const sweep = new THREE.Mesh(sweepGeom, hairMaterial);
    sweep.position.set(0, 0.04, -0.02);
    sweep.castShadow = true;
    this.hairGroup.add(sweep);

    this.headPivot.add(this.hairGroup);

    // 3. 2D Canvas Face on snug Spherical Cap
    this.face = new FaceTextureManager();
    this.face.state.eyes = 'dot';
    this.face.state.mouth = 'smile';
    this.face.redraw();

    const faceGeom = new THREE.SphereGeometry(
      0.584,
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

    // 4. Stethoscope (around upper collarbone area)
    this.stethoscopeGroup = new THREE.Group();
    const stethLoopGeom = new THREE.TorusGeometry(0.16, 0.02, 12, 24, Math.PI * 1.15);
    stethLoopGeom.rotateX(Math.PI / 2.2);
    const stethLoop = new THREE.Mesh(stethLoopGeom, limbMaterial);
    stethLoop.position.set(0, 0.32, 0.16);
    this.stethoscopeGroup.add(stethLoop);

    const bellGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16);
    bellGeom.rotateX(Math.PI / 2);
    const bellMat = new THREE.MeshToonMaterial({ color: silverSteth });
    const bell = new THREE.Mesh(bellGeom, bellMat);
    bell.position.set(-0.06, 0.18, 0.34);
    this.stethoscopeGroup.add(bell);

    this.torsoGroup.add(this.stethoscopeGroup);

    // 5. Arms: Total length 0.70 (upper 0.36, forearm 0.34), thick radius 0.045, hand radius 0.09
    // Shoulders placed at mid-torso height y = 0.18 (clearly below chin at 0.34), x = ±0.40, z = +0.18 (in front of body)
    const armRadius = 0.045;
    const upperArmLen = 0.36;
    const foreArmLen = 0.34;
    const handRadius = 0.09;

    // --- Left Arm (Viewer's left side at x = -0.40):
    // Curves OUTWARD to the left (-X) down to his hip, with a clear gap from the white coat
    this.leftShoulder = new THREE.Group();
    this.leftShoulder.position.set(-0.40, 0.18, 0.16);
    this.torsoGroup.add(this.leftShoulder);

    const lUpperGeom = new THREE.CylinderGeometry(armRadius, armRadius, upperArmLen, 16);
    lUpperGeom.translate(0, -upperArmLen / 2, 0);
    this.leftUpperArm = new THREE.Mesh(lUpperGeom, limbMaterial);
    this.leftUpperArm.castShadow = true;
    this.leftShoulder.add(this.leftUpperArm);

    this.leftElbow = new THREE.Group();
    this.leftElbow.position.set(0, -upperArmLen, 0);
    this.leftShoulder.add(this.leftElbow);

    const lForeGeom = new THREE.CylinderGeometry(armRadius, armRadius, foreArmLen, 16);
    lForeGeom.translate(0, -foreArmLen / 2, 0);
    this.leftForearm = new THREE.Mesh(lForeGeom, limbMaterial);
    this.leftForearm.castShadow = true;
    this.leftElbow.add(this.leftForearm);

    this.leftHand = new THREE.Mesh(new THREE.SphereGeometry(handRadius, 16, 12), skinMaterial);
    this.leftHand.position.set(0, -foreArmLen, 0);
    this.leftHand.castShadow = true;
    this.leftElbow.add(this.leftHand);

    // Left arm pose: negative rotation swings arm OUTWARD to the left (-X)
    this.leftShoulder.rotation.z = -0.38;
    this.leftShoulder.rotation.x = 0.05;
    this.leftElbow.rotation.z = 0.20;

    // --- Right Arm (Doctor's pointing arm on viewer's right side at x = +0.40):
    // Points UP and to the RIGHT (+X, +Y, at z = +0.22) aiming directly at diagram on the blue board
    this.rightShoulder = new THREE.Group();
    this.rightShoulder.position.set(0.40, 0.18, 0.22);
    this.torsoGroup.add(this.rightShoulder);

    const rUpperGeom = new THREE.CylinderGeometry(armRadius, armRadius, upperArmLen, 16);
    rUpperGeom.translate(0, -upperArmLen / 2, 0);
    this.rightUpperArm = new THREE.Mesh(rUpperGeom, limbMaterial);
    this.rightUpperArm.castShadow = true;
    this.rightShoulder.add(this.rightUpperArm);

    this.rightElbow = new THREE.Group();
    this.rightElbow.position.set(0, -upperArmLen, 0);
    this.rightShoulder.add(this.rightElbow);

    const rForeGeom = new THREE.CylinderGeometry(armRadius, armRadius, foreArmLen, 16);
    rForeGeom.translate(0, -foreArmLen / 2, 0);
    this.rightForearm = new THREE.Mesh(rForeGeom, limbMaterial);
    this.rightForearm.castShadow = true;
    this.rightElbow.add(this.rightForearm);

    this.rightHand = new THREE.Mesh(new THREE.SphereGeometry(handRadius, 16, 12), skinMaterial);
    this.rightHand.position.set(0, -foreArmLen, 0);
    this.rightHand.castShadow = true;
    this.rightElbow.add(this.rightHand);

    // Pointing pose: 1.95 rad (~112 deg) raises arm up and to the right (+X, +Y) pointing at chart
    this.rightShoulder.rotation.z = 1.95;
    this.rightShoulder.rotation.x = 0.04;
    this.rightShoulder.rotation.y = 0.02;
    this.rightElbow.rotation.z = -0.10;

    // 6. Legs (Thin black cylinders)
    const legRadius = 0.038;
    const legSegLen = 0.54;

    this.leftHip = new THREE.Group();
    this.leftHip.position.set(-0.16, -0.42, 0);
    this.torsoGroup.add(this.leftHip);

    const lThighGeom = new THREE.CylinderGeometry(legRadius, legRadius, legSegLen, 16);
    lThighGeom.translate(0, -legSegLen / 2, 0);
    this.leftThigh = new THREE.Mesh(lThighGeom, limbMaterial);
    this.leftThigh.castShadow = true;
    this.leftHip.add(this.leftThigh);

    this.leftKnee = new THREE.Group();
    this.leftKnee.position.set(0, -legSegLen, 0);
    this.leftHip.add(this.leftKnee);

    const lShinGeom = new THREE.CylinderGeometry(legRadius, legRadius, legSegLen, 16);
    lShinGeom.translate(0, -legSegLen / 2, 0);
    this.leftShin = new THREE.Mesh(lShinGeom, limbMaterial);
    this.leftShin.castShadow = true;
    this.leftKnee.add(this.leftShin);

    const shoeGeom = new THREE.CapsuleGeometry(0.065, 0.18, 12, 16);
    shoeGeom.rotateX(Math.PI / 2);
    this.leftFoot = new THREE.Mesh(shoeGeom, shoeMaterial);
    this.leftFoot.position.set(0, -legSegLen, 0.06);
    this.leftFoot.castShadow = true;
    this.leftKnee.add(this.leftFoot);

    this.rightHip = new THREE.Group();
    this.rightHip.position.set(0.16, -0.42, 0);
    this.torsoGroup.add(this.rightHip);

    const rThighGeom = new THREE.CylinderGeometry(legRadius, legRadius, legSegLen, 16);
    rThighGeom.translate(0, -legSegLen / 2, 0);
    this.rightThigh = new THREE.Mesh(rThighGeom, limbMaterial);
    this.rightThigh.castShadow = true;
    this.rightHip.add(this.rightThigh);

    this.rightKnee = new THREE.Group();
    this.rightKnee.position.set(0, -legSegLen, 0);
    this.rightHip.add(this.rightKnee);

    const rShinGeom = new THREE.CylinderGeometry(legRadius, legRadius, legSegLen, 16);
    rShinGeom.translate(0, -legSegLen / 2, 0);
    this.rightShin = new THREE.Mesh(rShinGeom, limbMaterial);
    this.rightShin.castShadow = true;
    this.rightKnee.add(this.rightShin);

    this.rightFoot = new THREE.Mesh(shoeGeom.clone(), shoeMaterial);
    this.rightFoot.position.set(0, -legSegLen, 0.06);
    this.rightFoot.castShadow = true;
    this.rightKnee.add(this.rightFoot);
  }

  /**
   * Deterministic idle breathing and doctor pointing animation
   */
  public update(time: number, frame: number): void {
    // 1. Subtle breathing
    const breath = Math.sin(time * 2.8);
    this.torsoGroup.position.y = 1.48 + breath * 0.015;

    // 2. Head subtle turn between board and patient
    const headCycle = Math.sin(time * 1.5);
    this.headPivot.rotation.y = 0.2 + headCycle * 0.1;
    this.headPivot.rotation.x = breath * 0.02;

    // 3. Pointing Arm (Viewer's right side, x = +0.40):
    // Points up and to the right (+X, +Y) directly toward the blue board diagram
    const pointWiggle = Math.sin(time * 3.0) * 0.04;
    this.rightShoulder.rotation.z = 1.95 + pointWiggle;
    this.rightShoulder.rotation.x = 0.04;
    this.rightShoulder.rotation.y = 0.02;
    this.rightElbow.rotation.z = -0.10;

    // 4. Other Arm (Viewer's left side, x = -0.40):
    // Hanging clearly outside torso silhouette to the left (-X) with gap to white coat
    this.leftShoulder.rotation.z = -0.38 - breath * 0.02;
    this.leftShoulder.rotation.x = 0.05;
    this.leftElbow.rotation.z = 0.20;

    // 5. Periodic natural blinking
    const localBlink = frame % 80;
    if (localBlink >= 0 && localBlink <= 4) {
      this.face.setExpression('blink', 'smile');
    } else {
      this.face.setExpression('dot', 'smile');
    }
  }

  public dispose(): void {
    this.face.dispose();
  }
}
