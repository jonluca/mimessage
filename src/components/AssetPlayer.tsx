import React, { useRef } from "react";
import type { Message } from "../interfaces";
import { isProd } from "../config";
import { useMimessage } from "../context";
import Box from "@mui/material/Box";
import { MessageBubbleText } from "./MessageBubble";
export const WIDTH = "100%";
export const HEIGHT = "100%";

export const AssetPlayer = ({ message }: { message: Message }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const setHighlightedMessage = useMimessage((state) => state.setHighlightedMessage);

  const filename = ((isProd ? "file://" : "mimessage-asset://") + (message.filename || "")).replace(
    "~",
    process.env.HOME!,
  ) as string;
  const videoSourcePath = filename.endsWith("mov") || filename.endsWith("mp4");
  const imageSourcePath =
    filename.endsWith("png") || filename.endsWith("jpg") || filename.endsWith("jpeg") || filename.endsWith("heic");

  const showInFinder = () => {
    console.log(filename);
  };

  const renderPlayableAsset = () => {
    if (videoSourcePath) {
      return (
        <video
          ref={ref}
          src={filename}
          style={{
            width: WIDTH,
            height: HEIGHT,
            borderRadius: 8,
            cursor: "pointer",
          }}
          crossOrigin={"anonymous"}
          preload={"auto"}
          playsInline={true}
          autoPlay={false}
          controls={false}
          muted={true}
          onClick={() => setHighlightedMessage(message)}
        />
      );
    }

    if (imageSourcePath) {
      return (
        <img
          src={filename}
          style={{
            width: WIDTH,
            height: HEIGHT,
            objectFit: "contain",
            cursor: "pointer",
          }}
          onClick={() => setHighlightedMessage(message)}
        />
      );
    }
    return null;
  };

  return (
    <>
      {renderPlayableAsset() || (
        <Box className={"message_part"}>
          <Box className={"bubble"} onClick={showInFinder}>
            Show in Finder
          </Box>
        </Box>
      )}
      {message.text && <MessageBubbleText text={message.text} />}
    </>
  );
};
