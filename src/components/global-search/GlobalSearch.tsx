import React, { useCallback, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../../context";
import { useGlobalSearch } from "../../hooks/dataHooks";
import { LinearProgress } from "@mui/material";
import type { VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import { shallow } from "zustand/shallow";
import { debounce } from "lodash-es";
import InputBase from "@mui/material/InputBase";
import theme from "../theme";
const GloablSearchInput = () => {
  const { filter, setFilter } = useMimessage(
    (state) => ({
      filter: state.filter,
      setFilter: state.setFilter,
    }),
    shallow,
  );
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onFilterChange = useCallback(() => {
    const input = inputRef.current;
    const value = input?.value;
    setFilter(value || "");
  }, [setFilter]);
  const onChangeDebounced = useMemo(() => debounce(onFilterChange, 450), [onFilterChange]);

  return (
    // absolutely center dev
    <Box
      sx={{
        transition: "top 0.5s",
        zIndex: 999,
        display: "flex",
        justifyContent: "center",
        width: "100%",
        height: "fit-content",
      }}
    >
      <InputBase
        ref={ref}
        onFocus={onChangeDebounced}
        defaultValue={filter || ""}
        sx={{
          width: "100%",
          mx: 1.5,
          px: 1,
          height: 30,
          background: "#2c2c2c",
          display: "flex",
          borderRadius: "5px",
          color: "white",
        }}
        inputProps={{
          sx: { p: 0, height: 30, color: theme.colors.white, background: "#2c2c2c", borderRadius: "5px" },
          ref: inputRef,
        }}
        onChange={onChangeDebounced}
        placeholder={"Filter"}
      />
    </Box>
  );
};

export const GlobalSearch = () => {
  const filter = useMimessage((state) => state.filter);

  const { data: messages, isLoading } = useGlobalSearch({ searchTerm: filter });
  const [showTimes, setShowTimes] = useState(false);
  const virtuoso = useRef<VirtuosoHandle>(null);

  const count = messages?.length || 0;

  const hasItems = count > 0;

  const searchResultRenderer = (index: number) => {
    const message = messages?.[index];

    if (!message) {
      return null;
    }

    return (
      <Box key={`${message.chat_id}-${index}`} data-index={index}>
        Search result {index}
      </Box>
    );
  };
  const showFilterBar = hasItems || filter;
  return (
    <Box
      sx={{
        zIndex: 999,
        display: "flex",
        justifyContent: "center",
        width: "100%",
        flexDirection: "column",
        background: "#1e1e1e",
      }}
    >
      {isLoading && <LinearProgress />}
      {showFilterBar && <GloablSearchInput />}
      <Virtuoso
        totalCount={count}
        initialTopMostItemIndex={count - 1}
        style={{ height: "100%" }}
        itemContent={searchResultRenderer}
        overscan={100}
        increaseViewportBy={2000}
        ref={virtuoso}
        followOutput
      />
    </Box>
  );
};
