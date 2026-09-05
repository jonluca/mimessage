import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMimessage } from "../../context";
import { useShallow } from "zustand/react/shallow";
import { debounce } from "lodash-es";
import { SystemSymbol } from "../SystemSymbol";
export const SEARCH_BAR_HEIGHT = 36;

const SearchIcon = () => <SystemSymbol className="conversation-search-icon" name="magnifyingglass" />;

const CloseIcon = () => <SystemSymbol name="xmark-circle-fill" />;

export const SearchBar = () => {
  const { search, setGlobalSearch, setSearch, setSelectedSearchMessageId, useSemanticSearch } = useMimessage(
    useShallow((state) => ({
      search: state.search,
      setGlobalSearch: state.setGlobalSearch,
      setSearch: state.setSearch,
      setSelectedSearchMessageId: state.setSelectedSearchMessageId,
      useSemanticSearch: state.useSemanticSearch,
    })),
  );
  const value = search || "";
  const previousSemanticMode = useRef(useSemanticSearch);
  const updateSearch = useMemo(
    () =>
      debounce((nextValue: string) => {
        const normalizedValue = nextValue.trim() ? nextValue : null;
        setGlobalSearch(normalizedValue);
      }, 200),
    [setGlobalSearch],
  );

  useEffect(() => () => updateSearch.cancel(), [updateSearch]);
  useEffect(() => {
    if (!search) {
      updateSearch.cancel();
    }
  }, [search, updateSearch]);
  useEffect(() => {
    const wasSemantic = previousSemanticMode.current;
    previousSemanticMode.current = useSemanticSearch;
    if (wasSemantic === useSemanticSearch) {
      return;
    }
    updateSearch.cancel();
    if (wasSemantic && !useSemanticSearch) {
      setGlobalSearch(search?.trim() ? search : null);
    }
  }, [search, setGlobalSearch, updateSearch, useSemanticSearch]);

  const clearSearch = () => {
    updateSearch.cancel();
    setSearch(null);
    setGlobalSearch(null);
    setSelectedSearchMessageId(null);
  };

  const commitSearch = () => {
    updateSearch.cancel();
    const normalizedValue = value.trim() ? value : null;
    setSearch(normalizedValue);
    setGlobalSearch(normalizedValue);
  };

  return (
    <search className="conversation-search-wrap" style={{ height: SEARCH_BAR_HEIGHT }}>
      <div className="conversation-search" style={{ height: SEARCH_BAR_HEIGHT }}>
        <SearchIcon />
        <input
          className="conversation-search-input"
          value={value}
          aria-label="Search Messages"
          type="search"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            const normalizedValue = nextValue.trim() ? nextValue : null;
            setSearch(normalizedValue);
            setSelectedSearchMessageId(null);
            if (!useSemanticSearch) {
              if (normalizedValue) {
                updateSearch(nextValue);
              } else {
                updateSearch.cancel();
                setGlobalSearch(null);
              }
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              const firstResult = document.querySelector<HTMLElement>(
                ".sidebar-search-results [data-search-result]:not(:disabled)",
              );
              if (firstResult) {
                event.preventDefault();
                firstResult.focus();
              }
            }
            if (event.key === "Enter") {
              commitSearch();
            }
            if (event.key === "Escape") {
              clearSearch();
            }
          }}
          placeholder="Search"
        />
        {value ? (
          <button type="button" className="conversation-search-clear" aria-label="Clear search" onClick={clearSearch}>
            <CloseIcon />
          </button>
        ) : null}
      </div>
    </search>
  );
};

export const Filter = () => {
  const { filter, setFilter } = useMimessage(
    useShallow((state) => ({
      filter: state.filter,
      setFilter: state.setFilter,
    })),
  );
  const [value, setValue] = useState(filter || "");
  const updateFilter = useMemo(() => debounce((nextValue: string) => setFilter(nextValue), 350), [setFilter]);

  useEffect(() => {
    updateFilter.cancel();
    setValue(filter || "");
  }, [filter, updateFilter]);
  useEffect(() => () => updateFilter.cancel(), [updateFilter]);

  return (
    <div className="thread-search-wrap">
      <input
        className="thread-search-input"
        value={value}
        aria-label="Filter this conversation"
        type="search"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          setValue(nextValue);
          updateFilter(nextValue);
        }}
        placeholder="Filter this conversation"
      />
    </div>
  );
};
