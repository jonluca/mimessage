import { useEffect, useLayoutEffect, useState } from "react";
import { throttle } from "lodash-es";
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const useWindowSize = () => {
  const [size, setSize] = useState([0, 0]);
  useIsomorphicLayoutEffect(() => {
    function updateSize() {
      setSize([window.innerWidth, window.innerHeight]);
    }

    window.addEventListener("resize", throttle(updateSize, 100));
    updateSize();
    return () => window.removeEventListener("resize", updateSize);
  }, []);
  return size;
};
