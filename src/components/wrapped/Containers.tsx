import React from "react";

export const GenericValue = ({ text, number }: { text: string; number: string | bigint | number }) => {
  return (
    <div className="wrapped-value">
      <span className="wrapped-value-label" title={text}>
        {text}
      </span>
      <span className="wrapped-value-count">{(number || 0).toLocaleString()}</span>
    </div>
  );
};

type SectionWrapperProps = React.ComponentPropsWithoutRef<"section">;

export const SectionWrapper = ({ className, ...props }: SectionWrapperProps) => {
  return <section {...props} className={["wrapped-section", className].filter(Boolean).join(" ")} />;
};
export const SectionHeader = ({ children }: React.PropsWithChildren) => {
  return <h2 className="wrapped-section-title">{children}</h2>;
};
