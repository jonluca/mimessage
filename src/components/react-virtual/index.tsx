import * as React from "react";
import type { PartialKeys, VirtualizerOptions } from "./core";
import {
  elementScroll,
  observeElementOffset,
  observeElementRect,
  observeWindowOffset,
  observeWindowRect,
  Virtualizer,
  windowScroll,
} from "./core";
export * from "./core";

//

const useIsomorphicLayoutEffect = typeof document !== "undefined" ? React.useLayoutEffect : React.useEffect;

function useVirtualizerBase<TScrollElement extends Element | Window, TItemElement extends Element>(
  options: VirtualizerOptions<TScrollElement, TItemElement>,
): Virtualizer<TScrollElement, TItemElement> {
  const rerender = React.useReducer(() => ({}), {})[1];

  const resolvedOptions: VirtualizerOptions<TScrollElement, TItemElement> = {
    ...options,
    onChange: (instance) => {
      rerender();
      options.onChange?.(instance);
    },
  };

  const [instance] = React.useState(() => new Virtualizer<TScrollElement, TItemElement>(resolvedOptions));

  instance.setOptions(resolvedOptions);

  React.useEffect(() => {
    return instance._didMount();
  }, [instance]);

  useIsomorphicLayoutEffect(() => {
    return instance._willUpdate();
  });

  return instance;
}

export function useVirtualizer<TScrollElement extends Element, TItemElement extends Element>(
  options: PartialKeys<
    VirtualizerOptions<TScrollElement, TItemElement>,
    "observeElementRect" | "observeElementOffset" | "scrollToFn"
  >,
): Virtualizer<TScrollElement, TItemElement> {
  return useVirtualizerBase<TScrollElement, TItemElement>({
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    ...options,
  });
}

export function useWindowVirtualizer<TItemElement extends Element>(
  options: PartialKeys<
    VirtualizerOptions<Window, TItemElement>,
    "getScrollElement" | "observeElementRect" | "observeElementOffset" | "scrollToFn"
  >,
): Virtualizer<Window, TItemElement> {
  return useVirtualizerBase<Window, TItemElement>({
    getScrollElement: () => (typeof document !== "undefined" ? window : null),
    observeElementRect: observeWindowRect,
    observeElementOffset: observeWindowOffset,
    scrollToFn: windowScroll,
    ...options,
  });
}
