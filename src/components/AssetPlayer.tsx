import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import React, { useRef, useState } from "react";
import { cleanFileUrl } from "../utils/helpers";
import { CircularProgress } from "@mui/material";

export const WIDTH = "100%";
export const HEIGHT = "100%";
const NoData = () => (
  <Box style={{ width: WIDTH, height: HEIGHT, marginTop: 1 }}>
    <Typography sx={{ position: "absolute", top: "50%", left: "50%", color: "white" }}>No Data</Typography>
  </Box>
);
export const id = "video-player";
export const AssetPlayer = ({
  skipNoData,
  frame,
  isPreviewFrame,
  onError,
}: {
  skipNoData?: boolean;
  frame:
    | undefined
    | {
        filePath?: string | null | undefined;
        path?: string | null | undefined;
        videoFrameIndex?: number | null | undefined;
      }
    | null;
  isPreviewFrame?: boolean;
  onError?: () => void;
}) => {
  const ref = useRef<HTMLVideoElement>(null);

  const [isError, setIsError] = useState(false);

  const videoSourcePath = (frame && "filePath" in frame && cleanFileUrl(frame.filePath)) || "";
  const imageSourcePath = (frame && "path" in frame && cleanFileUrl(frame.path)) || "";

  if (!videoSourcePath && !imageSourcePath) {
    return skipNoData ? null : <NoData />;
  }

  const onLoadError = () => {
    console.log("error loading frame");
    onError?.();
    setIsError(true);
  };
  const onLoad = () => {
    setIsError(false);
  };
  const render = () => {
    if (videoSourcePath) {
      return (
        <video
          ref={ref}
          id={`${id}-${videoSourcePath}`}
          src={videoSourcePath}
          style={{
            width: WIDTH,
            height: HEIGHT,
            borderRadius: isPreviewFrame ? 8 : 0,
          }}
          crossOrigin={"anonymous"}
          preload={"auto"}
          playsInline={true}
          autoPlay={false}
          controls={false}
          muted={true}
          onError={onLoadError}
          onLoad={onLoad}
        />
      );
    }

    if (imageSourcePath) {
      return (
        <object
          data={imageSourcePath}
          type="image/png"
          style={{
            width: WIDTH,
            height: HEIGHT,
            objectFit: "contain",
          }}
          onError={onLoadError}
          onLoad={onLoad}
        >
          <CircularProgress
            sx={{
              position: "fixed",
              top: "50%",
              transition: "top 0.5s",
              left: "50%",
              transform: "translate(-50%, 0)",
              zIndex: 999,
              display: "flex",
              justifyContent: "center",
            }}
          />
        </object>
      );
    }
    return skipNoData ? null : <NoData />;
  };

  return <>{render()}</>;
};
