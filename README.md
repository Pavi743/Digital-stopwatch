# Digital Stopwatch using Synchronous Sequential Circuits
  
**Project Category**: Synchronous Sequential Logic Design & Simulation  
**Technology Stack**: HTML5, Modern CSS3, Modular Vanilla ES6+ JavaScript (Offline / Zero-Dependency)

---

## 1. Project Title & Overview
**Title**: Digital Stopwatch using Synchronous Sequential Circuits  
**Description**: A complete software simulation platform modeling a laboratory-grade digital stopwatch. Rather than relying on simple software timers (`setInterval(() => seconds++, 1000)`), this project rigorously emulates the underlying digital hardware: master square-wave clock pulse generation, active rising-edge triggering, dual D/JK flip-flop state registers ($Q_1, Q_0$), next-state combinational excitation logic, and cascaded synchronous MOD-60 counters for seconds and minutes.

---

## 2. Problem Statement
Accurate timing in sports, industrial automation, avionics, and laboratory instrumentation requires exact measurement of elapsed time intervals. Conventional mechanical or non-synchronized timers introduce measurement errors:
- Human latency and reaction errors during activation.
- Unsynchronized software loops suffer from thread scheduling latency, event queue lag, and cumulative timing drift.
- Asynchronous (ripple) hardware circuits suffer from cascading propagation delays and transitional decoding glitches.

To guarantee deterministic, glitch-free timing, digital systems employ **Synchronous Sequential Circuits** where all internal memory elements and counters are clocked simultaneously by a common master oscillator.

---

## 3. Project Objective
1. Design and simulate a complete digital stopwatch system with **START**, **STOP**, **RESET**, and **LAP** controls.
2. Formulate and visualize the **Finite State Machine (FSM)** with three discrete states: `IDLE (00)`, `RUNNING (01)`, and `STOPPED (10)`.
3. Model the **State Register** utilizing dual flip-flop outputs ($Q_1, Q_0$) updated strictly on active rising clock edges ($\uparrow$).
4. Implement two cascaded **Synchronous MOD-60 Counters** (00–59) for seconds and minutes with synchronous terminal count carry propagation.
5. Provide real-time hardware telemetry including interactive clock frequency control (1 Hz, 2 Hz, 5 Hz), multi-channel digital logic analyzer waveforms, dynamic truth table row tracking, live event logging, and an automated 15-test-case verification suite.

---

## 4. Real-World Applications
1. **Athletics & Sports Timing**: Split-second lap capture and precise event timing.
2. **Industrial Process Control**: Synchronizing chemical reactions, conveyor transfers, and thermal dwell periods.
3. **Medical & Laboratory Equipment**: Centrifuge runtimes, ECG sample window recording, and diagnostic assay timing.
4. **Aerospace & Avionics**: Mission elapsed time (MET) clocks and avionics bus synchronization.
5. **Telecommunications**: Time-division multiplexing (TDM) frame intervals and packet lifetime watchdogs.

---
## 5. State Register Architecture (Flip-Flops)
The system stores its current operational state in a 2-bit state register composed of two D-type flip-flops ($FF_1$ and $FF_0$):
- **$Q_1$**: Most Significant Bit (MSB).
- **$Q_0$**: Least Significant Bit (LSB).

### State Assignments
| State Name | $Q_1$ | $Q_0$ | Description |
|---|---|---|---|
| **IDLE** | 0 | 0 | Stopwatch cleared (00:00). Waiting for START pulse. |
| **RUNNING** | 0 | 1 | Clock rising edges actively increment the seconds counter. |
| **STOPPED** | 1 | 0 | Counter clock enable disabled. Holds elapsed time. |
| *Unused* | 1 | 1 | Reserved / Fault condition (auto-recovers to IDLE). |

On each rising edge, the next-state excitation bits ($D_1, D_0$) are latched to the outputs:
$$Q_1(t+1) = D_1, \quad Q_0(t+1) = D_0$$

---

## 6. Counter Architecture (Cascaded Synchronous Counters)
The timing counter consists of two cascaded stages:
1. **Seconds Stage**: Synchronous MOD-60 Counter.
2. **Minutes Stage**: Synchronous MOD-60 Counter.

---

## 7. MOD-60 Counter Design
A standard binary counter with $N$ flip-flops has $2^N$ states.
- For MOD-60: $2^5 = 32 < 60 \le 2^6 = 64$. Therefore, **6 flip-flops** ($Q_5, Q_4, Q_3, Q_2, Q_1, Q_0$) are required.
- **Count Sequence**: Decimal 0 ($000000_2$) through Decimal 59 ($111011_2$).
- **Synchronous Reset / Terminal Count**:
  When the count reaches 59 ($111011_2$), the Terminal Count line asserts HIGH:
  $$\text{TC} = Q_5 \cdot Q_4 \cdot Q_3 \cdot \overline{Q_2} \cdot Q_1 \cdot Q_0$$
  On the next clock rising edge with enable active, the counter rolls over to $000000_2$, asserting a 1-clock-cycle carry pulse to the minutes counter.

---

## 8. System Inputs & Outputs
### Inputs
- `START` (Pushbutton): Asserted to transition from IDLE $\rightarrow$ RUNNING or STOPPED $\rightarrow$ RUNNING.
- `STOP` (Pushbutton): Asserted to transition from RUNNING $\rightarrow$ STOPPED.
- `RESET` (Pushbutton): Asynchronous/synchronous clear returning FSM to IDLE and resetting counters to 00:00.
- `LAP` (Pushbutton): Captures current counter values into memory without pausing counting.
- `CLOCK` (Oscillator): Periodic timebase driving synchronous updates.

### Outputs
- `Q1, Q0`: Current 2-bit state register outputs.
- `COUNTER_ENABLE`: Logic high enabling counter increment.
- `SEC_COUNT`: 6-bit binary bus / 2-digit decimal seconds value (00–59).
- `MIN_COUNT`: 6-bit binary bus / 2-digit decimal minutes value (00–59).
- `OVERFLOW_SEC`: Carry pulse propagated to minutes stage.
- `7-SEGMENT DISPLAY`: Visual output formatted as `MM:SS.d`.

---

## 9. Operational Assumptions
1. The default clock frequency is 1 Hz, representing 1-second pulse intervals.
2. The simulation uses a software-generated square-wave clock with 50% duty cycle.
3. Counter updates and state register latches occur strictly on the rising edge.
4. Seconds counter is MOD-60 (00–59).
5. Minutes counter is MOD-60 (00–59).
6. START enables counting synchronously.
7. STOP pauses counting synchronously, holding register values.
8. RESET clears all state flip-flops and counters to zero.
9. Stopwatch display format is standard `MM:SS`.

---

## 10. Truth Table & State Transition Matrix
| Current State | State Bits ($Q_1 Q_0$) | START | STOP | RESET | Next State ($Q_1^+ Q_0^+$) | Counter Action |
|---|---|---|---|---|---|---|
| **IDLE** | 00 | 0 | 0 | 0 | IDLE (00) | HOLD (Disabled) |
| **IDLE** | 00 | 1 | 0 | 0 | RUNNING (01) | ENABLE |
| **RUNNING** | 01 | 0 | 0 | 0 | RUNNING (01) | ENABLE (Increment) |
| **RUNNING** | 01 | 0 | 1 | 0 | STOPPED (10) | HOLD (Paused) |
| **RUNNING** | 01 | 0 | 0 | 1 | IDLE (00) | RESET (Clear) |
| **STOPPED** | 10 | 0 | 0 | 0 | STOPPED (10) | HOLD (Paused) |
| **STOPPED** | 10 | 1 | 0 | 0 | RUNNING (01) | ENABLE (Resume) |
| **STOPPED** | 10 | 0 | 0 | 1 | IDLE (00) | RESET (Clear) |

---

## 11. Timing Diagram Analysis
The real-time oscilloscope / logic analyzer visualizes six synchronous signal channels:
1. **`CLOCK`**: Master square wave alternating between 0 and 1. Green upward arrows ($\uparrow$) mark active rising edges.
2. **`START`**: Active-high pulse asserting start excitation.
3. **`STOP`**: Active-high pulse requesting state pause.
4. **`RESET`**: Master clear line overriding all states.
5. **`ENABLE`**: Internal control line ($Q_0 \cdot \overline{Q_1}$) high during RUNNING state.
6. **`SECOND BUS`**: Digital data bus showing numeric progression ($00 \rightarrow 01 \rightarrow 02 \dots 59 \rightarrow 00$).

---

## 12. Automated Verification Suite (15 Test Cases)
The integrated test engine evaluates genuine digital logic behavior across 10 Normal cases and 5 Edge/Fault cases:

### Normal Test Cases (10)
- **TC01 - Reset stopwatch**: Asserts RESET; verifies state is IDLE (00) and counters equal 00:00.
- **TC02 - Start from IDLE**: Asserts START; verifies transition to RUNNING (01) on next rising edge.
- **TC03 - One clock pulse**: In RUNNING state, one clock rising edge increments seconds from 00 to 01.
- **TC04 - Five clock pulses**: In RUNNING state, five clock rising edges increment seconds to 05.
- **TC05 - Stop while running**: Asserts STOP; verifies transition to STOPPED (10) and counter freezes.
- **TC06 - Restart after stop**: Asserts START while STOPPED; verifies transition to RUNNING (01) and resumes counting from current value.
- **TC07 - Reset while running**: Asserts RESET while RUNNING; returns to IDLE (00) and clears counts.
- **TC08 - Reset while stopped**: Asserts RESET while STOPPED; returns to IDLE (00) and clears counts.
- **TC09 - Lap operation**: Records instantaneous snapshot without disturbing counting or state registers.
- **TC10 - 60-second overflow**: At 59 seconds + clock pulse, seconds rolls over to 00 and minutes increments to 01.

### Edge / Fault Test Cases (5)
- **FC01 - STOP while IDLE**: Asserting STOP when in IDLE maintains safe IDLE (00) state without error.
- **FC02 - START clicked repeatedly**: Multiple consecutive START pulses do not duplicate timers or accelerate clock frequency (idempotence).
- **FC03 - RESET clicked repeatedly**: Multiple consecutive RESET pulses stably preserve IDLE (00) and 00:00 without underflow.
- **FC04 - LAP at 00:00**: Capturing lap at initial zero time yields valid `00:00` snapshot.
- **FC05 - Counter overflow at 59 seconds**: Terminal Count carry pulse asserts for exactly one clock cycle and deasserts on the next cycle.

---

## 12. How to Run the Application
The project requires **no web server, no Node.js runtime, no database, and no internet connection**.

### Running Locally
1. Navigate to the project directory:
   ```
   digital-stopwatch/
   ```
2. Double-click **`index.html`** or open it using any modern web browser:
   - Google Chrome
   - Microsoft Edge
   - Mozilla Firefox
   - Apple Safari
3. Alternatively, launch from PowerShell:
   ```powershell
   Start-Process index.html
   ```
---

## 13. Future Enhancements
1. **Fractional Split-Second Counter**: Cascading a MOD-100 decade counter for 1/100th-second precision.
2. **Hours Stage**: Adding a MOD-24 counter cascaded from the minutes overflow.
3. **Countdown Timer Mode**: Adding an up/down control line ($U/\overline{D}$) to support preset countdown intervals.
4. **VHDL / Verilog Code Exporter**: Adding a button to export equivalent synthesizable HDL code for FPGA implementation (e.g., Xilinx Spartan or Altera Cyclone).