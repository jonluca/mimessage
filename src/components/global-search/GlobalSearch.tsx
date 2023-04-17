import React, { useCallback, useMemo, useRef } from "react";
import Box from "@mui/material/Box";
import { useMimessage } from "../../context";
import {
  useChatMap,
  useContactsWithChats,
  useEarliestMessageDate,
  useGlobalSearch,
  useGroupChatList,
  useHandleMap,
} from "../../hooks/dataHooks";
import { LinearProgress } from "@mui/material";
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

import { DayPicker } from "react-day-picker";
import Popover from "@mui/material/Popover";
import { shallow } from "zustand/shallow";
import { SemanticSearchInfo } from "../chat/OpenAiKey";

const GloablSearchInput = () => {
  const globalSearch = useMimessage((state) => state.globalSearch);
  const setGlobalSearch = useMimessage((state) => state.setGlobalSearch);
  const useSemanticSearch = useMimessage((state) => state.useSemanticSearch);
  const setUseSemanticSearch = useMimessage((state) => state.setUseSemanticSearch);

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
        placeholder={"Contact Filter"}
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
        placeholder={"Group Filter"}
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

const GlobalSearchFilter = () => {
  const { data: results } = useGlobalSearch();
  const count = results?.length || 0;
  const { setUseSemanticSearch, useSemanticSearch, startDate, setStartDate, setEndDate, endDate, globalSearch } =
    useMimessage(
      (state) => ({
        startDate: state.startDate,
        endDate: state.endDate,
        setStartDate: state.setStartDate,
        setEndDate: state.setEndDate,
        globalSearch: state.globalSearch,
        useSemanticSearch: state.useSemanticSearch,
        setUseSemanticSearch: state.setUseSemanticSearch,
      }),
      shallow,
    );
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
      <DateFilter selection={startDate} setSelection={setStartDate} text={"Start Date"} />
      <DateFilter selection={endDate} setSelection={setEndDate} text={"End Date"} />
      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              style={{
                color: "white",
              }}
              checked={useSemanticSearch}
              onChange={() => setUseSemanticSearch(!useSemanticSearch)}
            />
          }
          label="Use Semantic Search"
        />
      </FormGroup>
    </Box>
  );
};

const DateFilter = ({
  selection,
  setSelection,
  text,
}: {
  selection: Date | null | undefined;
  setSelection: (newDate: Date | null | undefined) => void;
  text: string;
}) => {
  const { data: earliestDate } = useEarliestMessageDate();
  const [anchorEl, setAnchorEl] = React.useState<HTMLButtonElement | null>(null);
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? `date-popover-${text.replaceAll(" ", "-")}` : undefined;
  return (
    <>
      <Button variant={"outlined"} sx={{ mx: 1 }} id={id} onClick={handleClick}>
        {selection ? selection.toLocaleDateString() : text}
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
          selected={selection || undefined}
          onSelect={setSelection}
          captionLayout="dropdown-buttons"
          mode={"single"}
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
