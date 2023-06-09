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
import { shallow } from "zustand/shallow";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Close from "@mui/icons-material/Close";
const BUTTON_HEIGHT = 30;
export const SelectedChatFilterBar = ({
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
  const { setChatId, regexSearch, setRegexSearch, globalSearch } = useMimessage(
    (state) => ({
      regexSearch: state.regexSearch,
      globalSearch: state.globalSearch,
      setRegexSearch: state.setRegexSearch,
      setChatId: state.setChatId,
    }),
    shallow,
  );

  const handleSettingsClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? "simple-popover" : undefined;

  const LeftIcon = globalSearch ? ArrowBackIcon : Close;
  return (
    <Box
      sx={{ display: "flex", flexDirection: "row", py: 2, background: "#383938", alignItems: "center" }}
      className={"draggable"}
    >
      {exportOpen && <ExportChat onClose={() => setExportOpen(false)} />}
      <Button
        sx={{ ml: 1.5, height: BUTTON_HEIGHT, py: 1, px: 1, minWidth: 20 }}
        aria-describedby={id}
        variant="outlined"
        color={"primary"}
        title={"Back"}
        onClick={() => {
          setChatId(null);
        }}
      >
        <LeftIcon />
      </Button>
      <Filter />
      <Button
        sx={{ height: BUTTON_HEIGHT, py: 1, px: 1, minWidth: 20 }}
        aria-describedby={id}
        variant="contained"
        title={"Settings"}
        onClick={handleSettingsClick}
      >
        <SettingsSuggestIcon />
      </Button>
      <Button
        variant="contained"
        sx={{ mx: 1.5, height: BUTTON_HEIGHT, py: 1, px: 1, minWidth: 20 }}
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
