export function cameraDistanceForRadius(radius: number, fovDegrees: number): number {
  const safeRadius = Math.max(radius, 0.01);
  const halfFov = (Math.max(10, Math.min(fovDegrees, 120)) * Math.PI / 180) / 2;
  return Math.max(0.05, (safeRadius / Math.tan(halfFov)) * 1.35);
}
