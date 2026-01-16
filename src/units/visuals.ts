/**
 * This module is responsible for creating the geometry, materials, and meshes for all trackable units.
 */
import * as THREE from 'three';
import {
  MAX_SHIPS,
  MAX_AIRCRAFT,
  MAX_SATELLITES,
  MAX_DRONES,
  EARTH_RADIUS,
  SHIP_ALTITUDE,
  AIRCRAFT_ALTITUDE
} from '../constants';
import glassVertexShader from '../shaders/tracking/glass-vertex.glsl';
import glassFragmentShader from '../shaders/tracking/glass-fragment.glsl';
import satelliteVertexShader from '../shaders/tracking/satellite-vertex.glsl';

function createTrackingGeometry(baseGeometry, maxInstances) {
  const instancedGeometry = new THREE.InstancedBufferGeometry();
  instancedGeometry.index = baseGeometry.index;
  instancedGeometry.attributes.position = baseGeometry.attributes.position;

  if (baseGeometry.attributes.normal) {
    instancedGeometry.attributes.normal = baseGeometry.attributes.normal;
  }

  const latArray = new Float32Array(maxInstances);
  const lonArray = new Float32Array(maxInstances);
  const headingArray = new Float32Array(maxInstances);
  const scaleArray = new Float32Array(maxInstances);

  scaleArray.fill(1.0);

  const latAttr = new THREE.InstancedBufferAttribute(latArray, 1);
  const lonAttr = new THREE.InstancedBufferAttribute(lonArray, 1);
  const headingAttr = new THREE.InstancedBufferAttribute(headingArray, 1);
  const scaleAttr = new THREE.InstancedBufferAttribute(scaleArray, 1);

  latAttr.setUsage(THREE.DynamicDrawUsage);
  lonAttr.setUsage(THREE.DynamicDrawUsage);
  headingAttr.setUsage(THREE.DynamicDrawUsage);
  scaleAttr.setUsage(THREE.DynamicDrawUsage);

  instancedGeometry.setAttribute('aLat', latAttr);
  instancedGeometry.setAttribute('aLon', lonAttr);
  instancedGeometry.setAttribute('aHeading', headingAttr);
  instancedGeometry.setAttribute('aScale', scaleAttr);

  instancedGeometry.userData = {
    latArray,
    lonArray,
    headingArray,
    scaleArray,
    latAttr,
    lonAttr,
    headingAttr,
    scaleAttr,
  };

  return instancedGeometry;
}

// Ship
const shipShape = new THREE.Shape();
shipShape.moveTo(0, 0.02);
shipShape.lineTo(0.012, -0.015);
shipShape.lineTo(0, -0.005);
shipShape.lineTo(-0.012, -0.015);
shipShape.closePath();
const shipBaseGeometry = new THREE.ShapeGeometry(shipShape);
shipBaseGeometry.rotateX(-Math.PI / 2);
shipBaseGeometry.computeVertexNormals();
export const shipGeometry = createTrackingGeometry(shipBaseGeometry, MAX_SHIPS);
export const shipMaterial = new THREE.ShaderMaterial({
  vertexShader: glassVertexShader,
  fragmentShader: glassFragmentShader,
  uniforms: {
    uEarthRadius: { value: EARTH_RADIUS },
    uAltitude: { value: SHIP_ALTITUDE },
    uColor: { value: new THREE.Color(0x2dd4bf) },
    uOpacity: { value: 0.9 },
    uSunDirection: { value: new THREE.Vector3(-1.0, 0.5, 1.0).normalize() },
    uFresnelPower: { value: 2.0 },
    uSpecularPower: { value: 32.0 },
    uGlowColor: { value: new THREE.Color(0x5eead4) },
    uIOR: { value: 1.5 },
    uThickness: { value: 1.0 },
    uReflectivity: { value: 0.3 },
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.NormalBlending,
});
export const shipMesh = new THREE.Mesh(shipGeometry, shipMaterial);
shipMesh.frustumCulled = false;
shipMesh.renderOrder = 1;

// Aircraft
const aircraftShape = new THREE.Shape();
aircraftShape.moveTo(0, 0.025);
aircraftShape.lineTo(0.003, 0.01);
aircraftShape.lineTo(0.02, 0.005);
aircraftShape.lineTo(0.003, 0.0);
aircraftShape.lineTo(0.003, -0.01);
aircraftShape.lineTo(0.01, -0.02);
aircraftShape.lineTo(0.003, -0.015);
aircraftShape.lineTo(0, -0.02);
aircraftShape.lineTo(-0.003, -0.015);
aircraftShape.lineTo(-0.01, -0.02);
aircraftShape.lineTo(-0.003, -0.01);
aircraftShape.lineTo(-0.003, 0.0);
aircraftShape.lineTo(-0.02, 0.005);
aircraftShape.lineTo(-0.003, 0.01);
aircraftShape.closePath();
const aircraftBaseGeometry = new THREE.ShapeGeometry(aircraftShape);
aircraftBaseGeometry.rotateX(-Math.PI / 2);
aircraftBaseGeometry.computeVertexNormals();
export const aircraftGeometry = createTrackingGeometry(aircraftBaseGeometry, MAX_AIRCRAFT);
export const aircraftMaterial = new THREE.ShaderMaterial({
  vertexShader: glassVertexShader,
  fragmentShader: glassFragmentShader,
  uniforms: {
    uEarthRadius: { value: EARTH_RADIUS },
    uAltitude: { value: AIRCRAFT_ALTITUDE },
    uColor: { value: new THREE.Color(0xfbbf24) },
    uOpacity: { value: 0.9 },
    uSunDirection: { value: new THREE.Vector3(-1.0, 0.5, 1.0).normalize() },
    uFresnelPower: { value: 2.0 },
    uSpecularPower: { value: 32.0 },
    uGlowColor: { value: new THREE.Color(0xfde68a) },
    uIOR: { value: 1.5 },
    uThickness: { value: 1.0 },
    uReflectivity: { value: 0.3 },
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.NormalBlending,
});
export const aircraftMesh = new THREE.Mesh(aircraftGeometry, aircraftMaterial);
aircraftMesh.frustumCulled = false;
aircraftMesh.renderOrder = 2;

// Satellite
const satelliteShape = new THREE.Shape();
satelliteShape.moveTo(0, 0.012);
satelliteShape.lineTo(0.004, 0);
satelliteShape.lineTo(0, -0.012);
satelliteShape.lineTo(-0.004, 0);
satelliteShape.closePath();
const satelliteBodyGeom = new THREE.ShapeGeometry(satelliteShape);
const panelShape = new THREE.Shape();
panelShape.moveTo(-0.018, 0.003);
panelShape.lineTo(0.018, 0.003);
panelShape.lineTo(0.018, -0.003);
panelShape.lineTo(-0.018, -0.003);
panelShape.closePath();
const panelGeom = new THREE.ShapeGeometry(panelShape);
const satelliteBaseGeometry = new THREE.BufferGeometry();
const bodyPositions = satelliteBodyGeom.attributes.position.array;
const panelPositions = panelGeom.attributes.position.array;
const mergedPositions = new Float32Array(bodyPositions.length + panelPositions.length);
mergedPositions.set(bodyPositions, 0);
mergedPositions.set(panelPositions, bodyPositions.length);
satelliteBaseGeometry.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
const normalCount = mergedPositions.length / 3;
const normals = new Float32Array(normalCount * 3);
for (let i = 0; i < normalCount; i++) {
  normals[i * 3] = 0;
  normals[i * 3 + 1] = 0;
  normals[i * 3 + 2] = 1;
}
satelliteBaseGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
satelliteBaseGeometry.rotateX(-Math.PI / 2);
export const satelliteGeometry = createTrackingGeometry(satelliteBaseGeometry, MAX_SATELLITES);
export const satelliteMaterial = new THREE.ShaderMaterial({
  vertexShader: satelliteVertexShader,
  fragmentShader: glassFragmentShader,
  uniforms: {
    uEarthRadius: { value: EARTH_RADIUS },
    uBaseAltitude: { value: 0.1 },
    uColor: { value: new THREE.Color(0xa78bfa) },
    uOpacity: { value: 0.85 },
    uSunDirection: { value: new THREE.Vector3(-1.0, 0.5, 1.0).normalize() },
    uFresnelPower: { value: 2.0 },
    uSpecularPower: { value: 32.0 },
    uGlowColor: { value: new THREE.Color(0xc4b5fd) },
    uIOR: { value: 1.5 },
    uThickness: { value: 1.0 },
    uReflectivity: { value: 0.3 },
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.NormalBlending,
});
export const satelliteMesh = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
satelliteMesh.frustumCulled = false;
satelliteMesh.renderOrder = 3;

// Drone
const droneShape = new THREE.Shape();
droneShape.moveTo(0, 0.03);
droneShape.lineTo(0.003, 0.02);
droneShape.lineTo(0.003, 0.005);
droneShape.lineTo(0.025, 0.003);
droneShape.lineTo(0.025, 0.0);
droneShape.lineTo(0.003, -0.002);
droneShape.lineTo(0.003, -0.02);
droneShape.lineTo(0.008, -0.03);
droneShape.lineTo(0.003, -0.025);
droneShape.lineTo(0, -0.028);
droneShape.lineTo(-0.003, -0.025);
droneShape.lineTo(-0.008, -0.03);
droneShape.lineTo(-0.003, -0.02);
droneShape.lineTo(-0.003, -0.002);
droneShape.lineTo(-0.025, 0.0);
droneShape.lineTo(-0.025, 0.003);
droneShape.lineTo(-0.003, 0.005);
droneShape.lineTo(-0.003, 0.02);
droneShape.closePath();
const droneBaseGeometry = new THREE.ShapeGeometry(droneShape);
droneBaseGeometry.rotateX(-Math.PI / 2);
droneBaseGeometry.computeVertexNormals();
export const droneGeometry = createTrackingGeometry(droneBaseGeometry, MAX_DRONES);
export const droneMaterial = new THREE.ShaderMaterial({
  vertexShader: satelliteVertexShader,
  fragmentShader: glassFragmentShader,
  uniforms: {
    uEarthRadius: { value: EARTH_RADIUS },
    uBaseAltitude: { value: 1.0 },
    uColor: { value: new THREE.Color(0x84cc16) },
    uOpacity: { value: 0.95 },
    uSunDirection: { value: new THREE.Vector3(-1.0, 0.5, 1.0).normalize() },
    uFresnelPower: { value: 2.0 },
    uSpecularPower: { value: 32.0 },
    uGlowColor: { value: new THREE.Color(0xbef264) },
    uIOR: { value: 1.5 },
    uThickness: { value: 1.0 },
    uReflectivity: { value: 0.3 },
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.NormalBlending,
});
export const droneMesh = new THREE.Mesh(droneGeometry, droneMaterial);
droneMesh.frustumCulled = false;
droneMesh.renderOrder = 2;
