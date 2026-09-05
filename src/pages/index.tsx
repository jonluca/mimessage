import React from "react";
import { Home } from "../components/Home";
import { useMimessage } from "../context";

const Index = () => {
  const setChatId = useMimessage((state) => state.setChatId);
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector('[aria-modal="true"]')) {
        setChatId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [setChatId]);

  return (
    <main className="messages-page-root">
      <Home />
    </main>
  );
};

export default Index;
