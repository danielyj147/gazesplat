#version 300 es
precision highp float;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform vec2 u_viewport;
uniform vec2 u_focal;

// Per-Gaussian data (via textures)
uniform sampler2D u_positions;   // xyz
uniform sampler2D u_colors;      // rgb
uniform sampler2D u_scales;      // sx, sy, sz
uniform sampler2D u_opacities;   // opacity
uniform sampler2D u_rotations;   // qw, qx, qy, qz

// Sort order index buffer
uniform sampler2D u_sortIndices;
uniform int u_gaussianCount;
uniform int u_texWidth;
uniform float u_introProgress; // 0 = scattered, 1 = assembled

// Per-vertex: quad corner [-1,-1], [1,-1], [-1,1], [1,1]
in vec2 a_quadVertex;

out vec4 v_color;
out vec2 v_offset;

ivec2 indexToTexCoord(int idx) {
  return ivec2(idx % u_texWidth, idx / u_texWidth);
}

// Fetch Gaussian index from sorted order
int getSortedIndex(int drawIndex) {
  ivec2 tc = indexToTexCoord(drawIndex);
  return int(texelFetch(u_sortIndices, tc, 0).r);
}

vec3 fetchVec3(sampler2D tex, int idx) {
  ivec2 tc = indexToTexCoord(idx);
  return texelFetch(tex, tc, 0).rgb;
}

vec4 fetchVec4(sampler2D tex, int idx) {
  ivec2 tc = indexToTexCoord(idx);
  return texelFetch(tex, tc, 0);
}

float fetchFloat(sampler2D tex, int idx) {
  ivec2 tc = indexToTexCoord(idx);
  return texelFetch(tex, tc, 0).r;
}

// Simple hash for deterministic per-Gaussian random scatter
vec3 hash3(int seed) {
  vec3 p = vec3(float(seed) * 0.1031, float(seed) * 0.1030, float(seed) * 0.0973);
  p = fract(p * vec3(443.8975, 397.2973, 491.1871));
  p += dot(p, p.yzx + 19.19);
  return fract(vec3(p.x * p.y, p.y * p.z, p.z * p.x)) * 2.0 - 1.0;
}

// Compute 3D covariance from scale and rotation quaternion
mat3 computeCovariance3D(vec3 scale, vec4 rot) {
  float r = rot.x; float x = rot.y; float y = rot.z; float z = rot.w;

  mat3 R = mat3(
    1.0 - 2.0*(y*y + z*z), 2.0*(x*y - r*z),       2.0*(x*z + r*y),
    2.0*(x*y + r*z),       1.0 - 2.0*(x*x + z*z), 2.0*(y*z - r*x),
    2.0*(x*z - r*y),       2.0*(y*z + r*x),       1.0 - 2.0*(x*x + y*y)
  );

  mat3 S = mat3(
    scale.x, 0.0, 0.0,
    0.0, scale.y, 0.0,
    0.0, 0.0, scale.z
  );

  mat3 M = R * S;
  return M * transpose(M);
}

// Project 3D covariance to 2D
vec3 computeCovariance2D(vec3 mean, mat3 cov3D, mat4 viewMatrix) {
  vec4 t = viewMatrix * vec4(mean, 1.0);

  // Use negative z since view space looks down -Z
  float tz = -t.z;
  if (tz < 0.001) tz = 0.001;

  float limx = 1.3 * u_focal.x / u_viewport.x;
  float limy = 1.3 * u_focal.y / u_viewport.y;
  float txtz = t.x / t.z;
  float tytz = t.y / t.z;
  t.x = min(limx, max(-limx, txtz)) * t.z;
  t.y = min(limy, max(-limy, tytz)) * t.z;

  // Jacobian of the projection: derivatives of (fx*x/z, fy*y/z)
  // with respect to (x, y, z) where z is negative
  mat3 J = mat3(
    u_focal.x / tz, 0.0, (u_focal.x * t.x) / (tz * tz),
    0.0, u_focal.y / tz, (u_focal.y * t.y) / (tz * tz),
    0.0, 0.0, 0.0
  );

  mat3 W = mat3(viewMatrix);
  mat3 T = J * W;
  mat3 cov = T * cov3D * transpose(T);

  // Add low-pass filter to prevent subpixel Gaussians
  cov[0][0] += 0.3;
  cov[1][1] += 0.3;

  return vec3(cov[0][0], cov[0][1], cov[1][1]);
}

void main() {
  int instanceID = gl_InstanceID;
  if (instanceID >= u_gaussianCount) {
    gl_Position = vec4(0.0);
    return;
  }

  int gaussianIdx = getSortedIndex(instanceID);
  if (gaussianIdx < 0 || gaussianIdx >= u_gaussianCount) {
    gl_Position = vec4(0.0);
    return;
  }

  vec3 center = fetchVec3(u_positions, gaussianIdx);
  vec3 color = fetchVec3(u_colors, gaussianIdx);
  vec3 scale = fetchVec3(u_scales, gaussianIdx);
  float opacity = fetchFloat(u_opacities, gaussianIdx);
  vec4 rotation = fetchVec4(u_rotations, gaussianIdx);

  // Intro assembly animation: scatter → converge
  if (u_introProgress < 1.0) {
    // Per-Gaussian deterministic scatter direction
    vec3 scatter = hash3(gaussianIdx) * 1.5; // spread radius
    // Cubic ease-out for snappy convergence with soft landing
    float t = u_introProgress;
    float ease = 1.0 - (1.0 - t) * (1.0 - t) * (1.0 - t);
    center = mix(center + scatter, center, ease);
    // Fade in opacity and shrink scale during assembly
    opacity *= smoothstep(0.0, 0.3, t);
    scale *= mix(0.3, 1.0, ease);
  }

  // Project center to clip space
  vec4 viewPos = u_view * vec4(center, 1.0);

  // Cull behind camera
  if (viewPos.z > -0.01) {
    gl_Position = vec4(0.0);
    return;
  }

  vec4 clipPos = u_projection * viewPos;

  // Compute 2D covariance
  mat3 cov3D = computeCovariance3D(scale, rotation);
  vec3 cov2D = computeCovariance2D(center, cov3D, u_view);

  // Eigendecomposition of 2D covariance for bounding quad
  float a = cov2D.x;
  float b = cov2D.y;
  float d = cov2D.z;

  float det = a * d - b * b;
  float trace = a + d;
  float mid = 0.5 * trace;
  float disc = max(0.1, mid * mid - det);
  float sqrtDisc = sqrt(disc);
  float lambda1 = mid + sqrtDisc;
  float lambda2 = max(0.1, mid - sqrtDisc);

  float radius = ceil(3.0 * sqrt(max(lambda1, lambda2)));

  // Scale quad
  vec2 quadOffset = a_quadVertex * radius;

  // Compute eigenvectors for ellipse orientation
  vec2 v1;
  if (b != 0.0) {
    v1 = normalize(vec2(lambda1 - d, b));
  } else {
    v1 = vec2(1.0, 0.0);
  }
  vec2 v2 = vec2(-v1.y, v1.x);

  vec2 screenOffset = (a_quadVertex.x * sqrt(lambda1) * v1 +
                        a_quadVertex.y * sqrt(lambda2) * v2) * 3.0;

  vec2 ndcCenter = clipPos.xy / clipPos.w;
  vec2 pixelOffset = screenOffset / (u_viewport * 0.5);

  gl_Position = vec4(ndcCenter + pixelOffset, clipPos.z / clipPos.w, 1.0);

  // Pass data to fragment shader
  v_color = vec4(color, opacity);
  v_offset = a_quadVertex * 3.0; // in sigma units
}
