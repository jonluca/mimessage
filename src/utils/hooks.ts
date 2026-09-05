import { useEffect, useLayoutEffect, useState } from "react";
import { throttle } from "lodash-es";
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const useWindowSize = () => {
  const [size, setSize] = useState([0, 0]);
  useIsomorphicLayoutEffect(() => {
    function updateSize() {
      setSize([window.innerWidth, window.innerHeight]);
    }

    const throttledUpdateSize = throttle(updateSize, 100);
    window.addEventListener("resize", throttledUpdateSize);
    updateSize();
    return () => {
      window.removeEventListener("resize", throttledUpdateSize);
      throttledUpdateSize.cancel();
    };
  }, []);
  return size;
};
