/**
 * Colour grading (§28).
 *
 * The scene lights correctly and still comes out of the renderer as one note.
 * Almost everything in it is lit by fire, so almost everything lands in the same
 * band of warm brown: a wall in shadow and a wall in torchlight differ in
 * brightness but hardly at all in hue, and without that difference the eye has
 * nothing to separate near from far, or lit from unlit. Reference frames for
 * this kind of scene are not warmer than ours, they are *further apart* --
 * shadows pushed cool and blue, firelight pushed amber, so the two read as
 * different kinds of light rather than as one light at two strengths.
 *
 * That is split toning, and it is the whole of this pass. It runs before the
 * output pass, on linear HDR values, because the shadow and highlight weights
 * have to be measured on real luminance rather than on numbers a tone curve has
 * already compressed.
 *
 * A gentle contrast curve comes with it. ACES already rolls the highlights off,
 * which flattens the midtones it leaves behind; lifting them back is what stops
 * the grade reading as a coloured veil.
 */

import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export interface GradeSettings {
  /** Colour pushed into the darkest parts of the frame. */
  shadowTint: THREE.Color;
  /** Colour pushed into the brightest. */
  highlightTint: THREE.Color;
  /** How far each is pushed, 0 disables. */
  strength: number;
  /** Midtone contrast around the pivot. 1 leaves the image alone. */
  contrast: number;
  /** Ambient colour left in the darkest parts, in linear units. */
  lift: number;
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uShadow: { value: new THREE.Color(0x2c3a52) },
    uHighlight: { value: new THREE.Color(0xffc98a) },
    uStrength: { value: 0.0 },
    uLift: { value: 0.0 },
    uContrast: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec3 uShadow;
    uniform vec3 uHighlight;
    uniform float uStrength;
    uniform float uContrast;
    uniform float uLift;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = texel.rgb;

      // Luminance on the linear values, which is what the weights below need.
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));

      // Contrast around a pivot below middle grey. The scene is dark, so a
      // 0.18 pivot would push most of the frame down and crush it. Even at
      // 0.085 this has to stay gentle: most of a torchlit crypt sits under the
      // pivot, so every point of contrast is spent darkening what is already
      // the darkest part of the frame.
      const float PIVOT = 0.030;
      c = max(vec3(0.0), (c - PIVOT) * uContrast + PIVOT);

      /*
       * Split tone. The weights are deliberately soft and overlapping: a hard
       * split puts a visible seam through anything with a gradient across it,
       * which at this camera is every floor.
       *
       * The divisor is where the split sits, and it has to match the scene's
       * actual luminance rather than a textbook one. These are *linear* values
       * before tone mapping, and a torchlit crypt lives between roughly 0.01
       * and 0.15 -- at the 0.35 this started with, every pixel scored as shadow,
       * nothing ever received the warm end, and the pass did nothing but
       * darken. Measured on the frame: the separation it was supposed to create
       * moved by 0.2 of 255.
       */
      float t = clamp(luma / 0.075, 0.0, 1.0);
      float shadowWeight = (1.0 - t) * (1.0 - t);
      float highlightWeight = t * t;

      /*
       * Tinting multiplicatively rather than additively keeps black black: an
       * additive lift washes the darkest parts into flat blue-grey, which reads
       * as fog on the lens rather than as cool shadow.
       *
       * But a multiplier has to be normalised first. The shadow uniform is a
       * colour, and
       * a colour's components are well under 1 -- multiplying by 0x2f3c44
       * directly is not a hue shift, it is a two-thirds exposure cut wearing
       * one, and it crushed the crypt to an unreadable smear the first time.
       * Dividing by its own luminance leaves a multiplier that averages 1.0, so
       * it moves hue and nothing else.
       */
      vec3 shadowTint = uShadow / max(dot(uShadow, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
      vec3 highlightTint = uHighlight / max(dot(uHighlight, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
      vec3 tint = mix(vec3(1.0), shadowTint, shadowWeight * uStrength)
                * mix(vec3(1.0), highlightTint, highlightWeight * uStrength);

      c *= tint;

      /*
       * A floor of colour in the darkest parts.
       *
       * Multiplying cannot tint black: a pitch-black pixel has no light in it
       * to shift, so the split tone warms the highlights convincingly and does
       * nothing at all to the shadows -- measured, the dark end moved by half a
       * unit out of 255 while the bright end moved sixteen. Reference frames for
       * this kind of scene do not have black shadows, they have dark blue ones,
       * and the difference is exactly this: a small amount of ambient colour
       * that survives where direct light does not.
       *
       * Kept very small and applied only where the shadow weight is high, so
       * unlit corners stay unsafe. Past roughly 0.01 it stops reading as cool
       * shadow and starts reading as fog on the lens.
       */
      c += shadowTint * (uLift * shadowWeight);

      gl_FragColor = vec4(c, texel.a);
    }`,
};

export class GradePass extends ShaderPass {
  constructor() {
    super(GradeShader);
  }

  apply(settings: GradeSettings): void {
    const u = this.uniforms;
    u.uShadow!.value.copy(settings.shadowTint);
    u.uHighlight!.value.copy(settings.highlightTint);
    u.uStrength!.value = settings.strength;
    u.uContrast!.value = settings.contrast;
    u.uLift!.value = settings.lift;
    this.enabled = settings.strength > 0 || settings.contrast !== 1 || settings.lift > 0;
  }
}
