import type { BoxProps } from "@mui/material/Box/Box";
import Box from "@mui/material/Box";
import React from "react";
import Typography from "@mui/material/Typography";

export const GenericValue = ({ text, number }: { text: string; number: string | bigint | number }) => {
  return (
    <Box display={"flex"} justifyContent={"center"} alignItems={"center"}>
      <Typography sx={{ color: "#5871f5", display: "flex", mr: 1, width: 70, fontWeight: "bold" }}>
        {(number || 0).toLocaleString()}
      </Typography>
      <Typography
        title={text}
        sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "180px" }}
      >
        {text}
      </Typography>
    </Box>
  );
};
export const SectionWrapper = (props: BoxProps) => {
  return (
    <Box
      {...props}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        background: "#2c2c2c",
        py: 1,
        px: 2,
        m: 1,
        borderRadius: 2,
        height: "fit-content",
        width: "fit-content",
        ...props.sx,
      }}
    />
  );
};
export const SectionHeader = ({ children }: React.PropsWithChildren) => {
  return <Typography variant={"h2"}>{children}</Typography>;
};
export const SECTION_WIDTH = 550;
export const SECTION_HEIGHT = 200;
