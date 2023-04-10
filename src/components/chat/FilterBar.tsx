import type { Dispatch, SetStateAction } from "react";
import React, { useState } from "react";
import { useMimessage } from "../../context";
import Box from "@mui/material/Box";
import { ExportChat } from "./ExportChat";
import { Filter } from "../chat-list/SearchBox";
import { Button, Checkbox, FormControlLabel, FormGroup } from "@mui/material";
import SettingsSuggestIcon from "@mui/icons-material/SettingsSuggest";
import BrowserUpdatedIcon from "@mui/icons-material/BrowserUpdated";
import Popover from "@mui/material/Popover";
import type { VirtuosoHandle } from "react-virtuoso";

const BUTTON_HEIGHT = 30;
export const FilterBar = ({
  showTimes,
  setShowTimes,
  virtuoso,
}: {
  showTimes: boolean;
  setShowTimes: Dispatch<SetStateAction<boolean>>;
  virtuoso?: React.RefObject<VirtuosoHandle> | null;
}) => {
  const [exportOpen, setExportOpen] = useState(false);
  const [anchorEl, setAnchorEl] = React.useState<HTMLButtonElement | null>(null);
  const regexSearch = useMimessage((state) => state.regexSearch);
  const setRegexSearch = useMimessage((state) => state.setRegexSearch);

  const handleSettingsClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? "simple-popover" : undefined;

  return (
    <Box
      sx={{ display: "flex", flexDirection: "row", py: 2, background: "#383938", alignItems: "center" }}
      className={"draggable"}
    >
      {exportOpen && <ExportChat onClose={() => setExportOpen(false)} />}
      <Filter />
      <Button
        sx={{ height: BUTTON_HEIGHT }}
        aria-describedby={id}
        variant="contained"
        title={"Settings"}
        onClick={handleSettingsClick}
      >
        <SettingsSuggestIcon />
      </Button>
      <Button
        variant="contained"
        sx={{ mx: 1.5, height: BUTTON_HEIGHT }}
        title={"Export chat"}
        onClick={() => {
          setExportOpen(true);
        }}
      >
        <BrowserUpdatedIcon />
      </Button>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          sx: { p: 2, backgroundColor: "#2c2c2c" },
        }}
      >
        <Box>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  style={{
                    color: "white",
                  }}
                  checked={showTimes}
                  onChange={() => setShowTimes((v) => !v)}
                />
              }
              label="Show timestamps"
            />
            <FormControlLabel
              control={
                <Checkbox
                  style={{
                    color: "white",
                  }}
                  checked={regexSearch}
                  onChange={() => setRegexSearch(!regexSearch)}
                />
              }
              label="Use Regex Search"
            />
          </FormGroup>
          <Button
            onClick={() => {
              virtuoso?.current?.scrollToIndex({
                index: 0,
                align: "start",
                behavior: "auto",
              });
            }}
          >
            scroll to the top
          </Button>
          <Button
            onClick={() => {
              virtuoso?.current?.scrollToIndex({
                index: "LAST",
                align: "start",
                behavior: "auto",
              });
            }}
          >
            scroll to the end
          </Button>
        </Box>
      </Popover>
    </Box>
  );
};
