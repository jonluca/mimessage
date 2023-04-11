import Search from "@mui/icons-material/Search";
import InputBase from "@mui/material/InputBase";
import React, { useCallback, useMemo, useRef } from "react";
import theme from "../theme";
import { useMimessage } from "../../context";
import Box from "@mui/material/Box";
import { shallow } from "zustand/shallow";
import { debounce } from "lodash-es";
export const SEARCH_BAR_HEIGHT = 40;

export const SearchBar = () => {
  const { search, setSearch } = useMimessage(
    (state) => ({
      search: state.search,
      setSearch: state.setSearch,
    }),
    shallow,
  );
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onSearchChange = useCallback(() => {
    const input = inputRef.current;
    const value = input?.value;
    setSearch(value || "");
  }, [setSearch]);

  return (
    <Box
      sx={{
        transition: "top 0.5s",
        zIndex: 999,
        display: "flex",
        justifyContent: "center",
        height: SEARCH_BAR_HEIGHT,
        my: 1.25,
      }}
    >
      <InputBase
        ref={ref}
        startAdornment={<Search sx={{ mx: 0.5, color: theme.colors.white, fontSize: 14 }} />}
        onFocus={onSearchChange}
        defaultValue={search || ""}
        sx={{
          width: 300,
          mx: 1.25,
          height: SEARCH_BAR_HEIGHT,
          background: "#3a3e44",
          display: "flex",
          borderRadius: "5px",
          color: "white",
        }}
        inputProps={{
          sx: {
            p: 0,
            height: SEARCH_BAR_HEIGHT,
            color: theme.colors.white,
            background: "#3a3e44",
            borderRadius: "5px",
          },
          ref: inputRef,
        }}
        onChange={onSearchChange}
        placeholder={"Search"}
      />
    </Box>
  );
};

export const Filter = () => {
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
          mx: 1,
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
