import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Vector2 } from 'three';

/**
 * Final colour-grade pass (runs in linear HDR, before OutputPass tone-mapping):
 * radial speed blur, chromatic fringe that grows with speed, vignette, fine grain,
 * and a fade-to-black used for cinematic screen transitions.
 */
export const CinematicShader = {
  name: 'CinematicShader',
  uniforms: {
    tDiffuse: { value: null },
    uSpeed: { value: 0 }, // 0..1 radial blur + fringe
    uVignette: { value: 0.55 },
    uGrain: { value: 0.035 },
    uFade: { value: 0 }, // 0 = visible, 1 = black
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSpeed;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uFade;
    uniform float uTime;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 c = vUv - 0.5;
      float d = length(c);
      vec3 col;

      if (uSpeed > 0.001) {
        // radial blur toward the centre, stronger at the edges (keeps the car sharp)
        float strength = uSpeed * 0.07 * smoothstep(0.12, 0.75, d);
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float k = float(i) / 7.0;
          acc += texture2D(tDiffuse, vUv - c * strength * k).rgb;
        }
        col = acc / 8.0;
        // chromatic fringe
        float f = uSpeed * 0.0035 * smoothstep(0.1, 0.8, d);
        col.r = mix(col.r, texture2D(tDiffuse, vUv - c * f * 2.0).r, 0.7);
        col.b = mix(col.b, texture2D(tDiffuse, vUv + c * f * 2.0).b, 0.7);
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }

      float vig = smoothstep(0.85, 0.2, d * (1.0 + uVignette * 0.9));
      col *= mix(1.0 - uVignette * 0.6, 1.0, vig);
      col += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createCinematicPass(): ShaderPass {
  return new ShaderPass(CinematicShader);
}
