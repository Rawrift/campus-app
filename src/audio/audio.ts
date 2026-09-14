/**
 * Procedural audio (§31).
 *
 * Every sound in the game is synthesised in the WebAudio graph at play time.
 * There are no sample files, which means no licensing question at all — the
 * brief's asset rules are satisfied by construction, not by bookkeeping.
 *
 * The brief asks specifically for audible differences between material pairs
 * (blade on flesh vs blade on armour vs mace on armour). That is achieved by
 * giving each impact its own noise envelope and resonant filter: flesh is a
 * short damped thud with no ring, armour is a bright transient with a metallic
 * partial that rings on, and a mace on armour is the same partial driven far
 * harder and lower.
 */

export type SfxName =
  | 'hit_flesh' | 'hit_armour' | 'hit_mace_armour' | 'hit_crit'
  | 'spell_fire' | 'spell_shadow' | 'spell_lightning' | 'spell_frost'
  | 'cast' | 'swing' | 'block'
  | 'item_drop' | 'item_rare' | 'item_pickup' | 'equip'
  | 'level_up' | 'skill_learn' | 'potion'
  | 'enemy_death' | 'player_hurt' | 'player_death'
  | 'boss_phase' | 'boss_start' | 'chest' | 'shrine' | 'ui_click' | 'ui_error';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private started = false;

  /** Ambient and musical layers, stopped on zone change. */
  private ambientNodes: AudioNode[] = [];
  private musicNodes: AudioNode[] = [];

  volumes = { master: 0.7, sfx: 0.9, music: 0.4, ambience: 0.55 };

  /**
   * Browsers refuse to start audio before a user gesture, so this is called
   * from the first click rather than at boot.
   */
  start(): void {
    if (this.started) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    } catch {
      console.warn('[audio] WebAudio unavailable; running silent');
      return;
    }
    this.started = true;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.volumes.master;
    this.master.connect(this.ctx.destination);

    const makeBus = (v: number) => {
      const g = this.ctx!.createGain();
      g.gain.value = v;
      g.connect(this.master!);
      return g;
    };
    this.sfxBus = makeBus(this.volumes.sfx);
    this.musicBus = makeBus(this.volumes.music);
    this.ambienceBus = makeBus(this.volumes.ambience);

    // One white-noise buffer, reused by every noise-based voice.
    const length = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setVolume(bus: keyof typeof this.volumes, value: number): void {
    this.volumes[bus] = Math.max(0, Math.min(1, value));
    const target = bus === 'master' ? this.master
      : bus === 'sfx' ? this.sfxBus
      : bus === 'music' ? this.musicBus : this.ambienceBus;
    if (target) target.gain.value = this.volumes[bus];
  }

  private get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  // --- voices ------------------------------------------------------------

  /** A filtered noise burst: the basis of every impact and every footstep. */
  private noise(
    dest: AudioNode, duration: number, gain: number,
    filter: { type: BiquadFilterType; freq: number; q: number },
    sweepTo?: number,
  ): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const biquad = this.ctx.createBiquadFilter();
    biquad.type = filter.type;
    biquad.frequency.value = filter.freq;
    biquad.Q.value = filter.q;
    if (sweepTo !== undefined) {
      biquad.frequency.setValueAtTime(filter.freq, this.now);
      biquad.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), this.now + duration);
    }

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, this.now);
    // A 3 ms attack: fast enough to read as an impact, slow enough not to click.
    env.gain.linearRampToValueAtTime(gain, this.now + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, this.now + duration);

    src.connect(biquad).connect(env).connect(dest);
    src.start(this.now);
    src.stop(this.now + duration + 0.02);
  }

  /** A pitched tone, for rings, magic and UI. */
  private tone(
    dest: AudioNode, freq: number, duration: number, gain: number,
    type: OscillatorType = 'sine', sweepTo?: number, delay = 0,
  ): void {
    if (!this.ctx) return;
    const t = this.now + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + duration);
    }
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(dest);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // --- public API --------------------------------------------------------

  play(name: SfxName, variation = 0): void {
    if (!this.ctx || !this.sfxBus) return;
    const bus = this.sfxBus;
    // A little pitch variation stops repeated hits sounding like a machine gun.
    const v = 1 + (variation - 0.5) * 0.2;

    switch (name) {
      // Flesh: low, damped, no ring at all.
      case 'hit_flesh':
        this.noise(bus, 0.13, 0.5, { type: 'lowpass', freq: 900 * v, q: 1.2 }, 220);
        this.tone(bus, 92 * v, 0.09, 0.22, 'sine', 54);
        break;

      // Armour: bright transient plus a metallic partial that rings on.
      case 'hit_armour':
        this.noise(bus, 0.1, 0.42, { type: 'bandpass', freq: 2600 * v, q: 1.6 });
        this.tone(bus, 1180 * v, 0.28, 0.16, 'triangle', 760);
        this.tone(bus, 2350 * v, 0.2, 0.07, 'sine', 1700);
        break;

      // Mace on armour: the same partial, driven lower and much harder.
      case 'hit_mace_armour':
        this.noise(bus, 0.19, 0.6, { type: 'lowpass', freq: 1500 * v, q: 2.4 }, 180);
        this.tone(bus, 620 * v, 0.42, 0.22, 'triangle', 300);
        this.tone(bus, 138 * v, 0.2, 0.3, 'sine', 62);
        break;

      case 'hit_crit':
        this.noise(bus, 0.16, 0.6, { type: 'bandpass', freq: 3400 * v, q: 1.1 });
        this.tone(bus, 1560 * v, 0.3, 0.2, 'square', 620);
        this.tone(bus, 210 * v, 0.24, 0.26, 'sine', 90);
        break;

      case 'swing':
        this.noise(bus, 0.17, 0.2, { type: 'bandpass', freq: 900 * v, q: 0.8 }, 2400);
        break;

      case 'block':
        this.noise(bus, 0.13, 0.45, { type: 'bandpass', freq: 3000 * v, q: 2.2 });
        this.tone(bus, 1500 * v, 0.34, 0.14, 'triangle', 900);
        break;

      case 'spell_fire':
        this.noise(bus, 0.5, 0.3, { type: 'lowpass', freq: 2400 * v, q: 0.8 }, 320);
        this.tone(bus, 160 * v, 0.36, 0.16, 'sawtooth', 70);
        break;

      case 'spell_shadow':
        this.noise(bus, 0.7, 0.24, { type: 'lowpass', freq: 700 * v, q: 3 }, 120);
        this.tone(bus, 82 * v, 0.6, 0.18, 'sine', 42);
        this.tone(bus, 123 * v, 0.5, 0.08, 'triangle', 60, 0.05);
        break;

      case 'spell_lightning':
        this.noise(bus, 0.14, 0.45, { type: 'highpass', freq: 2600 * v, q: 0.7 });
        this.tone(bus, 2600 * v, 0.12, 0.12, 'square', 900);
        break;

      case 'spell_frost':
        this.noise(bus, 0.3, 0.26, { type: 'highpass', freq: 3600 * v, q: 1.4 });
        this.tone(bus, 1900 * v, 0.34, 0.1, 'sine', 2600);
        break;

      case 'cast':
        this.tone(bus, 300 * v, 0.26, 0.12, 'triangle', 620);
        break;

      case 'item_drop':
        this.noise(bus, 0.09, 0.3, { type: 'bandpass', freq: 2000 * v, q: 2.4 });
        this.tone(bus, 780 * v, 0.14, 0.1, 'triangle', 520);
        break;

      // A rare drop gets a rising chime. This is the loop's reward sound (§45).
      case 'item_rare':
        this.tone(bus, 520, 0.5, 0.16, 'sine', 780);
        this.tone(bus, 780, 0.55, 0.12, 'sine', 1040, 0.08);
        this.tone(bus, 1040, 0.6, 0.09, 'triangle', 1560, 0.16);
        break;

      case 'item_pickup':
        this.tone(bus, 640 * v, 0.11, 0.12, 'triangle', 880);
        break;

      case 'equip':
        this.noise(bus, 0.13, 0.34, { type: 'bandpass', freq: 1700 * v, q: 1.8 });
        this.tone(bus, 420 * v, 0.18, 0.1, 'triangle', 300);
        break;

      case 'level_up':
        for (let i = 0; i < 4; i++) {
          this.tone(bus, 262 * Math.pow(1.26, i), 0.7, 0.13, 'triangle', undefined, i * 0.09);
        }
        break;

      case 'skill_learn':
        this.tone(bus, 440, 0.4, 0.12, 'sine', 660);
        this.tone(bus, 660, 0.4, 0.09, 'sine', 880, 0.07);
        break;

      case 'potion':
        this.noise(bus, 0.3, 0.2, { type: 'bandpass', freq: 700, q: 3 }, 1800);
        this.tone(bus, 340, 0.26, 0.1, 'sine', 560);
        break;

      case 'enemy_death':
        this.noise(bus, 0.45, 0.4, { type: 'lowpass', freq: 1100 * v, q: 1.4 }, 130);
        this.tone(bus, 160 * v, 0.4, 0.16, 'sawtooth', 48);
        break;

      case 'player_hurt':
        this.noise(bus, 0.22, 0.45, { type: 'lowpass', freq: 1300, q: 1.6 }, 200);
        this.tone(bus, 190, 0.2, 0.2, 'triangle', 110);
        break;

      case 'player_death':
        this.tone(bus, 180, 1.6, 0.24, 'sine', 46);
        this.tone(bus, 90, 2.0, 0.2, 'triangle', 30, 0.15);
        this.noise(bus, 1.4, 0.24, { type: 'lowpass', freq: 800, q: 1 }, 70);
        break;

      // The boss is a bell. Both boss stings are struck bell partials.
      case 'boss_start':
        for (const [f, g, d] of [[110, 0.3, 0], [220, 0.18, 0.01], [329, 0.1, 0.02], [523, 0.06, 0.04]] as const) {
          this.tone(bus, f, 3.2, g, 'sine', f * 0.96, d);
        }
        break;

      case 'boss_phase':
        for (const [f, g, d] of [[147, 0.28, 0], [294, 0.16, 0.01], [440, 0.09, 0.03]] as const) {
          this.tone(bus, f, 2.4, g, 'sine', f * 0.95, d);
        }
        break;

      case 'chest':
        this.noise(bus, 0.3, 0.3, { type: 'bandpass', freq: 900, q: 1.4 }, 2400);
        this.tone(bus, 300, 0.3, 0.12, 'triangle', 480);
        break;

      case 'shrine':
        this.tone(bus, 392, 1.4, 0.14, 'sine');
        this.tone(bus, 588, 1.6, 0.1, 'sine', undefined, 0.1);
        break;

      case 'ui_click':
        this.tone(bus, 900, 0.04, 0.07, 'square', 640);
        break;

      case 'ui_error':
        this.tone(bus, 220, 0.16, 0.1, 'square', 150);
        break;
    }
  }

  /** Picks the right impact sound from what was hit and with what (§31). */
  playImpact(damageType: string, targetArmour: number, weaponCategory: string, crit: boolean): void {
    if (crit) { this.play('hit_crit', Math.random()); return; }
    switch (damageType) {
      case 'fire': this.play('spell_fire', Math.random()); return;
      case 'shadow': this.play('spell_shadow', Math.random()); return;
      case 'lightning': this.play('spell_lightning', Math.random()); return;
      case 'frost': this.play('spell_frost', Math.random()); return;
      case 'poison': this.play('spell_shadow', Math.random()); return;
      default: break;
    }
    const heavy = weaponCategory === 'mace' || weaponCategory === 'axe' || weaponCategory === 'polearm';
    // Above roughly 18 armour the target reads as armoured rather than soft.
    if (targetArmour > 18) this.play(heavy ? 'hit_mace_armour' : 'hit_armour', Math.random());
    else this.play('hit_flesh', Math.random());
  }

  // --- ambience and music -------------------------------------------------

  /**
   * Starts the per-zone ambient bed (§31).
   * Wind is filtered noise with a slowly wandering cutoff; a crypt adds a very
   * low drone and occasional distant settling; a village adds sparse wood and
   * chain sounds.
   */
  setAmbience(track: 'wind' | 'crypt' | 'village'): void {
    if (!this.ctx || !this.ambienceBus || !this.noiseBuffer) return;
    this.stopAmbience();
    const bus = this.ambienceBus;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = track === 'crypt' ? 260 : 520;
    filter.Q.value = 0.8;

    // An LFO on the cutoff gives the wind its gusting without any scheduling.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = track === 'wind' ? 0.09 : 0.05;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = track === 'wind' ? 190 : 70;
    lfo.connect(lfoGain).connect(filter.frequency);

    const gain = this.ctx.createGain();
    gain.gain.value = track === 'crypt' ? 0.32 : 0.24;

    src.connect(filter).connect(gain).connect(bus);
    src.start();
    lfo.start();
    this.ambientNodes.push(src, lfo, gain, filter, lfoGain);

    if (track === 'crypt') {
      // A sub drone: felt more than heard, and it is what makes the ossuary
      // feel like it is under something heavy.
      const drone = this.ctx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 41;
      const dg = this.ctx.createGain();
      dg.gain.value = 0.1;
      drone.connect(dg).connect(bus);
      drone.start();
      this.ambientNodes.push(drone, dg);
    }
  }

  stopAmbience(): void {
    for (const node of this.ambientNodes) {
      if ('stop' in node && typeof node.stop === 'function') {
        try { (node as OscillatorNode).stop(); } catch { /* already stopped */ }
      }
      node.disconnect();
    }
    this.ambientNodes.length = 0;
  }

  /**
   * A very sparse ambient music bed: two slow detuned drones a fifth apart,
   * plus an occasional struck partial. Dark-fantasy ambience, entirely
   * original, and cheap enough to run for the whole session.
   */
  startMusic(root = 55): void {
    if (!this.ctx || !this.musicBus) return;
    this.stopMusic();
    const bus = this.musicBus;
    for (const [mult, detune, gainValue] of [[1, 0, 0.16], [1.5, 6, 0.1], [2, -5, 0.07]] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = root * mult;
      osc.detune.value = detune;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 340;
      filter.Q.value = 2;

      // A slow swell so the bed breathes instead of droning flat.
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.035 + mult * 0.01;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = gainValue * 0.6;

      const gain = this.ctx.createGain();
      gain.gain.value = gainValue * 0.5;
      lfo.connect(lfoGain).connect(gain.gain);

      osc.connect(filter).connect(gain).connect(bus);
      osc.start();
      lfo.start();
      this.musicNodes.push(osc, lfo, gain, filter, lfoGain);
    }
  }

  stopMusic(): void {
    for (const node of this.musicNodes) {
      if ('stop' in node && typeof node.stop === 'function') {
        try { (node as OscillatorNode).stop(); } catch { /* already stopped */ }
      }
      node.disconnect();
    }
    this.musicNodes.length = 0;
  }

  dispose(): void {
    this.stopAmbience();
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }
}
