import type { GaussianCloud } from '../types';
import { createShader, createProgram, createTexture } from '../utils/webglUtils';
import { OrbitCamera } from './camera';
import vertexShaderSource from './shaders/splat.vert.glsl?raw';
import fragmentShaderSource from './shaders/splat.frag.glsl?raw';

export class SplatRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private camera: OrbitCamera;
  private cloud: GaussianCloud;

  // Textures for Gaussian data
  private positionsTex!: WebGLTexture;
  private colorsTex!: WebGLTexture;
  private scalesTex!: WebGLTexture;
  private opacitiesTex!: WebGLTexture;
  private rotationsTex!: WebGLTexture;
  private sortIndicesTex!: WebGLTexture;

  private texWidth: number;
  private texHeight: number;

  // Quad VAO
  private vao: WebGLVertexArrayObject;

  // Sorting
  private sortWorker: Worker;
  private sortedIndices: Uint32Array;
  private isSorting = false;

  // Gaze offsets for eye Gaussians
  private originalPositions: Float32Array;
  private currentPositions: Float32Array;

  // Cached uniform locations
  private uniforms!: {
    projection: WebGLUniformLocation | null;
    view: WebGLUniformLocation | null;
    viewport: WebGLUniformLocation | null;
    focal: WebGLUniformLocation | null;
    gaussianCount: WebGLUniformLocation | null;
    texWidth: WebGLUniformLocation | null;
    positions: WebGLUniformLocation | null;
    colors: WebGLUniformLocation | null;
    scales: WebGLUniformLocation | null;
    opacities: WebGLUniformLocation | null;
    rotations: WebGLUniformLocation | null;
    sortIndices: WebGLUniformLocation | null;
    introProgress: WebGLUniformLocation | null;
  };

  // Intro assembly animation
  private introStartTime: number;
  private readonly INTRO_DURATION = 2.0; // seconds

  // Animation
  private animFrameId: number | null = null;
  private destroyed = false;

  constructor(
    canvas: HTMLCanvasElement,
    cloud: GaussianCloud,
  ) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      alpha: false,
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.cloud = cloud;

    // Compute texture dimensions (square-ish)
    this.texWidth = Math.ceil(Math.sqrt(cloud.count));
    this.texHeight = Math.ceil(cloud.count / this.texWidth);

    // Compile shaders
    const vs = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    this.program = createProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // Create quad VAO
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    const aQuad = gl.getAttribLocation(this.program, 'a_quadVertex');
    gl.enableVertexAttribArray(aQuad);
    gl.vertexAttribPointer(aQuad, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Camera - target the center of the face plane
    this.camera = new OrbitCamera(canvas, [0, 0, -0.5]);

    // Start intro animation
    this.introStartTime = performance.now() / 1000;

    // Store original positions for gaze manipulation
    this.originalPositions = new Float32Array(cloud.positions);
    this.currentPositions = new Float32Array(cloud.positions);

    // Initialize sort indices before uploading textures (uploadTextures calls updateSortTexture)
    this.sortedIndices = new Uint32Array(cloud.count);
    for (let i = 0; i < cloud.count; i++) this.sortedIndices[i] = i;

    // Upload Gaussian data as textures
    this.uploadTextures();

    // Create sort worker
    this.sortWorker = new Worker(
      new URL('./sorting.worker.ts', import.meta.url),
      { type: 'module' }
    );
    this.sortWorker.onmessage = (e) => {
      this.sortedIndices = e.data.sortedIndices;
      this.updateSortTexture();
      this.isSorting = false;
    };

    console.log('[SplatRenderer] Initialized:', {
      gaussianCount: cloud.count,
      texSize: `${this.texWidth}x${this.texHeight}`,
      canvasSize: `${canvas.width}x${canvas.height}`,
    });

    // Cache uniform locations
    this.cacheUniformLocations();

    // Start render loop
    this.render();
  }

  private uploadTextures(): void {
    const { gl, cloud, texWidth, texHeight } = this;
    const totalSize = texWidth * texHeight;

    // Pad data to fill texture
    const padVec3 = (src: Float32Array, count: number) => {
      const data = new Float32Array(totalSize * 4);
      for (let i = 0; i < count; i++) {
        data[i * 4] = src[i * 3];
        data[i * 4 + 1] = src[i * 3 + 1];
        data[i * 4 + 2] = src[i * 3 + 2];
        data[i * 4 + 3] = 1.0;
      }
      return data;
    };

    const padVec4 = (src: Float32Array, count: number) => {
      const data = new Float32Array(totalSize * 4);
      for (let i = 0; i < count; i++) {
        data[i * 4] = src[i * 4];
        data[i * 4 + 1] = src[i * 4 + 1];
        data[i * 4 + 2] = src[i * 4 + 2];
        data[i * 4 + 3] = src[i * 4 + 3];
      }
      return data;
    };

    const padFloat = (src: Float32Array, count: number) => {
      const data = new Float32Array(totalSize * 4);
      for (let i = 0; i < count; i++) {
        data[i * 4] = src[i];
      }
      return data;
    };

    this.positionsTex = createTexture(
      gl, texWidth, texHeight,
      padVec3(this.currentPositions, cloud.count)
    );
    this.colorsTex = createTexture(
      gl, texWidth, texHeight,
      padVec3(cloud.colors, cloud.count)
    );
    this.scalesTex = createTexture(
      gl, texWidth, texHeight,
      padVec3(cloud.scales, cloud.count)
    );
    this.opacitiesTex = createTexture(
      gl, texWidth, texHeight,
      padFloat(cloud.opacities, cloud.count)
    );
    this.rotationsTex = createTexture(
      gl, texWidth, texHeight,
      padVec4(cloud.rotations, cloud.count)
    );

    // Sort indices texture (initially identity)
    this.sortIndicesTex = createTexture(
      gl, texWidth, texHeight, null
    );
    this.updateSortTexture();
  }

  private updateSortTexture(): void {
    const { gl, texWidth, texHeight } = this;
    const totalSize = texWidth * texHeight;
    const data = new Float32Array(totalSize * 4);
    for (let i = 0; i < this.sortedIndices.length; i++) {
      data[i * 4] = this.sortedIndices[i];
    }
    gl.bindTexture(gl.TEXTURE_2D, this.sortIndicesTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA32F,
      texWidth, texHeight, 0,
      gl.RGBA, gl.FLOAT, data
    );
  }

  updatePositionsTexture(): void {
    const { gl, cloud, texWidth, texHeight } = this;
    const totalSize = texWidth * texHeight;
    const data = new Float32Array(totalSize * 4);
    for (let i = 0; i < cloud.count; i++) {
      data[i * 4] = this.currentPositions[i * 3];
      data[i * 4 + 1] = this.currentPositions[i * 3 + 1];
      data[i * 4 + 2] = this.currentPositions[i * 3 + 2];
      data[i * 4 + 3] = 1.0;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.positionsTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA32F,
      texWidth, texHeight, 0,
      gl.RGBA, gl.FLOAT, data
    );
  }

  applyGazeOffset(
    leftOffset: [number, number, number],
    rightOffset: [number, number, number],
    blinkFactor: number = 1.0,
    headDrift: { dx: number; dy: number; dz: number } = { dx: 0, dy: 0, dz: 0 }
  ): void {
    const { eyeIndices } = this.cloud;

    // Reset positions to original
    this.currentPositions.set(this.originalPositions);

    // Apply subtle head micro-drift to ALL Gaussians (makes portrait feel alive)
    if (headDrift.dx !== 0 || headDrift.dy !== 0 || headDrift.dz !== 0) {
      for (let i = 0; i < this.cloud.count; i++) {
        this.currentPositions[i * 3] += headDrift.dx;
        this.currentPositions[i * 3 + 1] += headDrift.dy;
        this.currentPositions[i * 3 + 2] += headDrift.dz;
      }
    }

    // Apply offset to iris Gaussians
    for (const i of eyeIndices.leftIris) {
      this.currentPositions[i * 3] += leftOffset[0];
      this.currentPositions[i * 3 + 1] += leftOffset[1];
      this.currentPositions[i * 3 + 2] += leftOffset[2];
    }
    for (const i of eyeIndices.rightIris) {
      this.currentPositions[i * 3] += rightOffset[0];
      this.currentPositions[i * 3 + 1] += rightOffset[1];
      this.currentPositions[i * 3 + 2] += rightOffset[2];
    }

    this.updatePositionsTexture();
  }

  private cacheUniformLocations(): void {
    const { gl, program } = this;
    this.uniforms = {
      projection: gl.getUniformLocation(program, 'u_projection'),
      view: gl.getUniformLocation(program, 'u_view'),
      viewport: gl.getUniformLocation(program, 'u_viewport'),
      focal: gl.getUniformLocation(program, 'u_focal'),
      gaussianCount: gl.getUniformLocation(program, 'u_gaussianCount'),
      texWidth: gl.getUniformLocation(program, 'u_texWidth'),
      positions: gl.getUniformLocation(program, 'u_positions'),
      colors: gl.getUniformLocation(program, 'u_colors'),
      scales: gl.getUniformLocation(program, 'u_scales'),
      opacities: gl.getUniformLocation(program, 'u_opacities'),
      rotations: gl.getUniformLocation(program, 'u_rotations'),
      sortIndices: gl.getUniformLocation(program, 'u_sortIndices'),
      introProgress: gl.getUniformLocation(program, 'u_introProgress'),
    };
  }

  private requestSort(): void {
    if (this.isSorting || this.destroyed) return;
    this.isSorting = true;

    const viewMatrix = new Float32Array(this.camera.viewMatrix as Float32Array);
    this.sortWorker.postMessage({
      positions: this.currentPositions,
      viewMatrix,
      count: this.cloud.count,
    });
  }

  private render = (): void => {
    if (this.destroyed) return;
    this.animFrameId = requestAnimationFrame(this.render);

    const { gl, program, cloud } = this;

    // Resize canvas if needed
    const dpr = Math.min(window.devicePixelRatio, 2);
    const htmlCanvas = gl.canvas as HTMLCanvasElement;
    const displayW = Math.round(htmlCanvas.clientWidth * dpr);
    const displayH = Math.round(htmlCanvas.clientHeight * dpr);
    if (gl.canvas.width !== displayW || gl.canvas.height !== displayH) {
      gl.canvas.width = displayW;
      gl.canvas.height = displayH;
      this.camera.updateMatrices();
    }

    // Request sort periodically
    if (!this.isSorting) {
      this.requestSort();
    }

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.08, 0.08, 0.12, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Enable blending (premultiplied alpha, front-to-back)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(program);

    // Set uniforms (using cached locations)
    const u = this.uniforms;
    gl.uniformMatrix4fv(u.projection, false, this.camera.projectionMatrix);
    gl.uniformMatrix4fv(u.view, false, this.camera.viewMatrix);
    gl.uniform2f(u.viewport, gl.canvas.width, gl.canvas.height);
    const [fx, fy] = this.camera.focalLength;
    gl.uniform2f(u.focal, fx, fy);
    gl.uniform1i(u.gaussianCount, cloud.count);
    gl.uniform1i(u.texWidth, this.texWidth);

    // Intro animation progress
    const elapsed = performance.now() / 1000 - this.introStartTime;
    const introProgress = Math.min(1.0, elapsed / this.INTRO_DURATION);
    gl.uniform1f(u.introProgress, introProgress);

    // Bind textures (using cached locations)
    const texBindings: [WebGLTexture, WebGLUniformLocation | null][] = [
      [this.positionsTex, u.positions],
      [this.colorsTex, u.colors],
      [this.scalesTex, u.scales],
      [this.opacitiesTex, u.opacities],
      [this.rotationsTex, u.rotations],
      [this.sortIndicesTex, u.sortIndices],
    ];

    for (let i = 0; i < texBindings.length; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, texBindings[i][0]);
      gl.uniform1i(texBindings[i][1], i);
    }

    // Draw instanced quads
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cloud.count);
    gl.bindVertexArray(null);
  };

  get introComplete(): boolean {
    return (performance.now() / 1000 - this.introStartTime) >= this.INTRO_DURATION;
  }

  getCamera(): OrbitCamera {
    return this.camera;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.sortWorker.terminate();
    this.camera.destroy();
  }
}
