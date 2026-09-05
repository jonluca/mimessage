# MiMessage Liquid Glass bridge

This N-API addon places a public AppKit `NSGlassEffectView` inside an
`NSGlassEffectContainerView` as a sibling behind Electron's renderer view. It is available
on macOS 26 or newer and reports `supported: false` everywhere else, allowing
the caller to retain Electron vibrancy as its fallback.

Build it for the installed Electron version and current architecture with:

```sh
yarn build:liquid-glass
```

On a macOS 26+ host, exercise the complete native lifecycle with:

```sh
yarn test:liquid-glass
```

The development output is `build/Release/mimessage_liquid_glass.node`; an
architecture-qualified copy is staged under `prebuilds/darwin-<arch>/` for
Electron Builder. The native API is
synchronous and consists of `support()`,
`add(windowHandle, options)`, `update(windowHandle, options)`, and
`remove(windowHandle)`. `windowHandle` must be the `Buffer` returned by
Electron's `BrowserWindow.getNativeWindowHandle()`. All AppKit mutations are
marshaled onto the main thread.

The optional `frame` uses Electron-style top-left coordinates in logical
points. Omit `width` or `height` to extend that edge with the window as it
resizes. Omit `frame` entirely to fill the content view. Web content above the
glass still needs transparent backgrounds wherever the native material should
be visible.
