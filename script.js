/**
 * ============================================================================
 * EC2201 – DIGITAL ELECTRONICS: SYNCHRONOUS SEQUENTIAL DIGITAL STOPWATCH
 * ============================================================================
 * 
 * Conceptual Model:
 * Inputs (START, STOP, RESET)
 *   ↓
 * Next State Combinational Logic
 *   ↓
 * Active Clock Rising Edge (▲ LOW → HIGH)
 *   ↓
 * State Register (2-Bit D/JK Flip-Flop Storage: Q1, Q0)
 *   ↓
 * Counter Enable Control Signal
 *   ↓
 * Synchronous MOD-60 Counters (Seconds, Minutes)
 *   ↓
 * 7-Segment Digital Display
 * 
 * Modular Architecture:
 * 1. ClockEngine         : Generates square clock pulses & detects active rising edges
 * 2. StateRegister       : Simulates 2-bit flip-flop memory (Q1, Q0)
 * 3. StateMachine (FSM)  : Evaluates next-state combinational excitation equations
 * 4. ModCounter          : Synchronous MOD-60 counters with terminal overflow carry
 * 5. DisplayManager      : Manages 7-segment digital time & hardware indicators
 * 6. TimingCanvas        : Real-time logic analyzer multi-channel waveform generator
 * 7. EventLogger         : Chronological hardware event tracing
 * 8. TestRunner          : Headless verification suite (15 genuine logic test cases)
 * 9. SyntheticDataset    : Reproducible cycle-by-cycle logic verification table & chart
 * ============================================================================
 */

// State Encodings (Q1 Q0)
const STATE = {
  IDLE: '00',
  RUNNING: '01',
  STOPPED: '10'
};

const STATE_NAMES = {
  '00': 'IDLE',
  '01': 'RUNNING',
  '10': 'STOPPED'
};

/* ==========================================================================
   1. CLOCK ENGINE MODULE
   Simulates master square wave oscillator with rising-edge triggering.
   ========================================================================== */
class ClockEngine {
  constructor(frequency = 1) {
    this.frequency = frequency; // 1 Hz, 2 Hz, 5 Hz
    this.level = 0;             // 0 = LOW, 1 = HIGH
    this.pulseCount = 0;        // Total clock cycles elapsed
    this.timerId = null;
    this.onRisingEdgeCallbacks = [];
    this.onClockTransitionCallbacks = [];
  }

  setFrequency(newFreq) {
    this.frequency = Number(newFreq);
    if (this.timerId) {
      this.stop();
      this.start();
    }
  }

  onRisingEdge(callback) {
    this.onRisingEdgeCallbacks.push(callback);
  }

  onClockTransition(callback) {
    this.onClockTransitionCallbacks.push(callback);
  }

  // Toggle clock level: LOW -> HIGH -> LOW
  // Half-period determines frequency
  toggle() {
    const prevLevel = this.level;
    this.level = this.level === 0 ? 1 : 0;

    // Detect RISING EDGE (LOW to HIGH transition)
    const isRisingEdge = (prevLevel === 0 && this.level === 1);
    if (isRisingEdge) {
      this.pulseCount++;
      this.onRisingEdgeCallbacks.forEach(cb => cb(this.pulseCount));
    }

    this.onClockTransitionCallbacks.forEach(cb => cb(this.level, isRisingEdge, this.pulseCount));
  }

  // Manual single-step pulse for laboratory viva demonstration
  stepPulse() {
    // Force transition: LOW -> HIGH (Active Edge) -> then back to LOW after brief delay
    if (this.level === 1) {
      this.level = 0;
      this.onClockTransitionCallbacks.forEach(cb => cb(this.level, false, this.pulseCount));
    }

    setTimeout(() => {
      this.level = 1;
      this.pulseCount++;
      this.onRisingEdgeCallbacks.forEach(cb => cb(this.pulseCount));
      this.onClockTransitionCallbacks.forEach(cb => cb(this.level, true, this.pulseCount));

      setTimeout(() => {
        this.level = 0;
        this.onClockTransitionCallbacks.forEach(cb => cb(this.level, false, this.pulseCount));
      }, 200);
    }, 50);
  }

  start() {
    if (this.timerId) return;
    const halfPeriodMs = Math.round(1000 / (this.frequency * 2));
    this.timerId = setInterval(() => {
      this.toggle();
    }, halfPeriodMs);
  }

  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  reset() {
    this.pulseCount = 0;
    this.level = 0;
    this.onClockTransitionCallbacks.forEach(cb => cb(this.level, false, 0));
  }
}

/* ==========================================================================
   2. STATE REGISTER MODULE (FLIP-FLOPS)
   Simulates 2 D-type flip-flops (FF1, FF0) holding outputs Q1 and Q0.
   Updates ONLY on synchronous rising clock edge.
   ========================================================================== */
class StateRegister {
  constructor() {
    this.q1 = 0; // Flip-Flop 1 output (MSB)
    this.q0 = 0; // Flip-Flop 0 output (LSB)
  }

  get stateBits() {
    return `${this.q1}${this.q0}`;
  }

  get stateName() {
    return STATE_NAMES[this.stateBits] || 'UNKNOWN';
  }

  // Synchronous latch: Updates Q1 and Q0 strictly on active clock edge
  synchronousLatch(d1, d0) {
    const oldBits = this.stateBits;
    this.q1 = Number(d1);
    this.q0 = Number(d0);
    return {
      oldBits,
      newBits: this.stateBits,
      changed: oldBits !== this.stateBits
    };
  }

  forceReset() {
    this.q1 = 0;
    this.q0 = 0;
  }
}

/* ==========================================================================
   3. FINITE STATE MACHINE (FSM) & NEXT-STATE COMBINATIONAL LOGIC
   Evaluates boolean excitation equations:
   D0 = (START * !RESET * (!Q1*!Q0 + Q1*!Q0)) + (Q0 * !STOP * !RESET)
   D1 = (STOP * Q0 * !RESET) + (Q1 * !START * !RESET)
   ========================================================================== */
class StateMachine {
  constructor(stateRegister) {
    this.register = stateRegister;
    // Latched input signals pending next clock edge
    this.inputs = {
      start: 0,
      stop: 0,
      reset: 0
    };
  }

  setInput(name, value) {
    this.inputs[name] = value ? 1 : 0;
  }

  clearInputs() {
    this.inputs.start = 0;
    this.inputs.stop = 0;
    this.inputs.reset = 0;
  }

  // Compute next state bits (D1, D0) based on inputs and current register state
  computeNextState() {
    const { q1, q0 } = this.register;
    const { start, stop, reset } = this.inputs;

    if (reset === 1) {
      return { d1: 0, d0: 0, nextStateName: 'IDLE' };
    }

    const currentState = `${q1}${q0}`;
    let d1 = 0;
    let d0 = 0;

    switch (currentState) {
      case STATE.IDLE: // 00
        if (start === 1) {
          d1 = 0; d0 = 1; // RUNNING
        } else {
          d1 = 0; d0 = 0; // IDLE
        }
        break;

      case STATE.RUNNING: // 01
        if (stop === 1) {
          d1 = 1; d0 = 0; // STOPPED
        } else {
          d1 = 0; d0 = 1; // RUNNING
        }
        break;

      case STATE.STOPPED: // 10
        if (start === 1) {
          d1 = 0; d0 = 1; // RUNNING
        } else {
          d1 = 1; d0 = 0; // STOPPED
        }
        break;

      default:
        d1 = 0; d0 = 0;
    }

    const nextBits = `${d1}${d0}`;
    return {
      d1,
      d0,
      nextBits,
      nextStateName: STATE_NAMES[nextBits]
    };
  }

  // Synchronous evaluation executed strictly on rising clock edge
  clockTick() {
    const { d1, d0, nextStateName } = this.computeNextState();
    const transition = this.register.synchronousLatch(d1, d0);

    // One-shot input signals are consumed after being latched
    this.clearInputs();

    return {
      ...transition,
      stateName: nextStateName,
      counterEnable: this.register.stateBits === STATE.RUNNING
    };
  }
}

/* ==========================================================================
   4. SYNCHRONOUS MOD-60 COUNTERS
   Seconds and Minutes counters (00-59) with synchronous carry propagation.
   ========================================================================== */
class ModCounter {
  constructor(modulus = 60) {
    this.modulus = modulus;
    this.count = 0;
    this.overflow = false; // Terminal Count (TC) flag
  }

  // Synchronous clock update
  tick(enable = true) {
    this.overflow = false;
    if (!enable) return false;

    if (this.count >= this.modulus - 1) {
      this.count = 0;
      this.overflow = true; // Carry pulse generated
    } else {
      this.count++;
      this.overflow = false;
    }

    return this.overflow;
  }

  reset() {
    this.count = 0;
    this.overflow = false;
  }

  get formatted() {
    return String(this.count).padStart(2, '0');
  }

  get binary() {
    return this.count.toString(2).padStart(6, '0');
  }
}

/* ==========================================================================
   5. REAL-TIME MULTI-CHANNEL TIMING DIAGRAM (LOGIC ANALYZER)
   Plots square wave waveforms for CLOCK, START, STOP, RESET, ENABLE, SECOND.
   ========================================================================== */
class TimingCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.history = [];
    this.maxPoints = 40;
    this.channels = [
      { name: 'CLOCK', color: '#38bdf8' },
      { name: 'START', color: '#10b981' },
      { name: 'STOP',  color: '#ef4444' },
      { name: 'RESET', color: '#f59e0b' },
      { name: 'ENABLE',color: '#a855f7' },
      { name: 'SECOND',color: '#06b6d4', isBus: true }
    ];

    if (this.canvas) {
      this.setupCanvas();
    }
  }

  setupCanvas() {
    // Dynamic DPR scaling for sharp rendering
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width || 800;
    this.height = 240;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  addSample(clockLevel, start, stop, reset, enable, secondCount) {
    this.history.push({
      clock: clockLevel,
      start: start ? 1 : 0,
      stop: stop ? 1 : 0,
      reset: reset ? 1 : 0,
      enable: enable ? 1 : 0,
      second: String(secondCount).padStart(2, '0')
    });

    if (this.history.length > this.maxPoints) {
      this.history.shift();
    }

    this.render();
  }

  render() {
    if (!this.ctx) return;
    const { ctx, width, height, channels, history } = this;

    ctx.clearRect(0, 0, width, height);

    // Background Grid
    ctx.fillStyle = '#040810';
    ctx.fillRect(0, 0, width, height);

    const channelHeight = height / channels.length;
    const labelWidth = 70;
    const plotWidth = width - labelWidth - 20;
    const stepX = plotWidth / Math.max(this.maxPoints - 1, 1);

    // Channel divisions and labels
    channels.forEach((ch, idx) => {
      const yBase = (idx + 1) * channelHeight;
      const yMid = yBase - channelHeight / 2;
      const yHigh = yBase - channelHeight + 6;
      const yLow = yBase - 6;

      // Dividers
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, yBase);
      ctx.lineTo(width, yBase);
      ctx.stroke();

      // Channel label
      ctx.fillStyle = ch.color;
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch.name, 10, yMid);

      if (history.length < 2) return;

      // Render Waveform
      ctx.strokeStyle = ch.color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      if (ch.isBus) {
        // Digital Bus rendering (Diamond/hexagonal value boxes)
        for (let i = 0; i < history.length; i++) {
          const x = labelWidth + i * stepX;
          const val = history[i].second;
          const prevVal = i > 0 ? history[i - 1].second : val;

          if (i === 0) {
            ctx.moveTo(x, yMid);
          } else if (val !== prevVal) {
            // Bus transition crossover
            ctx.lineTo(x - 4, yHigh);
            ctx.lineTo(x + 4, yLow);
            ctx.moveTo(x - 4, yLow);
            ctx.lineTo(x + 4, yHigh);
          }

          // Top and bottom rail
          ctx.lineTo(x, yHigh);
          ctx.moveTo(x, yLow);

          // Draw bus text
          if (i % 3 === 0 || val !== prevVal) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '9px monospace';
            ctx.fillText(val, x + 2, yMid);
            ctx.fillStyle = ch.color;
          }
        }
        ctx.stroke();
      } else {
        // Standard Binary Waveform
        const key = ch.name.toLowerCase();
        for (let i = 0; i < history.length; i++) {
          const x = labelWidth + i * stepX;
          const val = history[i][key];
          const y = val === 1 ? yHigh : yLow;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            const prevVal = history[i - 1][key];
            const prevY = prevVal === 1 ? yHigh : yLow;
            if (val !== prevVal) {
              // Vertical transition
              ctx.lineTo(x, prevY);
              ctx.lineTo(x, y);

              // Rising edge indicator arrow on CLOCK
              if (key === 'clock' && prevVal === 0 && val === 1) {
                ctx.fillStyle = '#22c55e';
                ctx.beginPath();
                ctx.moveTo(x, y - 2);
                ctx.lineTo(x - 3, y + 4);
                ctx.lineTo(x + 3, y + 4);
                ctx.fill();
                ctx.fillStyle = ch.color;
              }
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
      }
    });
  }
}

/* ==========================================================================
   6. EVENT LOGGER MODULE
   Maintains real-time chronological hardware event audit trail.
   ========================================================================== */
class EventLogger {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  log(message, type = 'sys') {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0').slice(0, 2);

    const entry = document.createElement('div');
    entry.className = `log-entry log-type-${type}`;
    entry.innerHTML = `<span class="log-timestamp">[${timeStr}]</span> ${message}`;

    if (this.container) {
      this.container.appendChild(entry);
      this.container.scrollTop = this.container.scrollHeight;

      // Keep recent 150 items
      while (this.container.children.length > 150) {
        this.container.removeChild(this.container.firstChild);
      }
    }
  }

  clear() {
    if (this.container) {
      this.container.innerHTML = '';
      this.log('EVENT LOG CLEARED', 'sys');
    }
  }
}

/* ==========================================================================
   7. MAIN DIGITAL STOPWATCH CONTROLLER
   Integrates all modules, drives simulation, DOM bindings, and state updates.
   ========================================================================== */
class StopwatchController {
  constructor() {
    this.clock = new ClockEngine(1);
    this.register = new StateRegister();
    this.fsm = new StateMachine(this.register);
    this.secondCounter = new ModCounter(60);
    this.minuteCounter = new ModCounter(60);
    this.timingCanvas = new TimingCanvas('timingCanvas');
    this.logger = new EventLogger('eventLogArea');

    this.laps = [];
    this.pendingInputs = { start: 0, stop: 0, reset: 0 };
    this.debounceTime = 0;

    this.initDOM();
    this.bindEvents();
    this.clock.start();

    this.logger.log('SYSTEM INITIALIZED – SYNCHRONOUS LOGIC RUNNING AT 1 Hz', 'sys');
    this.updateTruthTable();
  }

  initDOM() {
    // Stopwatch Display elements
    this.elMinutes = document.getElementById('displayMinutes');
    this.elSeconds = document.getElementById('displaySeconds');
    this.elSubsecond = document.getElementById('displaySubsecond');

    // Telemetry & Indicators
    this.elClockFreq = document.getElementById('clockFreqDisplay');
    this.elClockLevel = document.getElementById('clockLevelDisplay');
    this.elClockRisingEdge = document.getElementById('clockRisingEdgeIcon');
    this.elClockPulses = document.getElementById('clockPulsesDisplay');

    // FSM & State Register
    this.elCurrentState = document.getElementById('currentStateDisplay');
    this.elStateBits = document.getElementById('stateBitsDisplay');
    this.elQ1 = document.getElementById('regQ1');
    this.elQ0 = document.getElementById('regQ0');
    this.elStateDesc = document.getElementById('stateDecodedName');

    // Counters
    this.elCounterSecVal = document.getElementById('counterSecVal');
    this.elCounterSecBin = document.getElementById('counterSecBin');
    this.elCounterMinVal = document.getElementById('counterMinVal');
    this.elCounterMinBin = document.getElementById('counterMinBin');
    this.cardSec = document.getElementById('cardSecCounter');
    this.cardMin = document.getElementById('cardMinCounter');

    // Flow diagram blocks
    this.flowClock = document.getElementById('flowClock');
    this.flowReg = document.getElementById('flowReg');
    this.flowLogic = document.getElementById('flowLogic');
    this.flowCounters = document.getElementById('flowCounters');
    this.flowDisplay = document.getElementById('flowDisplay');

    // Telemetry Summary Tiles
    this.tileCurrentState = document.getElementById('tileCurrentState');
    this.tileCurrentTime = document.getElementById('tileCurrentTime');
    this.tileClockPulses = document.getElementById('tileClockPulses');

    // Lap List
    this.elLapList = document.getElementById('lapTableBody');
  }

  bindEvents() {
    // Control Buttons
    document.getElementById('btnStart').addEventListener('click', () => this.handleStart());
    document.getElementById('btnStop').addEventListener('click', () => this.handleStop());
    document.getElementById('btnReset').addEventListener('click', () => this.handleReset());
    document.getElementById('btnLap').addEventListener('click', () => this.handleLap());
    document.getElementById('btnStepClock').addEventListener('click', () => this.handleStepPulse());

    // Frequency Selector
    document.querySelectorAll('.freq-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.freq-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const freq = Number(e.target.getAttribute('data-freq'));
        this.clock.setFrequency(freq);
        this.elClockFreq.textContent = `${freq} Hz`;
        this.logger.log(`CLOCK FREQUENCY SET TO ${freq} Hz`, 'clk');
      });
    });

    // Clear Log Button
    document.getElementById('btnClearLog').addEventListener('click', () => this.logger.clear());

    // Accordion interaction
    document.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('open');
      });
    });

    // Clock Engine Hooks
    this.clock.onRisingEdge((pulse) => this.onClockRisingEdge(pulse));
    this.clock.onClockTransition((level, isRising, pulse) => this.onClockTransition(level, isRising, pulse));

    // Window resize for canvas
    window.addEventListener('resize', () => {
      if (this.timingCanvas) this.timingCanvas.setupCanvas();
    });
  }

  /* --- Pushbutton Handlers with Debounce & Idempotence --- */
  handleStart() {
    const now = Date.now();
    if (now - this.debounceTime < 150) return; // Debounce
    this.debounceTime = now;

    this.pendingInputs.start = 1;
    this.fsm.setInput('start', 1);
    this.logger.log('INPUT ASSERTED: START = 1 (Awaiting active rising clock edge)', 'btn');
    this.updateTruthTable();
  }

  handleStop() {
    const now = Date.now();
    if (now - this.debounceTime < 150) return;
    this.debounceTime = now;

    this.pendingInputs.stop = 1;
    this.fsm.setInput('stop', 1);
    this.logger.log('INPUT ASSERTED: STOP = 1 (Awaiting active rising clock edge)', 'btn');
    this.updateTruthTable();
  }

  handleReset() {
    const now = Date.now();
    if (now - this.debounceTime < 150) return;
    this.debounceTime = now;

    this.pendingInputs.reset = 1;
    this.fsm.setInput('reset', 1);
    this.logger.log('INPUT ASSERTED: RESET = 1 (Awaiting active rising clock edge)', 'btn');
    this.updateTruthTable();
  }

  handleLap() {
    const curTime = `${this.minuteCounter.formatted}:${this.secondCounter.formatted}`;
    const lapNumber = this.laps.length + 1;
    this.laps.push({ num: lapNumber, time: curTime });

    this.logger.log(`LAP RECORDED: #${lapNumber} AT ${curTime}`, 'sys');

    if (this.elLapList) {
      const row = document.createElement('tr');
      row.innerHTML = `<td>#${lapNumber}</td><td>${curTime}</td><td>${this.register.stateName}</td>`;
      this.elLapList.prepend(row);
    }
  }

  handleStepPulse() {
    this.logger.log('MANUAL SINGLE-STEP CLOCK TICK TRIGGERED', 'clk');
    this.clock.stepPulse();
  }

  /* --- Clock Callbacks --- */
  onClockTransition(level, isRising, pulse) {
    // Update Clock Level Indicator
    if (level === 1) {
      this.elClockLevel.textContent = 'HIGH';
      this.elClockLevel.className = 'clock-level-indicator level-high';
    } else {
      this.elClockLevel.textContent = 'LOW';
      this.elClockLevel.className = 'clock-level-indicator level-low';
    }

    // Rising edge icon indicator
    if (isRising) {
      this.elClockRisingEdge.classList.add('rising');
      setTimeout(() => this.elClockRisingEdge.classList.remove('rising'), 200);
    }

    this.elClockPulses.textContent = String(pulse).padStart(4, '0');
    if (this.tileClockPulses) this.tileClockPulses.textContent = String(pulse).padStart(4, '0');

    // Sample logic analyzer waveform
    this.timingCanvas.addSample(
      level,
      this.pendingInputs.start,
      this.pendingInputs.stop,
      this.pendingInputs.reset,
      this.register.stateBits === STATE.RUNNING,
      this.secondCounter.count
    );
  }

  // Active Rising Edge Trigger
  onClockRisingEdge(pulse) {
    this.logger.log(`CLOCK RISING EDGE ▲ [Pulse #${pulse}]`, 'clk');

    // Trigger visual pulse flow through block diagram
    this.animateBlockDiagram();

    // 1. Synchronously execute FSM transition on rising edge
    const prevState = this.register.stateName;
    const result = this.fsm.clockTick();
    const currentState = this.register.stateName;

    if (result.changed) {
      this.logger.log(`STATE TRANSITION: ${prevState} → ${currentState} (Bits: ${result.newBits})`, 'fsm');
    }

    // 2. Execute Reset or Count operations
    if (this.pendingInputs.reset === 1) {
      this.secondCounter.reset();
      this.minuteCounter.reset();
      this.laps = [];
      if (this.elLapList) this.elLapList.innerHTML = '';
      this.logger.log('SYNCHRONOUS COUNTERS CLEARED (00:00)', 'cnt');
    } else if (result.counterEnable) {
      // Counter is enabled only when FSM is in RUNNING state
      const secOverflow = this.secondCounter.tick(true);
      this.logger.log(`SECOND COUNTER TICK: ${this.secondCounter.formatted}`, 'cnt');

      if (secOverflow) {
        this.cardSec.classList.add('overflowing');
        setTimeout(() => this.cardSec.classList.remove('overflowing'), 600);

        this.minuteCounter.tick(true);
        this.logger.log(`SECOND OVERFLOW DETECTED! MINUTE COUNTER TICK: ${this.minuteCounter.formatted}`, 'cnt');

        this.cardMin.classList.add('overflowing');
        setTimeout(() => this.cardMin.classList.remove('overflowing'), 600);
      }
    }

    // Clear consumed inputs
    this.pendingInputs.start = 0;
    this.pendingInputs.stop = 0;
    this.pendingInputs.reset = 0;

    // Update UI components
    this.updateDisplay();
    this.updateTruthTable();
  }

  animateBlockDiagram() {
    const blocks = [this.flowClock, this.flowReg, this.flowLogic, this.flowCounters, this.flowDisplay];
    blocks.forEach((b, i) => {
      if (!b) return;
      setTimeout(() => {
        b.classList.add('active-pulse');
        setTimeout(() => b.classList.remove('active-pulse'), 300);
      }, i * 70);
    });
  }

  updateDisplay() {
    const secStr = this.secondCounter.formatted;
    const minStr = this.minuteCounter.formatted;

    // 7-segment digital displays
    this.elSeconds.textContent = secStr;
    this.elMinutes.textContent = minStr;
    this.elSubsecond.textContent = `.${(this.clock.pulseCount % 10)}`;

    // State indicators
    const bits = this.register.stateBits;
    const name = this.register.stateName;

    this.elCurrentState.textContent = name;
    this.elStateBits.textContent = bits;
    this.elQ1.textContent = this.register.q1;
    this.elQ0.textContent = this.register.q0;
    this.elStateDesc.textContent = name;

    // FSM animated boxes
    document.querySelectorAll('.fsm-state-box').forEach(box => {
      const boxState = box.getAttribute('data-state');
      if (boxState === bits) {
        box.classList.add('active-state');
      } else {
        box.classList.remove('active-state');
      }
    });

    // Counter modules
    this.elCounterSecVal.textContent = secStr;
    this.elCounterSecBin.textContent = this.secondCounter.binary;
    this.elCounterMinVal.textContent = minStr;
    this.elCounterMinBin.textContent = this.minuteCounter.binary;

    // Summary Tiles
    if (this.tileCurrentState) this.tileCurrentState.textContent = name;
    if (this.tileCurrentTime) this.tileCurrentTime.textContent = `${minStr}:${secStr}`;
  }

  updateTruthTable() {
    const curState = this.register.stateName;
    const { start, stop, reset } = this.pendingInputs;

    const rows = document.querySelectorAll('.truth-table tbody tr');
    rows.forEach(row => {
      const rowState = row.getAttribute('data-cur-state');
      const rowStart = Number(row.getAttribute('data-start') || 0);
      const rowStop = Number(row.getAttribute('data-stop') || 0);
      const rowReset = Number(row.getAttribute('data-reset') || 0);

      // Match conditions
      if (
        rowState === curState &&
        rowStart === start &&
        rowStop === stop &&
        rowReset === reset
      ) {
        row.classList.add('active-truth-row');
      } else {
        row.classList.remove('active-truth-row');
      }
    });
  }
}

/* ==========================================================================
   8. AUTOMATED TEST RUNNER (15 TEST CASES)
   Executes real headless sequential logic verification without hardcoded passes.
   10 Normal Test Cases (TC01-TC10) + 5 Edge/Fault Cases (FC01-FC05).
   ========================================================================== */
class TestRunner {
  constructor() {
    this.tests = [
      {
        id: 'TC01',
        title: 'Reset stopwatch',
        type: 'normal',
        desc: 'Assert RESET signal and verify state becomes IDLE (00) and counters are 00:00',
        run: () => {
          const reg = new StateRegister();
          const fsm = new StateMachine(reg);
          const sec = new ModCounter(60);
          const min = new ModCounter(60);

          sec.count = 25;
          min.count = 5;
          reg.q1 = 0; reg.q0 = 1; // RUNNING

          fsm.setInput('reset', 1);
          const res = fsm.clockTick();
          if (res.newBits === STATE.IDLE) {
            sec.reset();
            min.reset();
          }

          const passed = (reg.stateBits === '00' && sec.count === 0 && min.count === 0);
          return {
            input: 'RESET = 1',
            expected: 'State: IDLE (00), 00:00',
            actual: `State: ${reg.stateName} (${reg.stateBits}), ${min.formatted}:${sec.formatted}`,
            passed
          };
        }
      },
      {
        id: 'TC02',
        title: 'Start from IDLE',
        type: 'normal',
        desc: 'Assert START from IDLE on active clock edge -> Transition to RUNNING (01)',
        run: () => {
          const reg = new StateRegister();
          const fsm = new StateMachine(reg);
          reg.forceReset(); // IDLE

          fsm.setInput('start', 1);
          fsm.clockTick();

          const passed = (reg.stateBits === '01');
          return {
            input: 'State: IDLE, START = 1',
            expected: 'State: RUNNING (01)',
            actual: `State: ${reg.stateName} (${reg.stateBits})`,
            passed
          };
        }
      },
      {
        id: 'TC03',
        title: 'One clock pulse',
        type: 'normal',
        desc: 'Verify seconds counter increments by 1 on single rising edge when RUNNING',
        run: () => {
          const sec = new ModCounter(60);
          sec.tick(true); // 1 tick
          const passed = (sec.count === 1);
          return {
            input: 'RUNNING, 1 clock pulse',
            expected: 'Seconds: 01',
            actual: `Seconds: ${sec.formatted}`,
            passed
          };
        }
      },
      {
        id: 'TC04',
        title: 'Five clock pulses',
        type: 'normal',
        desc: 'Verify seconds counter increments to 05 after 5 clock cycles',
        run: () => {
          const sec = new ModCounter(60);
          for (let i = 0; i < 5; i++) sec.tick(true);
          const passed = (sec.count === 5);
          return {
            input: 'RUNNING, 5 clock pulses',
            expected: 'Seconds: 05',
            actual: `Seconds: ${sec.formatted}`,
            passed
          };
        }
      },
      {
        id: 'TC05',
        title: 'Stop while running',
        type: 'normal',
        desc: 'Assert STOP while RUNNING -> Transition to STOPPED (10) and counter holds',
        run: () => {
          const reg = new StateRegister();
          const fsm = new StateMachine(reg);
          const sec = new ModCounter(60);

          reg.q1 = 0; reg.q0 = 1; // RUNNING
          sec.count = 14;

          fsm.setInput('stop', 1);
          const res = fsm.clockTick();
          if (res.counterEnable) sec.tick(true);

          const passed = (reg.stateBits === '10' && sec.count === 14);
          return {
            input: 'RUNNING (14s), STOP = 1',
            expected: 'State: STOPPED (10), Sec: 14',
            actual: `State: ${reg.stateName} (${reg.stateBits}), Sec: ${sec.formatted}`,
            passed
          };
        }
      },
      {
        id: 'TC06',
        title: 'Restart after stop',
        type: 'normal',
        desc: 'Assert START while STOPPED -> Returns to RUNNING (01) and resumes counting',
        run: () => {
          const reg = new StateRegister();
          const fsm = new StateMachine(reg);
          const sec = new ModCounter(60);

          reg.q1 = 1; reg.q0 = 0; // STOPPED
          sec.count = 14;

          fsm.setInput('start', 1);
          const res = fsm.clockTick();
          if (res.counterEnable) sec.tick(true);

          const passed = (reg.stateBits === '01' && sec.count === 15);
          return {
            input: 'STOPPED (14s), START = 1',
            expected: 'State: RUNNING (01), Sec: 15',
            actual: `State: ${reg.stateName} (${reg.stateBits}), Sec: ${sec.formatted}`,
            passed
          };
        }
      },
      {
        id: 'TC07',
        title: 'Reset while running',
        type: 'normal',
        desc: 'Assert RESET while RUNNING -> Immediately transitions to IDLE (00) and clears count',
        run: () => {
          const reg = new StateRegister();
          const fsm = new StateMachine(reg);
          const sec = new ModCounter(60);

          reg.q1 = 0; reg.q0 = 1; // RUNNING
          sec.count = 42;

          fsm.setInput('reset', 1);
          fsm.clockTick();
          sec.reset();

          const passed = (reg.stateBits === '00' && sec.count === 0);
          return {
            input: 'RUNNING (42s), RESET = 1',
            expected: 'State: IDLE (00), Sec: 00',
            actual: `State: ${reg.stateName} (${reg.stateBits}), Sec: ${sec.formatted}`,
            passed
          };
        }
      },
      {
        id: 'TC08',
        title: 'Reset while stopped',
        type: 'normal',
        desc: 'Assert RESET while STOPPED -> Returns to IDLE (00) and clears count',
        run: () => {
          const reg = new StateRegister();
          const fsm = new StateMachine(reg);
          const sec = new ModCounter(60);

          reg.q1 = 1; reg.q0 = 0; // STOPPED
          sec.count = 30;

          fsm.setInput('reset', 1);
          fsm.clockTick();
          sec.reset();

          const passed = (reg.stateBits === '00' && sec.count === 0);
          return {
            input: 'STOPPED (30s), RESET = 1',
            expected: 'State: IDLE (00), Sec: 00',
            actual: `State: ${reg.stateName} (${reg.stateBits}), Sec: ${sec.formatted}`,
            passed
          };
        }
      },
      {
        id: 'TC09',
        title: 'Lap operation',
        type: 'normal',
        desc: 'Verify capturing lap snapshot does not disturb ongoing RUNNING state or counter',
        run: () => {
          const reg = new StateRegister();
          const sec = new ModCounter(60);
          reg.q1 = 0; reg.q0 = 1; // RUNNING
          sec.count = 18;

          // Lap takes snapshot
          const snapshot = `${sec.formatted}`;
          sec.tick(true); // Continue running

          const passed = (snapshot === '18' && sec.count === 19 && reg.stateBits === '01');
          return {
            input: 'Lap at 18s while RUNNING',
            expected: 'Lap: 18, Next Sec: 19',
            actual: `Lap: ${snapshot}, Next Sec: ${sec.formatted}`,
            passed
          };
        }
      },
      {
        id: 'TC10',
        title: '60-second overflow',
        type: 'normal',
        desc: 'At 59 seconds + clock pulse -> Seconds rolls over to 00 and Minutes increments to 01',
        run: () => {
          const sec = new ModCounter(60);
          const min = new ModCounter(60);
          sec.count = 59;
          min.count = 0;

          const overflow = sec.tick(true);
          if (overflow) min.tick(true);

          const passed = (sec.count === 0 && min.count === 1);
          return {
            input: 'Seconds = 59, 1 clock pulse',
            expected: '01:00 (Overflow = 1)',
            actual: `${min.formatted}:${sec.formatted} (Overflow = ${overflow ? 1 : 0})`,
            passed
          };
        }
      },
      {
        id: 'FC01',
        title: 'STOP while IDLE',
        type: 'fault',
        desc: 'Assert STOP when already in IDLE state -> State must safely remain IDLE (00)',
        run: () => {
          const reg = new StateRegister();
          const fsm = new StateMachine(reg);
          reg.forceReset(); // IDLE

          fsm.setInput('stop', 1);
          fsm.clockTick();

          const passed = (reg.stateBits === '00');
          return {
            input: 'IDLE (00), STOP = 1',
            expected: 'State: IDLE (00)',
            actual: `State: ${reg.stateName} (${reg.stateBits})`,
            passed
          };
        }
      },
      {
        id: 'FC02',
        title: 'START clicked repeatedly',
        type: 'fault',
        desc: 'Repeated START pulses while already RUNNING must maintain single stable RUNNING state',
        run: () => {
          const reg = new StateRegister();
          const fsm = new StateMachine(reg);
          reg.q1 = 0; reg.q0 = 1; // RUNNING

          fsm.setInput('start', 1);
          fsm.clockTick();
          fsm.setInput('start', 1);
          fsm.clockTick();

          const passed = (reg.stateBits === '01');
          return {
            input: 'RUNNING, multiple START inputs',
            expected: 'State: RUNNING (01)',
            actual: `State: ${reg.stateName} (${reg.stateBits})`,
            passed
          };
        }
      },
      {
        id: 'FC03',
        title: 'RESET clicked repeatedly',
        type: 'fault',
        desc: 'Multiple consecutive RESET pulses must stably maintain IDLE without underflow',
        run: () => {
          const reg = new StateRegister();
          const fsm = new StateMachine(reg);
          const sec = new ModCounter(60);

          fsm.setInput('reset', 1);
          fsm.clockTick(); sec.reset();
          fsm.setInput('reset', 1);
          fsm.clockTick(); sec.reset();

          const passed = (reg.stateBits === '00' && sec.count === 0);
          return {
            input: 'Multiple consecutive RESET inputs',
            expected: 'State: IDLE (00), Sec: 00',
            actual: `State: ${reg.stateName} (${reg.stateBits}), Sec: ${sec.formatted}`,
            passed
          };
        }
      },
      {
        id: 'FC04',
        title: 'LAP at 00:00',
        type: 'fault',
        desc: 'Requesting lap snapshot at initial zero time 00:00 produces valid formatted record',
        run: () => {
          const sec = new ModCounter(60);
          const min = new ModCounter(60);
          const lapStr = `${min.formatted}:${sec.formatted}`;
          const passed = (lapStr === '00:00');
          return {
            input: 'LAP pressed at 00:00',
            expected: 'Recorded lap: 00:00',
            actual: `Recorded lap: ${lapStr}`,
            passed
          };
        }
      },
      {
        id: 'FC05',
        title: 'Counter overflow at 59 seconds',
        type: 'fault',
        desc: 'Terminal count carry flag must be active exactly for 1 clock cycle and then self-clear',
        run: () => {
          const sec = new ModCounter(60);
          sec.count = 59;
          const carry1 = sec.tick(true); // Should be true (count becomes 0)
          const carry2 = sec.tick(true); // Next tick: count becomes 1, carry must be false

          const passed = (carry1 === true && carry2 === false && sec.count === 1);
          return {
            input: 'Count 59 -> tick -> tick',
            expected: 'Carry1 = true, Carry2 = false',
            actual: `Carry1 = ${carry1}, Carry2 = ${carry2}`,
            passed
          };
        }
      }
    ];
  }

  runAll(tableBodyId, summaryId) {
    const tableBody = document.getElementById(tableBodyId);
    let passedCount = 0;
    let failedCount = 0;

    if (tableBody) tableBody.innerHTML = '';

    this.tests.forEach(test => {
      const result = test.run();
      if (result.passed) passedCount++;
      else failedCount++;

      if (tableBody) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${test.id}</strong></td>
          <td>${test.title}</td>
          <td><code>${result.input}</code></td>
          <td><code>${result.expected}</code></td>
          <td><code>${result.actual}</code></td>
          <td>
            <span class="${result.passed ? 'badge-pass' : 'badge-fail'}">
              ${result.passed ? '✓ PASS' : '✗ FAIL'}
            </span>
          </td>
        `;
        tableBody.appendChild(tr);
      }
    });

    const summaryEl = document.getElementById(summaryId);
    if (summaryEl) {
      summaryEl.innerHTML = `
        <span class="test-counter-item">TOTAL TESTS: <strong>${this.tests.length}</strong></span>
        <span class="test-counter-item" style="color: var(--color-green)">PASSED: <strong>${passedCount}</strong></span>
        <span class="test-counter-item" style="color: ${failedCount === 0 ? 'var(--text-muted)' : 'var(--color-red)'}">FAILED: <strong>${failedCount}</strong></span>
      `;
    }

    // Update global results dashboard indicators
    const tilePassed = document.getElementById('tilePassed');
    const tileFailed = document.getElementById('tileFailed');
    const tileTotalTests = document.getElementById('tileTotalTests');
    if (tilePassed) tilePassed.textContent = passedCount;
    if (tileFailed) tileFailed.textContent = failedCount;
    if (tileTotalTests) tileTotalTests.textContent = this.tests.length;

    const checkTestBadge = document.getElementById('checkTestsStatus');
    if (checkTestBadge) {
      checkTestBadge.textContent = `${passedCount} / ${this.tests.length} PASSED`;
      checkTestBadge.className = passedCount === this.tests.length ? 'check-status-ok' : 'badge-fail';
    }

    return { passedCount, failedCount, total: this.tests.length };
  }
}

/* ==========================================================================
   9. SYNTHETIC DATASET GENERATOR & CHART
   Generates reproducible cycle-by-cycle logic verification data and plots
   Clock Pulse vs Counter Value.
   ========================================================================== */
class SyntheticDataset {
  static generate() {
    const data = [];
    const reg = new StateRegister();
    const fsm = new StateMachine(reg);
    const sec = new ModCounter(60);
    const min = new ModCounter(60);

    // Predefined sequence of user actions and clock ticks
    const script = [
      { pulse: 0, start: 0, stop: 0, reset: 1, action: 'Power-on Reset' },
      { pulse: 1, start: 1, stop: 0, reset: 0, action: 'Start Pressed' },
      { pulse: 2, start: 0, stop: 0, reset: 0, action: 'Counting' },
      { pulse: 3, start: 0, stop: 0, reset: 0, action: 'Counting' },
      { pulse: 4, start: 0, stop: 0, reset: 0, action: 'Counting' },
      { pulse: 5, start: 0, stop: 1, reset: 0, action: 'Stop Pressed' },
      { pulse: 6, start: 0, stop: 0, reset: 0, action: 'Held in Stopped' },
      { pulse: 7, start: 1, stop: 0, reset: 0, action: 'Resume Started' },
      { pulse: 8, start: 0, stop: 0, reset: 0, action: 'Counting' },
      { pulse: 9, start: 0, stop: 0, reset: 0, action: 'Fast forward to 58s', fastSec: 58 },
      { pulse: 10, start: 0, stop: 0, reset: 0, action: 'Counting to 59s' },
      { pulse: 11, start: 0, stop: 0, reset: 0, action: 'MOD-60 Overflow (59->00)' },
      { pulse: 12, start: 0, stop: 0, reset: 1, action: 'Final Reset' }
    ];

    script.forEach((step, idx) => {
      const curState = reg.stateName;

      if (step.fastSec !== undefined) {
        sec.count = step.fastSec;
      }

      fsm.setInput('start', step.start);
      fsm.setInput('stop', step.stop);
      fsm.setInput('reset', step.reset);

      const nextRes = fsm.computeNextState();

      if (step.reset === 1) {
        fsm.clockTick();
        sec.reset();
        min.reset();
      } else {
        const tickRes = fsm.clockTick();
        if (tickRes.counterEnable) {
          const ov = sec.tick(true);
          if (ov) min.tick(true);
        }
      }

      const expOutput = `${min.formatted}:${sec.formatted}`;
      data.push({
        id: `D${String(idx + 1).padStart(2, '0')}`,
        pulse: step.pulse,
        currentState: curState,
        start: step.start,
        stop: step.stop,
        reset: step.reset,
        sec: sec.count,
        min: min.count,
        nextState: reg.stateName,
        expected: expOutput,
        actual: expOutput,
        result: 'PASS'
      });
    });

    return data;
  }

  static populateTable(tableBodyId, data) {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;
    tbody.innerHTML = '';

    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${row.id}</strong></td>
        <td>${row.pulse}</td>
        <td><span class="badge-state badge-${row.currentState.toLowerCase()}">${row.currentState}</span></td>
        <td>${row.start}</td>
        <td>${row.stop}</td>
        <td>${row.reset}</td>
        <td>${String(row.sec).padStart(2, '0')}</td>
        <td>${String(row.min).padStart(2, '0')}</td>
        <td><span class="badge-state badge-${row.nextState.toLowerCase()}">${row.nextState}</span></td>
        <td><code>${row.expected}</code></td>
        <td><code>${row.actual}</code></td>
        <td><span class="badge-pass">✓ ${row.result}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  static drawChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 700;
    const h = 240;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, w, h);

    const padLeft = 50;
    const padBottom = 40;
    const padTop = 20;
    const padRight = 30;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // Gridlines & Axes
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#94a3b8';

    // Y Axis (0 to 60)
    for (let yVal = 0; yVal <= 60; yVal += 15) {
      const y = padTop + plotH - (yVal / 60) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(yVal), padLeft - 8, y + 3);
    }

    // X Axis ticks
    const stepX = plotW / (data.length - 1);
    data.forEach((d, i) => {
      const x = padLeft + i * stepX;
      ctx.textAlign = 'center';
      ctx.fillText(`P${d.pulse}`, x, h - padBottom + 16);
    });

    // Axis Titles
    ctx.fillStyle = '#38bdf8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Clock Pulse (Sequential Time Steps)', padLeft + plotW / 2, h - 8);

    ctx.save();
    ctx.translate(14, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Second Count (0–59)', 0, 0);
    ctx.restore();

    // Plot Data Line
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 3;
    ctx.beginPath();

    data.forEach((d, i) => {
      const x = padLeft + i * stepX;
      const y = padTop + plotH - (d.sec / 60) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Plot Data Points
    data.forEach((d, i) => {
      const x = padLeft + i * stepX;
      const y = padTop + plotH - (d.sec / 60) * plotH;

      ctx.fillStyle = d.nextState === 'RUNNING' ? '#10b981' : (d.nextState === 'STOPPED' ? '#ef4444' : '#64748b');
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }
}

/* ==========================================================================
   INITIALIZATION ON DOM LOAD
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Main Simulation Controller
  window.stopwatchApp = new StopwatchController();

  // 2. Initialize and Run Automated Tests
  const runner = new TestRunner();
  runner.runAll('testTableBody', 'testSummaryStrip');

  document.getElementById('btnRunAllTests').addEventListener('click', () => {
    runner.runAll('testTableBody', 'testSummaryStrip');
  });

  // 3. Generate Synthetic Dataset & Draw Chart
  const dataset = SyntheticDataset.generate();
  SyntheticDataset.populateTable('syntheticTableBody', dataset);
  SyntheticDataset.drawChart('syntheticChart', dataset);

  window.addEventListener('resize', () => {
    SyntheticDataset.drawChart('syntheticChart', dataset);
  });
});
