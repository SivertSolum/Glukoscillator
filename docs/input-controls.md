# 🎹 Input Controls

Glukoscillator supports multiple input methods for playing notes: virtual piano, computer keyboard, and MIDI devices.

---

## Virtual Piano

Click or touch the on-screen piano keyboard to play notes.

**Features:**
- Responsive sizing (3-6 octaves depending on screen width)
- Visual feedback on pressed keys
- Supports mouse drag across keys
- Touch-friendly on tablets

---

## Computer Keyboard

The QWERTY keyboard is mapped to piano notes in a standard piano-roll layout.

### Layout Overview

```
Lower row (Z-M):  C3  C#3  D3  D#3  E3  F3  F#3  G3  G#3  A3  A#3  B3
                  Z   S    X   D    C   V   G    B   H    N   J    M

Upper row (Q-U):  C4  C#4  D4  D#4  E4  F4  F#4  G4  G#4  A4  A#4  B4
                  Q   2    W   3    E   R   5    T   6    Y   7    U

Extended (I-P):   C5  C#5  D5  D#5  E5
                  I   9    O   0    P
```

### Visual Reference

<table>
<tr>
<td>

**Octave 3 (Z-M row)**
| Key | Note |
|-----|------|
| Z | C3 |
| S | C#3 |
| X | D3 |
| D | D#3 |
| C | E3 |
| V | F3 |
| G | F#3 |
| B | G3 |
| H | G#3 |
| N | A3 |
| J | A#3 |
| M | B3 |

</td>
<td>

**Octave 4 (Q-U row)**
| Key | Note |
|-----|------|
| Q | C4 |
| 2 | C#4 |
| W | D4 |
| 3 | D#4 |
| E | E4 |
| R | F4 |
| 5 | F#4 |
| T | G4 |
| 6 | G#4 |
| Y | A4 |
| 7 | A#4 |
| U | B4 |

</td>
<td>

**Octave 5 (I-P row)**
| Key | Note |
|-----|------|
| I | C5 |
| 9 | C#5 |
| O | D5 |
| 0 | D#5 |
| P | E5 |

</td>
</tr>
</table>

### Tips

- The layout mimics a real piano: letter keys are white notes, number keys are black notes
- You can hold multiple keys for chords
- Keys will highlight on the virtual piano when pressed

---

## MIDI Controller

Connect any class-compliant USB MIDI device for expressive control.

### Setup

1. Connect your MIDI controller to your computer
2. Open Glukoscillator in a browser that supports Web MIDI (Chrome, Edge, Opera)
3. Click "Start Audio" to initialize
4. MIDI devices are auto-detected

### Features

| Feature | Support |
|---------|---------|
| Note On/Off | ✓ Full support |
| Velocity | ✓ Controls volume |
| Multiple devices | ✓ Auto-selects first available |
| Hot-plugging | ✓ Detects new devices |

### Status Indicator

The MIDI status is shown in the UI:
- **"MIDI: Connected"** — Device detected and active
- **"MIDI: No device"** — No MIDI input found
- **"MIDI: Not supported"** — Browser doesn't support Web MIDI

### Browser Support

Web MIDI requires a Chromium-based browser:

| Browser | Support |
|---------|---------|
| Chrome | ✓ |
| Edge | ✓ |
| Opera | ✓ |
| Firefox | ✗ (requires flag) |
| Safari | ✗ |

---

## Input Priority

When multiple inputs trigger the same note:

1. All inputs work simultaneously
2. The note plays once regardless of input source
3. The note releases when all inputs release
4. Visual feedback shows on the piano keyboard for all input types

---

## Technical Details

### Keyboard Handler

**File:** `src/input/keyboard-handler.ts`

- Listens for `keydown` and `keyup` events
- Prevents key repeat (holds don't re-trigger)
- Maps key codes to note names
- Calls synth's `noteOn` and `noteOff` methods

### MIDI Handler

**File:** `src/input/midi-handler.ts`

- Uses the Web MIDI API (`navigator.requestMIDIAccess()`)
- Listens for `midimessage` events
- Parses Note On (0x90) and Note Off (0x80) messages
- Extracts velocity from MIDI data
- Handles device connection/disconnection

---

← [Glucose Sound Design](glucose-sound-design.md) | [LibreView Format →](libreview-format.md)

