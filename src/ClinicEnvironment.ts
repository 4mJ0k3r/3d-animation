import * as THREE from 'three';
import { createToonMaterial, createToonGradientMap } from './lib';
import { createMedicalChartTexture, createHealthPosterTexture,MEDICAL_CHART_POINTS } from './clinicTextures';
import {createTargets,sceneMark,sceneSeat,scenePoint,levelFloor} from './toon-kit/characters';

export class ClinicEnvironment {
  public group: THREE.Group;
  public readonly doctorMark=new THREE.Object3D();
  public readonly examinationTable:THREE.Group;
  public readonly examinationCushion:THREE.Mesh;
  public readonly medicalChart:THREE.Mesh;
  public readonly floorSurface:THREE.Mesh;
  private chartTexture: THREE.CanvasTexture;
  private posterTexture: THREE.CanvasTexture;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ClinicEnvironment';
    this.doctorMark.name='clinic:doctor-standing';this.doctorMark.position.set(-.95,0,-1.05);this.group.add(this.doctorMark);

    const toonRamp = createToonGradientMap(3);

    // Color palette from the reference image
    const wallColor = 0xf2ece0; // Cream background wall
    const floorColor = 0xe7dfd2; // Warm clinic floor
    const trimGreen = 0x36a695; // Horizontal green stripe
    const examTableGreen = 0x4a5d4e; // Warm olive-green base like reference image
    const cabinetColor = 0xede9de; // Left counter cabinet
    const aluminumColor = 0xd5dce6; // Frame border

    // 1. Floor
    const floorGeom = new THREE.PlaneGeometry(24, 24);
    const floorMat = new THREE.MeshToonMaterial({
      color: floorColor,
      gradientMap: toonRamp,
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    this.floorSurface=floor;floor.name='clinic:floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    floor.receiveShadow = true;
    this.group.add(floor);

    // 2. Back Wall
    const wallGeom = new THREE.PlaneGeometry(24, 12);
    const wallMat = new THREE.MeshToonMaterial({
      color: wallColor,
      gradientMap: toonRamp,
    });
    const backWall = new THREE.Mesh(wallGeom, wallMat);
    backWall.position.set(0, 4.5, -3.0);
    backWall.receiveShadow = true;
    this.group.add(backWall);

    // Horizontal Green Stripe / Wall Rail (from reference)
    const stripeGeom = new THREE.PlaneGeometry(24, 0.16);
    const stripeMat = new THREE.MeshToonMaterial({
      color: trimGreen,
      gradientMap: toonRamp,
    });
    const stripe = new THREE.Mesh(stripeGeom, stripeMat);
    stripe.position.set(0, 2.5, -2.98);
    this.group.add(stripe);

    // Wall Baseboard (bottom trim)
    const baseboardGeom = new THREE.BoxGeometry(24, 0.18, 0.04);
    const baseboardMat = new THREE.MeshToonMaterial({
      color: 0xdfd8ca,
      gradientMap: toonRamp,
    });
    const baseboard = new THREE.Mesh(baseboardGeom, baseboardMat);
    baseboard.position.set(0, 0.09, -2.97);
    this.group.add(baseboard);

    // 3. Medical Diagram Board (Blue Whiteboard behind Doctor)
    this.chartTexture = createMedicalChartTexture(1024, 640);
    const chartGeom = new THREE.PlaneGeometry(2.1, 1.35);
    const chartMat = new THREE.MeshBasicMaterial({ map: this.chartTexture });
    const chart = new THREE.Mesh(chartGeom, chartMat);
    this.medicalChart=chart;chart.name='clinic:medical-chart';
    chart.position.set(-0.6, 2.95, -2.94);
    this.group.add(chart);

    // Aluminum Frame around Board
    const frameGeom = new THREE.BoxGeometry(2.18, 1.43, 0.05);
    const frameMat = new THREE.MeshToonMaterial({
      color: aluminumColor,
      gradientMap: toonRamp,
    });
    const chartFrame = new THREE.Mesh(frameGeom, frameMat);
    chartFrame.position.set(-0.6, 2.95, -2.97);
    chartFrame.castShadow = true;
    this.group.add(chartFrame);

    // 4. Health Poster ("HEALTH - Congenital insensitivity to pain")
    this.posterTexture = createHealthPosterTexture(512, 680);
    const posterGeom = new THREE.PlaneGeometry(0.82, 1.12);
    const posterMat = new THREE.MeshBasicMaterial({ map: this.posterTexture });
    const poster = new THREE.Mesh(posterGeom, posterMat);
    poster.position.set(0.95, 3.02, -2.95);
    this.group.add(poster);

    // Thin frame for poster
    const posterFrameGeom = new THREE.BoxGeometry(0.86, 1.16, 0.02);
    const posterFrame = new THREE.Mesh(posterFrameGeom, frameMat);
    posterFrame.position.set(0.95, 3.02, -2.965);
    this.group.add(posterFrame);

    // 5. Medical Examination Table (where patient sits)
    const tableGroup = new THREE.Group();
    this.examinationTable=tableGroup;tableGroup.name='clinic:examination-table';
    tableGroup.position.set(1.4, 0, -1.2);

    // Table Base Cabinet (teal/green)
    const baseGeom = new THREE.BoxGeometry(2.7, 0.96, 1.15);
    const tableBaseMat = new THREE.MeshToonMaterial({
      color: examTableGreen,
      gradientMap: toonRamp,
    });
    const tableBase = new THREE.Mesh(baseGeom, tableBaseMat);
    tableBase.position.set(0, 0.48, 0);
    tableBase.castShadow = true;
    tableBase.receiveShadow = true;
    tableGroup.add(tableBase);

    // Table Cabinet Horizontal Accent Stripe
    const tabStripeGeom = new THREE.BoxGeometry(2.72, 0.08, 1.17);
    const tabStripeMat = new THREE.MeshToonMaterial({
      color: 0x1d7063,
      gradientMap: toonRamp,
    });
    const tabStripe = new THREE.Mesh(tabStripeGeom, tabStripeMat);
    tabStripe.position.set(0, 0.52, 0);
    tableGroup.add(tabStripe);

    // Examination Cushion (White padded top with dark padded vinyl trim)
    const cushionTrimGeom = new THREE.BoxGeometry(2.82, 0.03, 1.27);
    const cushionTrimMat = new THREE.MeshToonMaterial({
      color: 0x18181b,
      gradientMap: toonRamp,
    });
    const cushionTrim = new THREE.Mesh(cushionTrimGeom, cushionTrimMat);
    cushionTrim.position.set(0, 0.975, 0);
    cushionTrim.castShadow = true;
    tableGroup.add(cushionTrim);

    const cushionGeom = new THREE.BoxGeometry(2.8, 0.14, 1.25);
    const cushionMat = new THREE.MeshToonMaterial({
      color: 0xfdfdfd,
      gradientMap: toonRamp,
    });
    const cushion = new THREE.Mesh(cushionGeom, cushionMat);
    this.examinationCushion=cushion;cushion.name='clinic:examination-cushion';
    cushion.position.set(0, 1.05, 0);
    cushion.castShadow = true;
    cushion.receiveShadow = true;
    tableGroup.add(cushion);

    // White Paper Roll (at the right edge of table)
    const rollGeom = new THREE.CylinderGeometry(0.12, 0.12, 1.15, 24);
    rollGeom.rotateX(Math.PI / 2);
    const rollMat = new THREE.MeshToonMaterial({
      color: 0xede8dc,
      gradientMap: toonRamp,
    });
    const roll = new THREE.Mesh(rollGeom, rollMat);
    roll.position.set(1.24, 1.18, 0);
    roll.castShadow = true;
    tableGroup.add(roll);

    this.group.add(tableGroup);

    // 6. Left Clinic Cabinet / Desk (as seen in reference)
    const cabinetGroup = new THREE.Group();
    cabinetGroup.position.set(-2.5, 0, -2.1);

    const cabGeom = new THREE.BoxGeometry(1.3, 1.45, 1.05);
    const cabMat = new THREE.MeshToonMaterial({
      color: cabinetColor,
      gradientMap: toonRamp,
    });
    const cabinet = new THREE.Mesh(cabGeom, cabMat);
    cabinet.position.set(0, 0.725, 0);
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    cabinetGroup.add(cabinet);

    // Cabinet dark top counter
    const cabTopGeom = new THREE.BoxGeometry(1.36, 0.08, 1.1);
    const cabTopMat = new THREE.MeshToonMaterial({
      color: 0xd6d0c2,
      gradientMap: toonRamp,
    });
    const cabTop = new THREE.Mesh(cabTopGeom, cabTopMat);
    cabTop.position.set(0, 1.49, 0);
    cabTop.castShadow = true;
    cabinetGroup.add(cabTop);

    this.group.add(cabinetGroup);

    // 7. Small Potted Plant (on far right floor)
    const plantGroup = new THREE.Group();
    plantGroup.position.set(2.85, 0, -2.4);

    const potGeom = new THREE.CylinderGeometry(0.18, 0.14, 0.38, 18);
    const potMat = new THREE.MeshToonMaterial({
      color: 0xfdfdfd,
      gradientMap: toonRamp,
    });
    const pot = new THREE.Mesh(potGeom, potMat);
    pot.position.set(0, 0.19, 0);
    pot.castShadow = true;
    plantGroup.add(pot);

    // Plant leaves
    const leafMat = new THREE.MeshToonMaterial({
      color: 0x27ae60,
      gradientMap: toonRamp,
    });
    for (let i = 0; i < 5; i++) {
      const leafGeom = new THREE.ConeGeometry(0.1, 0.42, 6);
      leafGeom.rotateX(0.4);
      leafGeom.rotateY((i * Math.PI * 2) / 5);
      const leaf = new THREE.Mesh(leafGeom, leafMat);
      leaf.position.set(0, 0.42, 0);
      leaf.castShadow = true;
      plantGroup.add(leaf);
    }

    this.group.add(plantGroup);
  }

  /** Optional scene-specific staging. Default construction retains the legacy room. */
  public stageUniversalPortrait():void {
    this.doctorMark.position.set(-1.4,0,-.9);
    this.examinationTable.position.x=.4;this.examinationTable.rotation.y=.45;
  }

  /** Targets read current world transforms; UV coordinates come from the actual texture artwork. */
  public semanticTargets(){
    const geometry=this.medicalChart.geometry;
    if(!geometry.boundingBox)geometry.computeBoundingBox();const box=geometry.boundingBox!;
    const point=(uv:readonly[number,number])=>[box.min.x+(box.max.x-box.min.x)*uv[0],box.max.y-(box.max.y-box.min.y)*uv[1],box.max.z] as const;
    return createTargets({doctor:sceneMark(this.doctorMark),examSeat:sceneSeat(this.examinationCushion),
      diagram:scenePoint(this.medicalChart,point(MEDICAL_CHART_POINTS.node)),diagramHead:scenePoint(this.medicalChart,point(MEDICAL_CHART_POINTS.head))});
  }

  public floorTarget(){return levelFloor(this.floorSurface.getWorldPosition(new THREE.Vector3()).y);}

  public dispose(): void {
    this.chartTexture.dispose();
    this.posterTexture.dispose();
  }
}
