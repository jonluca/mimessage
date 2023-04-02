export class KeyPress {
  static pressedKeys = new Set<string>();

  static isPressed(key: string) {
    return KeyPress.pressedKeys.has(key);
  }

  static onKeydown(e: KeyboardEvent) {
    KeyPress.pressedKeys.add(e.key);
  }

  static onKeyup(e: KeyboardEvent) {
    KeyPress.pressedKeys.delete(e.key);
  }

  static isShiftPressed() {
    return KeyPress.isPressed("Shift");
  }

  static isCtrlPressed() {
    return KeyPress.isPressed("Control");
  }

  static isAltPressed() {
    return KeyPress.isPressed("Alt");
  }
  static init() {
    window.addEventListener("keyup", KeyPress.onKeyup);
    window.addEventListener("keydown", KeyPress.onKeydown);
  }

  static cleanup() {
    window.removeEventListener("keyup", KeyPress.onKeyup);
    window.removeEventListener("keydown", KeyPress.onKeydown);
  }
}
