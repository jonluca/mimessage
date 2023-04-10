import React, { useCallback, useMemo, useRef } from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../../context";
import { useChatMap, useGlobalSearch, useHandleMap } from "../../hooks/dataHooks";
import { LinearProgress } from "@mui/material";
import type { VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import { debounce } from "lodash-es";
import InputBase from "@mui/material/InputBase";
import theme from "../theme";
import type { GlobalSearchResult } from "../../interfaces";
import Typography from "@mui/material/Typography";
import { MessageAvatar } from "../message/Avatar";
import dayjs from "dayjs";
const GloablSearchInput = () => {
  const globalSearch = useMimessage((state) => state.globalSearch);
  const setGlobalSearch = useMimessage((state) => state.setGlobalSearch);

  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onFilterChange = useCallback(() => {
    const input = inputRef.current;
    const value = input?.value;
    setGlobalSearch(value || "");
  }, [setGlobalSearch]);
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
        mt: 2,
      }}
    >
      <InputBase
        ref={ref}
        onFocus={onChangeDebounced}
        defaultValue={globalSearch || ""}
        sx={{
          width: "100%",
          px: 1,
          height: 50,
          background: "#2c2c2c",
          display: "flex",
          borderRadius: "5px",
          color: "white",
        }}
        inputProps={{
          sx: { p: 0, height: 50, color: theme.colors.white, background: "#2c2c2c", borderRadius: "5px" },
          ref: inputRef,
        }}
        onChange={onChangeDebounced}
        placeholder={"Global Search"}
      />
    </Box>
  );
};

const SearchResult = ({ result }: { result: GlobalSearchResult }) => {
  const setChatId = useMimessage((state) => state.setChatId);
  const setMessageIdToBringToFocus = useMimessage((state) => state.setMessageIdToBringToFocus);
  const handleMap = useHandleMap();

  const handle = handleMap?.[result.handle_id!];
  const chatMap = useChatMap();
  const chat = chatMap?.get(result.chat_id!);
  const contact = handle?.contact;
  const onClick = () => {
    setChatId(result.chat_id!);
    setMessageIdToBringToFocus(result.message_id!);
  };
  return (
    <Box
      onClick={onClick}
      sx={{ display: "flex", cursor: "pointer", p: 1, my: 1, borderRadius: 4, background: "#2c2c2c" }}
    >
      <MessageAvatar contact={contact} />
      <Box sx={{ ml: 1 }}>
        {result.text}
        <Typography variant={"h6"} sx={{ color: "grey", fontSize: 14 }}>
          {result.is_from_me ? "You" : contact?.parsedName || handle?.id}
          {result.date_obj && <> on {dayjs(result.date_obj).format("MM/DD/YYYY HH:mm A")}</>}
          {chat?.name && <> in {chat.name}</>}
        </Typography>
      </Box>
    </Box>
  );
};
export const GlobalSearch = () => {
  const globalSearch = useMimessage((state) => state.globalSearch);
  const chatId = useMimessage((state) => state.chatId);

  const { data: results, isLoading } = useGlobalSearch({ searchTerm: globalSearch });
  const virtuoso = useRef<VirtuosoHandle>(null);

  const count = results?.length || 0;

  const searchResultRenderer = (index: number) => {
    const result = results?.[index];

    if (!result) {
      return null;
    }

    return <SearchResult result={result} key={`${result.chat_id}-${index}`} />;
  };

  return (
    <Box
      sx={{
        zIndex: 999,
        justifyContent: "center",
        width: "100%",
        flexDirection: "column",
        background: "#1e1e1e",
        p: 2,
        display: chatId ? "none" : "flex",
      }}
    >
      <GloablSearchInput />
      {isLoading && <LinearProgress />}
      {count > 0 && (
        <Typography sx={{ my: 0.5, color: "grey" }} variant={"h4"}>
          {count} results
        </Typography>
      )}
      <Virtuoso
        totalCount={count}
        style={{ height: "100%" }}
        itemContent={searchResultRenderer}
        overscan={100}
        increaseViewportBy={2000}
        ref={virtuoso}
      />
    </Box>
  );
};
