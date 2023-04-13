import * as React from "react";
import clsx from "clsx";
import { unstable_composeClasses as composeClasses } from "@mui/base";
import type { Theme } from "@mui/material/styles";
import { styled } from "@mui/material/styles";
import type { AvatarClasses } from "@mui/material/Avatar/avatarClasses";
import type { SxProps } from "@mui/system";
import type { OverridableStringUnion } from "@mui/types";
import type { OverrideProps } from "@mui/material/OverridableComponent";
import { useThemeProps } from "@mui/material/styles";
const defaultGenerator = (componentName: string) => componentName;

const createClassNameGenerator = () => {
  let generate = defaultGenerator;
  return {
    configure(generator: typeof generate) {
      generate = generator;
    },
    generate(componentName: string) {
      return generate(componentName);
    },
    reset() {
      generate = defaultGenerator;
    },
  };
};

const ClassNameGenerator = createClassNameGenerator();

export type GlobalStateSlot =
  | "active"
  | "checked"
  | "completed"
  | "disabled"
  | "readOnly"
  | "error"
  | "expanded"
  | "focused"
  | "focusVisible"
  | "required"
  | "selected";

const globalStateClassesMapping: Record<GlobalStateSlot, string> = {
  active: "active",
  checked: "checked",
  completed: "completed",
  disabled: "disabled",
  readOnly: "readOnly",
  error: "error",
  expanded: "expanded",
  focused: "focused",
  focusVisible: "focusVisible",
  required: "required",
  selected: "selected",
};

function generateUtilityClass(componentName: string, slot: string, globalStatePrefix = "Mui"): string {
  const globalStateClass = globalStateClassesMapping[slot as GlobalStateSlot];
  return globalStateClass
    ? `${globalStatePrefix}-${globalStateClass}`
    : `${ClassNameGenerator.generate(componentName)}-${slot}`;
}
function getAvatarUtilityClass(slot: string) {
  return generateUtilityClass("MuiAvatar", slot);
}

export interface AvatarPropsVariantOverrides {}

export interface AvatarTypeMap<P = object> {
  props: P & {
    /**
     * Used in combination with `src` or `srcSet` to
     * provide an alt attribute for the rendered `img` element.
     */
    alt?: string;
    /**
     * Used to render icon or text elements inside the Avatar if `src` is not set.
     * This can be an element, or just a string.
     */
    children?: React.ReactNode;
    /**
     * Override or extend the styles applied to the component.
     */
    classes?: Partial<AvatarClasses>;
    /**
     * [Attributes](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attributes) applied to the `img` element if the component is used to display an image.
     * It can be used to listen for the loading error event.
     */
    imgProps?: React.ImgHTMLAttributes<HTMLImageElement> & {
      sx?: SxProps<Theme>;
    };
    /**
     * The `sizes` attribute for the `img` element.
     */
    sizes?: string;
    /**
     * The `src` attribute for the `img` element.
     */
    src?: string;
    /**
     * The `srcSet` attribute for the `img` element.
     * Use this attribute for responsive image display.
     */
    srcSet?: string;
    /**
     * The system prop that allows defining system overrides as well as additional CSS styles.
     */
    sx?: SxProps<Theme>;
    /**
     * The shape of the avatar.
     * @default 'circular'
     */
    variant?: OverridableStringUnion<"circular" | "rounded" | "square", AvatarPropsVariantOverrides>;
  };
  defaultComponent: "div";
}

export type AvatarProps = OverrideProps<AvatarTypeMap, AvatarTypeMap["defaultComponent"]>;

const useUtilityClasses = (ownerState: AvatarProps & { colorDefault?: boolean }) => {
  const { classes, variant, colorDefault } = ownerState;

  const slots = {
    root: ["root", variant, colorDefault && "colorDefault"],
    img: ["img"],
    fallback: ["fallback"],
  };

  return composeClasses(slots, getAvatarUtilityClass, classes);
};

const AvatarRoot = styled("div", {
  name: "MuiAvatar",
  slot: "Root",
  overridesResolver: (props, styles) => {
    const { ownerState } = props;

    return [styles.root, styles[ownerState.variant], ownerState.colorDefault && styles.colorDefault];
  },
  // @ts-ignore
})(({ theme, ownerState }) => ({
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 40,
  height: 40,
  fontFamily: theme.typography.fontFamily,
  fontSize: theme.typography.pxToRem(20),
  lineHeight: 1,
  borderRadius: "50%",
  overflow: "hidden",
  userSelect: "none",
  ...(ownerState.variant === "rounded" && {
    borderRadius: theme.shape.borderRadius,
  }),
  ...(ownerState.variant === "square" && {
    borderRadius: 0,
  }),
  ...(ownerState.colorDefault && {
    color: theme.palette.background.default,
    backgroundColor: theme.palette.mode === "light" ? theme.palette.grey[400] : theme.palette.grey[600],
  }),
}));

const AvatarImg = styled("img", {
  name: "MuiAvatar",
  slot: "Img",
  overridesResolver: (props, styles) => styles.img,
})({
  width: "100%",
  height: "100%",
  textAlign: "center",
  // Handle non-square image. The property isn't supported by IE11.
  objectFit: "cover",
  // Hide alt text.
  color: "transparent",
  // Hide the image broken icon, only works on Chrome.
  textIndent: 10000,
});

function useLoaded({ crossOrigin, referrerPolicy, src, srcSet }: any) {
  const [loaded, setLoaded] = React.useState<string | boolean>(false);

  React.useEffect(() => {
    if (!src && !srcSet) {
      return undefined;
    }

    setLoaded(false);

    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) {
        return;
      }
      setLoaded("loaded");
    };
    image.onerror = () => {
      if (!active) {
        return;
      }
      setLoaded("error");
    };
    image.crossOrigin = crossOrigin;
    image.referrerPolicy = referrerPolicy;
    image.src = src;
    if (srcSet) {
      image.srcset = srcSet;
    }

    return () => {
      active = false;
    };
  }, [crossOrigin, referrerPolicy, src, srcSet]);

  return loaded;
}

const Avatar = (inProps: AvatarProps) => {
  const p = useThemeProps<any, AvatarProps, any>({ props: inProps, name: "MuiAvatar" });
  const {
    alt,
    children: childrenProp,
    className,
    imgProps,
    sizes,
    src,
    srcSet,
    variant = "circular",
    ...other
  } = p as AvatarProps;

  const component = "div";

  let children = null;

  // Use a hook instead of onError on the img element to support server-side rendering.
  const loaded = useLoaded({ ...imgProps, src, srcSet });
  const hasImg = src || srcSet;
  const hasImgNotFailing = hasImg && loaded !== "error";

  const ownerState = {
    ...p,
    colorDefault: !hasImgNotFailing,
    component,
    variant,
  };

  const classes = useUtilityClasses(ownerState);

  if (hasImgNotFailing) {
    children = (
      <AvatarImg
        alt={alt}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        // @ts-ignore
        ownerState={ownerState}
        className={classes.img}
        {...imgProps}
      />
    );
  } else if (childrenProp != null) {
    children = childrenProp;
  } else if (alt) {
    children = alt[0].toUpperCase();
  }

  return (
    // @ts-ignore
    <AvatarRoot as={component} ownerState={ownerState} className={clsx(classes.root, className)} {...other}>
      {children}
    </AvatarRoot>
  );
};
export default Avatar;
