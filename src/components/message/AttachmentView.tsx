import React, { useRef } from "react";
import type { Message } from "../../interfaces";
import { isProd } from "../../config";
import { useMimessage } from "../../context";
import Box from "@mui/material/Box";
import { MessageBubbleText } from "./MessageBubble";
import { useHomeDir, useOpenFileAtLocation } from "../../hooks/dataHooks";
const ASSET_WIDTH = "100%";
const ASSET_HEIGHT = "100%";

const VIDEO_TYPES = ["mov", "mp4"];
const IMAGE_TYPES = ["png", "jpg", "jpeg"];

export const AttachmentView = ({ message, recalcSize }: { recalcSize?: () => void | undefined; message: Message }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const setHighlightedMessage = useMimessage((state) => state.setHighlightedMessage);

  const { data: homedir } = useHomeDir();
  const data = useOpenFileAtLocation();
  const absolutePath = (message.filename || "").replace("~", homedir!);
  const filename = ((isProd ? "file://" : "mimessage-asset://") + absolutePath) as string;
  const fileType = filename.split(".").pop()?.toLowerCase();
  const isVideo = VIDEO_TYPES.includes(fileType!);
  const isImage = IMAGE_TYPES.includes(fileType!);
  const showInFinder = async () => {
    await data.mutateAsync(absolutePath);
  };

  const renderPlayableAsset = () => {
    if (isVideo) {
      return (
        <video
          ref={ref}
          src={filename}
          style={{
            width: ASSET_WIDTH,
            height: ASSET_HEIGHT,
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
          onLoad={recalcSize}
          onError={recalcSize}
        />
      );
    }

    if (isImage) {
      return (
        <img
          src={filename}
          alt={"img"}
          style={{
            width: ASSET_WIDTH,
            height: ASSET_HEIGHT,
            objectFit: "contain",
            cursor: "pointer",
            borderRadius: 20,
          }}
          onClick={() => setHighlightedMessage(message)}
          onLoad={recalcSize}
          onError={recalcSize}
        />
      );
    }
    if (message.text) {
      try {
        new URL(message.text);

        return (
          <Box>
            <a href={message.text}>{message.text}</a>
          </Box>
        );
      } catch {
        // skip
      }
    }
    return null;
  };

  const renderText = () => {
    if (message.text) {
      try {
        new URL(filename);
        return null;
      } catch {
        // skip
      }
      return <MessageBubbleText text={message.text} />;
    }
  };

  if (message.filename === null) {
    return (
      <MessageBubbleText
        system
        text={`Missing attachment ${
          message.transfer_name ? message.transfer_name : ""
        }: Please download it in the native messages app`}
      />
    );
  }

  return (
    <>
      {renderPlayableAsset() || (
        <Box className={"message_part"} onClick={showInFinder} sx={{ pointer: "cursor" }}>
          <Box className={"bubble"}>Show in Finder</Box>
        </Box>
      )}
      {renderText()}
    </>
  );
};
