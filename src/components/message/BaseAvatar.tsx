import clsx from "clsx";
import * as React from "react";
import { SystemSymbol } from "../SystemSymbol";

export interface AvatarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  alt?: string;
  children?: React.ReactNode;
  imgProps?: React.ImgHTMLAttributes<HTMLImageElement>;
  sizes?: string;
  src?: React.ImgHTMLAttributes<HTMLImageElement>["src"];
  srcSet?: string;
  variant?: "circular" | "rounded" | "square";
}

const PersonFallback = () => <SystemSymbol className="native-avatar-person-icon" name="person-fill" />;

const getFallback = (alt: string | undefined) => {
  const firstCharacter = alt?.trim().match(/^\p{L}/u)?.[0];
  return firstCharacter ? firstCharacter.toLocaleUpperCase() : <PersonFallback />;
};

const useImageSource = (source: React.ImgHTMLAttributes<HTMLImageElement>["src"]) => {
  const [url, setUrl] = React.useState<string | undefined>(() => (typeof source === "string" ? source : undefined));

  React.useEffect(() => {
    if (!(source instanceof Blob)) {
      setUrl(source);
      return;
    }

    const objectUrl = URL.createObjectURL(source);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [source]);

  return url;
};

const useLoaded = ({
  crossOrigin,
  referrerPolicy,
  src,
  srcSet,
}: Pick<React.ImgHTMLAttributes<HTMLImageElement>, "crossOrigin" | "referrerPolicy" | "srcSet"> & { src?: string }) => {
  const [loaded, setLoaded] = React.useState<"error" | "loaded" | false>(false);

  React.useEffect(() => {
    if (!src && !srcSet) {
      return;
    }

    setLoaded(false);
    let active = true;
    const image = new Image();
    image.onload = () => active && setLoaded("loaded");
    image.onerror = () => active && setLoaded("error");
    image.crossOrigin = crossOrigin ?? null;
    image.referrerPolicy = referrerPolicy ?? "";
    if (src) {
      image.src = src;
    }
    if (srcSet) {
      image.srcset = srcSet;
    }

    return () => {
      active = false;
    };
  }, [crossOrigin, referrerPolicy, src, srcSet]);

  return loaded;
};

const Avatar = ({
  alt,
  children: childrenProp,
  className,
  imgProps,
  sizes,
  src,
  srcSet,
  style,
  variant = "circular",
  ...other
}: AvatarProps) => {
  const resolvedSrc = useImageSource(src ?? imgProps?.src);
  const resolvedSrcSet = srcSet ?? imgProps?.srcSet;
  const loaded = useLoaded({ ...imgProps, src: resolvedSrc, srcSet: resolvedSrcSet });
  const hasImage = Boolean((resolvedSrc || resolvedSrcSet) && loaded !== "error");
  const fallback = childrenProp ?? getFallback(alt);

  return (
    <div
      className={clsx("native-avatar", `native-avatar--${variant}`, !hasImage && "native-avatar--fallback", className)}
      style={style}
      {...other}
    >
      {hasImage ? (
        <img
          {...imgProps}
          alt={alt ?? ""}
          className={clsx("native-avatar-image", imgProps?.className)}
          sizes={sizes}
          src={resolvedSrc}
          srcSet={resolvedSrcSet}
        />
      ) : (
        fallback
      )}
    </div>
  );
};

export default Avatar;
