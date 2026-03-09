#version 300 es
precision highp float;

in vec4 v_color;
in vec2 v_offset;

out vec4 fragColor;

void main() {
  // Gaussian falloff: exp(-0.5 * r^2) where r is distance in sigma units
  float r2 = dot(v_offset, v_offset);

  // Discard outside 3-sigma
  if (r2 > 9.0) discard;

  float alpha = v_color.a * exp(-0.5 * r2);

  // Premultiplied alpha
  fragColor = vec4(v_color.rgb * alpha, alpha);
}
