import * as THREE from 'three';
import { createToonMaterial, createToonGradientMap } from './lib';
import { FaceTextureManager } from './character';
import { createPatientTorsoTexture } from './clinicTextures';

export class PatientCharacter {
  public group: THREE.Group;
  public face: FaceTextureManager;

  public torsoGroup: THREE.Group;
  public torsoMesh: THREE.Mesh;
  public headPivot: THREE.Group;
  public headMesh: THREE.Mesh;
  public hairGroup: THREE.Group;
  public faceMesh: THREE.Mesh;

  public hoodCollar: THREE.Mesh;
  public leftDrawstring: THREE.Mesh;
  public rightDrawstring: THREE.Mesh;

  // Arms (Total length 0.65, thick black cylinders radius 0.045, hand radius 0.09)
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

  // Legs (Hanging straight down in front of table face)
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

  private hoodieTexture: THREE.CanvasTexture;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Patient';

    const lightSkin = 0xfedcbd; // Warm peachy skin matching reference image
    const brownHair = 0x221611; // Dark chocolate brown hair swept to side
    const blackLimb = 0x111113; // Bold black stick limbs
    const tealHoodie = 0x00a3af; // Cyan/teal hoodie color
    const shoeColor = 0x1a1a1c;

    const toonRamp = createToonGradientMap(2);

    const skinMaterial = new THREE.MeshToonMaterial({
      color: lightSkin,
      gradientMap: toonRamp,
    });
    const hairMaterial = new THREE.MeshToonMaterial({
      color: brownHair,
      gradientMap: toonRamp,
    });
    const limbMaterial = new THREE.MeshToonMaterial({
      color: blackLimb,
      gradientMap: toonRamp,
    });
    const hoodieMaterial = new THREE.MeshToonMaterial({
      color: tealHoodie,
      gradientMap: toonRamp,
    });
    const shoeMaterial = new THREE.MeshToonMaterial({
      color: shoeColor,
      gradientMap: toonRamp,
    });

    // 1. Torso: Teal Hoodie Capsule (radius: 0.33, length: 0.74)
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 0, 0);
    this.group.add(this.torsoGroup);

    this.hoodieTexture = createPatientTorsoTexture(1024, 1024);
    const torsoMat = new THREE.MeshToonMaterial({
      map: this.hoodieTexture,
      gradientMap: toonRamp,
    });

    const torsoGeom = new THREE.CapsuleGeometry(0.33, 0.74, 16, 24);
    torsoGeom.rotateY(-Math.PI / 2);
    this.torsoMesh = new THREE.Mesh(torsoGeom, torsoMat);
    this.torsoMesh.castShadow = true;
    this.torsoMesh.receiveShadow = true;
    this.torsoGroup.add(this.torsoMesh);

    // Hoodie Details: Small hood collar around neck
    const collarGeom = new THREE.TorusGeometry(0.28, 0.04, 12, 24);
    collarGeom.rotateX(Math.PI / 2.3);
    this.hoodCollar = new THREE.Mesh(collarGeom, hoodieMaterial);
    this.hoodCollar.position.set(0, 0.34, 0.08);
    this.torsoGroup.add(this.hoodCollar);

    // Two short vertical black drawstring lines on upper chest
    const stringGeom = new THREE.CylinderGeometry(0.009, 0.009, 0.18, 12);
    this.leftDrawstring = new THREE.Mesh(stringGeom, limbMaterial);
    this.leftDrawstring.position.set(-0.07, 0.18, 0.338);
    this.torsoGroup.add(this.leftDrawstring);

    this.rightDrawstring = new THREE.Mesh(stringGeom, limbMaterial);
    this.rightDrawstring.position.set(0.07, 0.18, 0.338);
    this.torsoGroup.add(this.rightDrawstring);

    // 2. Head Pivot & Spherical Head (radius: 0.58, pivot: y = 0.92 so chin is at y = 0.34)
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.92, 0);
    this.torsoGroup.add(this.headPivot);

    const headGeom = new THREE.SphereGeometry(0.58, 36, 28);
    this.headMesh = new THREE.Mesh(headGeom, skinMaterial);
    this.headMesh.castShadow = true;
    this.headMesh.receiveShadow = true;
    this.headPivot.add(this.headMesh);

    // Patient Hair: Smooth dark hair swept over to right side
    this.hairGroup = new THREE.Group();

    const hairDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.588, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.44),
      hairMaterial
    );
    hairDome.position.set(0, 0.04, -0.02);
    hairDome.castShadow = true;
    this.hairGroup.add(hairDome);

    const swoopGeom = new THREE.SphereGeometry(
      0.59,
      36,
      24,
      -Math.PI * 0.15,
      Math.PI * 0.55,
      Math.PI * 0.10,
      Math.PI * 0.38
    );
    const swoop = new THREE.Mesh(swoopGeom, hairMaterial);
    swoop.position.set(0, 0.04, -0.02);
    swoop.castShadow = true;
    this.hairGroup.add(swoop);

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

    // 4. Arms: Total length 0.65 (upper 0.33, forearm 0.32), thick radius 0.045, hand radius 0.09
    // Shoulders placed at mid-torso height y = 0.18 (clearly below chin at 0.34), x = ±0.40, z = +0.18 (in front of body)
    const armRadius = 0.045;
    const upperArmLen = 0.33;
    const foreArmLen = 0.32;
    const handRadius = 0.09;

    // --- Left Arm (x = -0.40, upper chest y = 0.18, z = +0.18):
    // Swings OUTWARD to the left (-X), resting beside hip on table
    this.leftShoulder = new THREE.Group();
    this.leftShoulder.position.set(-0.40, 0.18, 0.18);
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

    // Negative rotation swings arm OUTWARD to the left (-X)
    this.leftShoulder.rotation.z = -0.38;
    this.leftShoulder.rotation.x = 0.14;
    this.leftElbow.rotation.z = 0.20;

    // --- Right Arm (x = +0.40, upper chest y = 0.18, z = +0.18):
    // Swings OUTWARD to the right (+X), resting beside hip on table
    this.rightShoulder = new THREE.Group();
    this.rightShoulder.position.set(0.40, 0.18, 0.18);
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

    // Positive rotation swings arm OUTWARD to the right (+X)
    this.rightShoulder.rotation.z = 0.38;
    this.rightShoulder.rotation.x = 0.14;
    this.rightElbow.rotation.z = -0.20;

    // 5. Legs: Positioned at front edge of torso (z = +0.10)
    // Hanging straight down from mattress height (y = -0.70) down to y = -1.56 (0.26 above floor)
    const legRadius = 0.038;
    const thighPart = 0.44;
    const shinPart = 0.42;

    // --- Left Leg ---
    this.leftHip = new THREE.Group();
    this.leftHip.position.set(-0.16, -0.70, 0.10);
    this.torsoGroup.add(this.leftHip);

    const lThighGeom = new THREE.CylinderGeometry(legRadius, legRadius, thighPart, 16);
    lThighGeom.translate(0, -thighPart / 2, 0);
    this.leftThigh = new THREE.Mesh(lThighGeom, limbMaterial);
    this.leftThigh.castShadow = true;
    this.leftHip.add(this.leftThigh);

    this.leftKnee = new THREE.Group();
    this.leftKnee.position.set(0, -thighPart, 0);
    this.leftHip.add(this.leftKnee);

    const lShinGeom = new THREE.CylinderGeometry(legRadius, legRadius, shinPart, 16);
    lShinGeom.translate(0, -shinPart / 2, 0);
    this.leftShin = new THREE.Mesh(lShinGeom, limbMaterial);
    this.leftShin.castShadow = true;
    this.leftKnee.add(this.leftShin);

    const shoeGeom = new THREE.CapsuleGeometry(0.065, 0.18, 12, 16);
    shoeGeom.rotateX(Math.PI / 2);
    this.leftFoot = new THREE.Mesh(shoeGeom, shoeMaterial);
    this.leftFoot.position.set(0, -shinPart, 0.06);
    this.leftFoot.castShadow = true;
    this.leftKnee.add(this.leftFoot);

    // --- Right Leg ---
    this.rightHip = new THREE.Group();
    this.rightHip.position.set(0.16, -0.70, 0.10);
    this.torsoGroup.add(this.rightHip);

    const rThighGeom = new THREE.CylinderGeometry(legRadius, legRadius, thighPart, 16);
    rThighGeom.translate(0, -thighPart / 2, 0);
    this.rightThigh = new THREE.Mesh(rThighGeom, limbMaterial);
    this.rightThigh.castShadow = true;
    this.rightHip.add(this.rightThigh);

    this.rightKnee = new THREE.Group();
    this.rightKnee.position.set(0, -thighPart, 0);
    this.rightHip.add(this.rightKnee);

    const rShinGeom = new THREE.CylinderGeometry(legRadius, legRadius, shinPart, 16);
    rShinGeom.translate(0, -shinPart / 2, 0);
    this.rightShin = new THREE.Mesh(rShinGeom, limbMaterial);
    this.rightShin.castShadow = true;
    this.rightKnee.add(this.rightShin);

    this.rightFoot = new THREE.Mesh(shoeGeom.clone(), shoeMaterial);
    this.rightFoot.position.set(0, -shinPart, 0.06);
    this.rightFoot.castShadow = true;
    this.rightKnee.add(this.rightFoot);
  }

  /**
   * Deterministic idle breathing, listening nod, and gentle leg sway
   */
  public update(time: number, frame: number): void {
    // 1. Subtle breathing
    const breath = Math.sin(time * 2.6);
    this.torsoGroup.position.y = breath * 0.012;

    // 2. Attentive nodding
    const nod = Math.sin(time * 2.2);
    this.headPivot.rotation.x = Math.max(0, nod) * 0.09;
    this.headPivot.rotation.y = -0.15 + breath * 0.02;

    // 3. Resting arms with subtle breathing motion
    this.leftShoulder.rotation.z = -0.38 - breath * 0.015;
    this.rightShoulder.rotation.z = 0.38 + breath * 0.015;

    // 4. Subtle dangling feet sway in front of the table
    const footSway = Math.sin(time * 1.8) * 0.05;
    this.leftHip.rotation.x = footSway;
    this.rightHip.rotation.x = -footSway * 0.7;

    // 5. Periodic natural blinking
    const localBlink = (frame + 35) % 90;
    if (localBlink >= 0 && localBlink <= 4) {
      this.face.setExpression('blink', 'smile');
    } else {
      this.face.setExpression('dot', 'smile');
    }
  }

  public dispose(): void {
    this.face.dispose();
    this.hoodieTexture.dispose();
  }
}
