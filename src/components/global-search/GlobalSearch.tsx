import React, { useCallback, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../../context";
import {
  useChatMap,
  useContactsWithChats,
  useEarliestMessageDate,
  useGlobalSearch,
  useGroupChatList,
  useHandleMap,
  useLoadSemanticResultsIntoMemory,
  useSemanticSearchCacheSize,
} from "../../hooks/dataHooks";
import { CircularProgress, LinearProgress, TextField } from "@mui/material";
import { Button, Checkbox, FormControlLabel, FormGroup } from "@mui/material";

import { Virtuoso } from "react-virtuoso";
import { debounce } from "lodash-es";
import InputBase from "@mui/material/InputBase";
import theme from "../theme";
import type { Chat, ChatList, GlobalSearchResult } from "../../interfaces";
import Typography from "@mui/material/Typography";
import { MessageAvatar } from "../message/Avatar";
import dayjs from "dayjs";
import Select from "react-select";
import type { Contact } from "electron-mac-contacts";
import { selectTheme } from "../wrapped/YearSelector";
import Highlighter from "react-highlight-words";

import type { DateRange } from "react-day-picker";
import { DayPicker } from "react-day-picker";
import Popover from "@mui/material/Popover";
import { shallow } from "zustand/shallow";
import { SemanticSearchInfo } from "../chat/OpenAiKey";
import Backdrop from "@mui/material/Backdrop";

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
        alignItems: "center",
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
      <SemanticSearchInfo />
    </Box>
  );
};

const SearchResult = ({ result }: { result: GlobalSearchResult }) => {
  const setChatId = useMimessage((state) => state.setChatId);
  const setMessageIdToBringToFocus = useMimessage((state) => state.setMessageIdToBringToFocus);
  const handleMap = useHandleMap();
  const globalSearch = useMimessage((state) => state.globalSearch);

  const handle = handleMap?.[result.handle_id!];
  const chatMap = useChatMap();
  const chat = chatMap?.get(result.chat_id!);
  const contact = handle?.contact;
  const onClick = () => {
    setChatId(result.chat_id!);
    setMessageIdToBringToFocus(result.message_id!);
  };

  if (!result.text) {
    // this is for attachments, to do in the future
    return null;
  }
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        cursor: "pointer",
        p: 1,
        my: 1,
        borderRadius: 4,
        background: "#2c2c2c",
        alignItems: "center",
      }}
    >
      <MessageAvatar fallback={chat?.name} contact={contact} />
      <Box sx={{ ml: 1, wordBreak: "break-word" }}>
        <Highlighter searchWords={[globalSearch!]} autoEscape={true} textToHighlight={result.text || ""} />
        <Typography variant={"h6"} sx={{ color: "grey", fontSize: 12 }}>
          {result.is_from_me ? "You" : contact?.parsedName || handle?.id}
          {result.date_obj && <> on {dayjs(result.date_obj).format("MM/DD/YYYY HH:mm A")}</>}
          {chat?.name && <> in {chat.name}</>}
        </Typography>
      </Box>
    </Box>
  );
};

const ContactFilter = () => {
  const contacts = useContactsWithChats();

  const contactFilter = useMimessage((state) => state.contactFilter);
  const setContactFilter = useMimessage((state) => state.setContactFilter);

  return (
    <Box sx={{ mr: 0.5, width: 160 }}>
      <Select<Contact, true>
        value={contactFilter}
        options={contacts || []}
        theme={selectTheme}
        name={"contactFilter"}
        placeholder={"Contacts"}
        blurInputOnSelect
        isSearchable
        isMulti
        onChange={(value) => {
          setContactFilter(value as Contact[]);
        }}
        styles={{
          option: (baseStyles, state) => ({
            ...baseStyles,
            color: state.isSelected ? "white" : baseStyles.color,
          }),
        }}
        getOptionLabel={(option) => option.parsedName || option.identifier || "Unknown"}
        getOptionValue={(option) => option.identifier}
      />
    </Box>
  );
};
const GroupChatFilter = () => {
  const groupChatList = useGroupChatList();
  const chatFilter = useMimessage((state) => state.chatFilter);
  const setChatFilter = useMimessage((state) => state.setChatFilter);

  return (
    <Box sx={{ mx: 0.5, width: 160 }}>
      <Select<Chat, true>
        value={chatFilter}
        options={groupChatList || []}
        theme={selectTheme}
        name={"chatFilter"}
        placeholder={"Groups"}
        closeMenuOnSelect={false}
        isSearchable
        isMulti
        onChange={(value) => {
          setChatFilter(value as ChatList);
        }}
        styles={{
          option: (baseStyles, state) => ({
            ...baseStyles,
            color: state.isSelected ? "white" : baseStyles.color,
          }),
        }}
        getOptionLabel={(option) => option.name || "Unknown"}
        getOptionValue={(option) => String(option.chat_id)}
      />
    </Box>
  );
};

const ToggleSemanticSearch = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { mutateAsync, isLoading } = useLoadSemanticResultsIntoMemory();
  const { data: cacheSize } = useSemanticSearchCacheSize();
  const { setOpenAiKey, openAiKey, setUseSemanticSearch, useSemanticSearch } = useMimessage(
    (state) => ({
      useSemanticSearch: state.useSemanticSearch,
      setUseSemanticSearch: state.setUseSemanticSearch,
      openAiKey: state.openAiKey,
      setOpenAiKey: state.setOpenAiKey,
    }),
    shallow,
  );
  const disabled = !openAiKey || isLoading;
  const cacheIsLoaded = (cacheSize || 0) > 0;
  return (
    <>
      <Backdrop open={isOpen} onClick={() => !isLoading && setIsOpen(false)}>
        <Box
          onClick={(e) => e.stopPropagation()}
          sx={{ background: "#2c2c2c", maxWidth: 600, p: 2, m: 2 }}
          display={"flex"}
          flexDirection={"column"}
        >
          {isLoading ? (
            <>
              <Typography variant="h1" sx={{ color: "white" }}>
                Loading Vectors into Memory
              </Typography>
              <Typography variant="h6" sx={{ color: "white" }}>
                This takes ~3s per 100k messages
              </Typography>
              <CircularProgress sx={{ my: 2 }} />
            </>
          ) : disabled ? (
            <>
              <TextField
                defaultValue={openAiKey}
                placeholder={"Enter your OpenAI API key"}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  const key = e.currentTarget.value;
                  if (!key.startsWith("sk-") || key.length !== 51) {
                    return;
                  }
                  setOpenAiKey(key);
                }}
                sx={{ mt: 1 }}
              />
            </>
          ) : (
            <>
              <Typography variant="h1" sx={{ color: "white" }}>
                Semantic Search
              </Typography>
              <Typography variant="h6" sx={{ color: "white" }}>
                Semantic search uses the OpenAI API to find similar messages. This will load all messages and embeddings
                into memory, which may take a while.
                <br />
                <br />
                It will then create a new embedding for your query, and do a cosine similarity search to find messages
                with similar content.
              </Typography>
            </>
          )}
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  style={{
                    color: disabled ? "grey" : "white",
                  }}
                  checked={useSemanticSearch}
                  onChange={async () => {
                    const newUseSemanticSearch = !useSemanticSearch;
                    if (newUseSemanticSearch) {
                      await mutateAsync();
                    }
                    setUseSemanticSearch(newUseSemanticSearch);
                    setIsOpen(false);
                  }}
                  disabled={disabled}
                  title={openAiKey ? "" : "OpenAI Key Required"}
                />
              }
              sx={{
                color: "white",
                "& .MuiFormControlLabel-label.Mui-disabled": {
                  color: "#bbbbbb",
                },
                py: 3,
              }}
              label="Use Semantic Search"
            />
          </FormGroup>
          <Typography variant="h6" sx={{ color: "white" }}>
            Cache Loaded: {cacheIsLoaded ? "Yes" : "No"}
          </Typography>
          {cacheIsLoaded && (
            <>
              <Typography variant="h6" sx={{ color: "white" }}>
                Cache Size: {cacheSize!.toLocaleString()}
              </Typography>
            </>
          )}
        </Box>
      </Backdrop>
      <Button sx={{ ml: 1, whiteSpace: "pre", wordWrap: "none" }} variant={"outlined"} onClick={() => setIsOpen(true)}>
        Semantic Search
      </Button>
    </>
  );
};

const GlobalSearchFilter = () => {
  const { data: results } = useGlobalSearch();
  const count = results?.length || 0;
  const globalSearch = useMimessage((state) => state.globalSearch);
  return (
    <Box
      sx={{
        zIndex: 999,
        justifyContent: "flex-start",
        alignItems: "center",
        width: "100%",
        flexDirection: "row",
        background: "#1e1e1e",
        py: 1,
        display: "flex",
      }}
    >
      {results && globalSearch && (
        <Typography sx={{ my: 1, mr: 1, color: "grey", whiteSpace: "pre" }} variant={"h4"}>
          {count} results
        </Typography>
      )}
      <ContactFilter />
      <GroupChatFilter />
      <DateFilter />
      <ToggleSemanticSearch />
    </Box>
  );
};

const DateFilter = () => {
  const { startDate, setStartDate, setEndDate, endDate } = useMimessage(
    (state) => ({
      startDate: state.startDate,
      endDate: state.endDate,
      setStartDate: state.setStartDate,
      setEndDate: state.setEndDate,
    }),
    shallow,
  );

  const { data: earliestDate } = useEarliestMessageDate();
  const [anchorEl, setAnchorEl] = React.useState<HTMLButtonElement | null>(null);
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? `date-popover-selector` : undefined;
  const range = { from: startDate || undefined, to: endDate || undefined };
  const onSelect = (range: DateRange | undefined) => {
    if (range) {
      setStartDate(range.from);
      setEndDate(range.to);
    } else {
      setStartDate(null);
      setEndDate(null);
    }
  };
  return (
    <>
      <Button sx={{ ml: 1, whiteSpace: "pre", wordWrap: "none" }} variant={"outlined"} id={id} onClick={handleClick}>
        Dates
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
          sx: { p: 2, backgroundColor: "#2c2c2c", color: "white" },
        }}
      >
        <DayPicker
          selected={range || undefined}
          onSelect={onSelect}
          captionLayout="dropdown-buttons"
          mode={"range"}
          fromYear={earliestDate?.getFullYear()}
          toDate={new Date()}
        />
      </Popover>
    </>
  );
};

const SearchResults = () => {
  const { data: results } = useGlobalSearch();
  const count = results?.length || 0;

  const searchResultRenderer = (index: number) => {
    const result = results?.[index];

    if (!result) {
      return null;
    }

    return <SearchResult result={result} key={`${result.chat_id}-${index}`} />;
  };
  return (
    <Virtuoso
      totalCount={count}
      style={{ height: "100%" }}
      itemContent={searchResultRenderer}
      overscan={100}
      increaseViewportBy={2000}
    />
  );
};

export const GlobalSearch = () => {
  const chatId = useMimessage((state) => state.chatId);

  const { isLoading } = useGlobalSearch();

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
      <GlobalSearchFilter />
      <SearchResults />
    </Box>
  );
};
