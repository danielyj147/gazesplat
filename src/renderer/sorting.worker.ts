// Web Worker for depth-sorting Gaussians

interface SortMessage {
  positions: Float32Array;
  viewMatrix: Float32Array;
  count: number;
}

self.onmessage = (e: MessageEvent<SortMessage>) => {
  const { positions, viewMatrix, count } = e.data;

  // Compute view-space Z for each Gaussian
  const depths = new Float32Array(count);
  const indices = new Uint32Array(count);

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    // View-space Z = dot(viewMatrix row 2, [x,y,z,1])
    depths[i] =
      viewMatrix[2] * x +
      viewMatrix[6] * y +
      viewMatrix[10] * z +
      viewMatrix[14];
    indices[i] = i;
  }

  // Sort by depth (front-to-back for premultiplied alpha blending)
  // Smaller Z (more negative) = closer to camera = render first
  indices.sort((a, b) => depths[a] - depths[b]);

  // Transfer sorted indices back
  self.postMessage(
    { sortedIndices: indices },
    { transfer: [indices.buffer] }
  );
};
