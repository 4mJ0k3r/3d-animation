export type QualityProfile = 'software-safe' | 'balanced' | 'high';
export interface RenderQuality {
  supersample: number; aoIntensity: number; bokehMaxBlur: number;
  shadowMapSize: number; sphereSegments: number; radialSegments: number;
  outlineDirections: number; maxBufferPixels: number;
}
/** Immutable policy, never hardware/clock dependent. Software is the default everywhere. */
export const QUALITY_PROFILES: Readonly<Record<QualityProfile, Readonly<RenderQuality>>> = Object.freeze({
  'software-safe': Object.freeze({supersample: 1, aoIntensity: 0, bokehMaxBlur: 0, shadowMapSize: 512, sphereSegments: 24, radialSegments: 16, outlineDirections: 4, maxBufferPixels: 2_100_000}),
  balanced: Object.freeze({supersample: 1, aoIntensity: 0, bokehMaxBlur: 0, shadowMapSize: 1024, sphereSegments: 32, radialSegments: 24, outlineDirections: 4, maxBufferPixels: 2_100_000}),
  high: Object.freeze({supersample: 2, aoIntensity: 0.12, bokehMaxBlur: 0.0015, shadowMapSize: 2048, sphereSegments: 36, radialSegments: 24, outlineDirections: 8, maxBufferPixels: 8_400_000}),
});
export function qualityProfile(name: QualityProfile = 'software-safe'): Readonly<RenderQuality> {
  const quality = QUALITY_PROFILES[name];
  if (!quality) throw new Error(`Unknown rendering quality: ${name}`);
  return quality;
}
