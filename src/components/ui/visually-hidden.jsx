import * as React from "react";

export const VisuallyHidden = React.forwardRef(({ children, asChild, ...props }, ref) => {
  const Comp = asChild ? React.Fragment : 'span';
  return (
    <Comp
      ref={ref}
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        borderWidth: 0,
      }}
      {...props}
    >
      {children}
    </Comp>
  );
});
VisuallyHidden.displayName = 'VisuallyHidden';