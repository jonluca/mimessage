import Search from "@mui/icons-material/Search";
import InputBase from "@mui/material/InputBase";
import { styled } from "@mui/material/styles";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import theme from "./theme";
import { useMimessage } from "../context";
import Box from "@mui/material/Box";
import { shallow } from "zustand/shallow";
import { debounce } from "lodash-es";
import Button from "@mui/material/Button";

const SearchInput = styled(InputBase)<{ light?: boolean }>`
  display: flex;
  border: 2px solid ${(p) => (p.light ? theme.colors.slate : theme.colors.white)};
  border-radius: 5px;
  color: ${(p) => (p.light ? undefined : theme.colors.white)};
  background: black;
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
        top: 25,
        transition: "top 0.5s",
        marginLeft: 0,
        marginRight: 0,
        zIndex: 999,
        display: "flex",
        justifyContent: "center",
      }}
    >
      {search && (
        <Button sx={{ position: "fixed", top: 20, left: 20 }} onClick={exitSearch}>
          <img
            height={40}
            src={
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAACXBIWXMAAAsTAAALEwEAmpwYAAAGN0lEQVR4nO2dW2tdRRSAhyYmRduCQVAUvPTZ4K3aXJqIT6UKUqVqRWmrtaKEWBXBx+bBmtqL4l8oBHxpvGCbmLb6JChFo31PUXtJtPYC1qai9ZOp68DhsGf2Pvs2s8+ZDwolOVlrzZq9Z9asWTNHqUAgEAgEAoFAIBAIBAKBQMADgA7gAWAr8B7wCXAcmAPOA3/Jv/PyM/27j+WzL8rfdrhuR6UAbgNeAz4FLpKdC9Jxo8CtrtvnJcBS4DngC+AfikPLnhJd3ardAW4AtgOnKJ9fgTFghWo3gE7gDeB33HNWHoJO1Q4Aq4Bj+McPwIBqVYAu4EPg3yYd84eM2zuBTcBqYCVwo8jskv+vlN9tls/qv7nUpC5t2/tapmolxDnNPPWngT36icwyNADXAYPAXuBME/q/Be5UrQDwiISCSZgB1hYRu8uaYh1wJKEtem0xrKoM8CRwJUFjp4AHS7SrT0LeOBaB9aqKAC8kiOl/AZ5waOMG4GSMjboNW1QFn/w45+8Hlnlg63JgIkEnrK/SmK9fXROX9duhPAN4KcbuRe/nBIl2LsRMbIPKU4ChBPb7GR1JPH4sJrS8W3kO0BsTsn6jw1vlG7LIsj053ju/oRNsb8I+5RPAGssK97LPw07McGSaE67qUFZ5lFjTeRQT1Qrh6gC2Wdp13IsEnmQ1TexXFQd7iDrq2rhllpTyzz7E+TmtE0yLtd+A610a95bl6XC2ws0b4GlLO193uY1oCtemcpDfmY+l+cgCDhvaesrJ9ibwvOWp6M8oewyY1p2c0/rkM2BXRjl6r8HExqx2pjHIlE2cycH5NTJ1Qp3za2TthC+J5mAWuWlLR0zJtrU5Ob/GoTSvuP4b+dtGxjLY9yjR/A3cklZuGkP0JrYp3dCRo/NTdYLF+Zk6QdY88waZI6ospGgqij0ZGnbI4rDEnZDA+TVZqSZm2TOOYjKNvLRbe6Y8SeqqApI7rrtIGQlTFFGcA5akldtsWYmpeiFTlpAMDizD+XUTu6na4v4sspMaoIteC4n90zqyLOcniACLz3sBuw3K38lRR1dD+BjFtRC1mc/maN+4Qc94XjpsynWlcRSbctbTnfCpLu3Jr7Nti7OJGPjRoHx1Abq6Ezi4VOeLXf0GfbN564pS/pNB+R0F6etKMMQUPuw02HSXQeeJIvQ1KtfhVhQ9BersarITCnO+2HOTQe/ZonTWK9dHgqIotKCV5J1QqPPrhsYorhSpt6Y8dABuOyAMQbgdgsIkzLUCtCjmXIahfW0Uhg64DEPDQgy3CzF9CDqKnW2Uithl0PNuXjrSJOOm2ygZN+MyGaeP/7d7OvpPg/z7ssjOY0NmsA02ZIadbsjETMR722BL8gODzAOqLOTiiyjOtMGm/IJB5quqLPStI5aylHUtXJbymKUs5ea0ctMao0O7KI5klPt2gYVZOzLa9pWhzZ9nkZvWGH3li4mBHDphOufSxB05nC028UxWO9MYtFQKsXIvT/S0OPeoV8W5YtSblqdig2oRgI2Wdm53feGSvm8nCn2oYbmqOMAKy5u+4PSARkydqGZCVRzgI0v7RnwwUK+MZy1GblUVBXjF0q7vvLmRUco0bMdUh1TFAB6OOab6kPIJS9UwkjvqVRUBuCfmyszdyjck3tY3TWFJU/RWxPnzlnZ87eVVBRp9kYVcS2B7E4Y8H3YuWuzXR3JvVz4j6dq4a1+2KT8n3EWL3XouW6OqgL7cKMGFTRM+rBMkzreFmkhbHldVQjau4zrhJPCU4xWuaZFVn+ncrKqIvAm217rG4axni5u0a9CS22kcdqr15BvmBNvEXM9ROQpaxLWVnZLPN6WUoybcaoz5cejSdblpKinzsq4YylL0K6HxsGwjmnayTKGm39FOylts98kqshkuyZmscbkKs09KA3vqri7ukZ/1y2fGpXTEVL1g4qocwfIzzs+xrMW2YHPFbJnzkA8JvFG5b8c1+nsERrxJrJUJ/2+cv5zg9toiWJCtT7f5fI864lmpYijyK0x0TH9Q4v/wFSZR6FtHZEiYtBwGaQYt44Cu2ym9dKTqAEt0vWVdZDMpk+WcOLb2NVbn5Gffi7PHZSV+b2nlgoFAIBAIBAKBQCAQCAQCgYCy8x+4XTInuxgqKwAAAABJRU5ErkJggg=="
            }
          />
        </Button>
      )}

      <SearchInput
        ref={ref}
        startAdornment={<Search sx={{ mx: 1, color: theme.colors.white }} />}
        onFocus={onSearchChangeDebounced}
        defaultValue={search || ""}
        sx={{ width: "400px", mr: 1, height: 50, background: theme.colors.lowBlack }}
        inputProps={{
          sx: { pl: 1, color: theme.colors.white, background: theme.colors.lowBlack },
          ref: inputRef,
        }}
        onChange={onSearchChangeDebounced}
        placeholder={"Search for anything..."}
      />
    </Box>
  );
};
