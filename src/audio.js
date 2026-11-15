// Synthesised sound effects + a step-sequenced soundtrack (no audio files needed).
const Sfx = (() => {
  let ac = null, master = null, noiseBuf = null, muted = false;
  let song = null, step = 0, nextT = 0, timer = null;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.5;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(type, f0, f1, dur, vol, t = ac.currentTime, lp = 0) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = o;
    if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
    node.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, f0, f1, t = ac.currentTime, type = 'lowpass') {
    const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true;
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  const fx = {
    rifle()   { tone('square', 880, 180, 0.07, 0.10); noise(0.05, 0.10, 6000, 1500); },
    scatter() { tone('sawtooth', 520, 90, 0.14, 0.13); noise(0.14, 0.2, 5000, 500); },
    laser()   { tone('sawtooth', 1800, 300, 0.16, 0.10); tone('sine', 2400, 600, 0.12, 0.08); },
    rapid()   { tone('square', 1200, 400, 0.04, 0.07); },
    enemyShot() { tone('triangle', 420, 140, 0.12, 0.10); },
    hit()     { noise(0.05, 0.12, 3000, 800, undefined, 'bandpass'); },
    ting()    { tone('sine', 2600, 1900, 0.06, 0.07); },
    boom()    { noise(0.45, 0.5, 1800, 60); tone('sine', 130, 30, 0.4, 0.5); },
    bigBoom() { noise(1.2, 0.8, 2500, 40); tone('sine', 90, 22, 1.1, 0.8); },
    jump()    { tone('square', 260, 520, 0.09, 0.07); },
    jet()     { noise(0.3, 0.25, 800, 4000, undefined, 'bandpass'); },
    hurt()    { tone('sawtooth', 320, 60, 0.3, 0.25); noise(0.2, 0.2, 2000, 200); },
    die()     { tone('sawtooth', 400, 40, 0.8, 0.3); noise(0.7, 0.35, 3000, 80); },
    pickup()  { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.12, 0.16, ac.currentTime + i * 0.06)); },
    alarm()   { for (let i = 0; i < 6; i++) tone('square', i % 2 ? 620 : 470, i % 2 ? 620 : 470, 0.22, 0.12, ac.currentTime + i * 0.25); },
    charge()  { tone('sawtooth', 80, 900, 1.0, 0.16); },
    beam()    { noise(1.2, 0.4, 5000, 1500, undefined, 'bandpass'); tone('sawtooth', 110, 100, 1.2, 0.2); },
    win()     { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone('square', f, f, 0.3, 0.12, ac.currentTime + i * 0.13)); },
  };

  // ------------------------------------------------------------ music
  const N = n => 440 * Math.pow(2, (n - 69) / 12);
  const SONGS = {
    stage: {
      bpm: 138,
      bass: [45, 0, 45, 45, 0, 45, 57, 45, 43, 0, 43, 43, 0, 43, 55, 43, 41, 0, 41, 41, 0, 41, 53, 41, 43, 0, 43, 43, 47, 0, 50, 52],
      lead: [69, 0, 72, 0, 76, 0, 72, 74, 0, 0, 71, 0, 67, 0, 71, 0, 72, 0, 69, 0, 65, 0, 69, 72, 0, 74, 0, 71, 0, 67, 71, 74,
             76, 0, 0, 74, 72, 0, 69, 0, 79, 0, 0, 76, 74, 0, 71, 0, 77, 0, 76, 0, 72, 0, 69, 0, 71, 72, 74, 76, 79, 0, 83, 0],
    },
    boss: {
      bpm: 158,
      bass: [40, 40, 52, 40, 40, 52, 40, 51, 40, 40, 52, 40, 43, 55, 46, 58, 38, 38, 50, 38, 38, 50, 38, 49, 38, 38, 50, 38, 41, 53, 44, 56],
      lead: [76, 0, 75, 0, 76, 0, 79, 0, 82, 0, 79, 0, 76, 75, 0, 0, 74, 0, 73, 0, 74, 0, 77, 0, 80, 0, 77, 0, 74, 73, 0, 0,
             88, 0, 0, 87, 0, 0, 83, 0, 82, 0, 0, 79, 0, 0, 76, 0, 86, 0, 0, 85, 0, 0, 81, 0, 80, 79, 77, 76, 74, 73, 71, 70],
    },
  };

  function schedule() {
    if (!ac || !song) return;
    const s = SONGS[song], sp = 60 / s.bpm / 4;
    while (nextT < ac.currentTime + 0.15) {
      if (!muted) {
        const b = s.bass[step % s.bass.length], l = s.lead[step % s.lead.length], i = step % 16;
        if (b) tone('sawtooth', N(b), N(b), sp * 0.9, 0.16, nextT, 700);
        if (l) { tone('square', N(l), N(l), sp * 1.7, 0.045, nextT, 2600); tone('square', N(l) * 1.005, N(l) * 1.005, sp * 1.7, 0.03, nextT, 2600); }
        if (i % 4 === 0) tone('sine', 150, 40, 0.14, 0.5, nextT);
        if (i === 4 || i === 12) noise(0.13, 0.22, 4000, 900, nextT, 'bandpass');
        if (i % 2 === 0) noise(0.03, 0.06, 9000, 7000, nextT, 'highpass');
      }
      nextT += sp; step++;
    }
  }

  return {
    init,
    play(name) { if (ac && !muted && fx[name]) fx[name](); },
    music(name) {
      if (!ac) return;
      if (song === name) return;
      song = name; step = 0; nextT = ac.currentTime + 0.08;
      if (!timer) timer = setInterval(schedule, 40);
    },
    stopMusic() { song = null; },
    toggleMute() { muted = !muted; return muted; },
    get muted() { return muted; },
  };
})();
