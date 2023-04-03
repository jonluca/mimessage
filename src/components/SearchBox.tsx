import Search from "@mui/icons-material/Search";
import InputBase from "@mui/material/InputBase";
import { styled } from "@mui/material/styles";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import theme from "./theme";
import { useMimessage } from "../context";
import Box from "@mui/material/Box";
import { shallow } from "zustand/shallow";
import { debounce } from "lodash-es";

const SearchInput = styled(InputBase)<{ light?: boolean }>`
  display: flex;
  border-radius: 5px;
  color: ${(p) => (p.light ? undefined : theme.colors.white)};
  background: #3a3e44;
`;

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
  const onSearchChangeDebounced = useMemo(() => debounce(onSearchChange, 450), [onSearchChange]);

  const exitSearch = () => {
    setSearch(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };
  const handleShortcuts = (event: KeyboardEvent) => {
    if (inputRef.current) {
      if (event.metaKey && event.key === "f") {
        // command + f
        inputRef.current.focus();
      } else if (event.key === "Escape") {
        // esc
        inputRef.current.blur();
        exitSearch();
      }
    }
  };
  useEffect(() => {
    document.addEventListener("keydown", handleShortcuts);
    return () => {
      document.removeEventListener("keydown", handleShortcuts);
    };
  }, [handleShortcuts]);

  return (
    // absolutely center dev
    <Box
      sx={{
        transition: "top 0.5s",
        zIndex: 999,
        display: "flex",
        justifyContent: "center",
        height: 30,
        my: 1.25,
      }}
    >
      <SearchInput
        ref={ref}
        startAdornment={<Search sx={{ mx: 0.5, color: theme.colors.white, fontSize: 14 }} />}
        onFocus={onSearchChangeDebounced}
        defaultValue={search || ""}
        sx={{ width: 300, mx: 1.25, height: 30, background: "#3a3e44" }}
        inputProps={{
          sx: { pl: 0.5, color: theme.colors.white, background: "#3a3e44" },
          ref: inputRef,
        }}
        onChange={onSearchChangeDebounced}
        placeholder={"Search"}
      />
    </Box>
  );
};
