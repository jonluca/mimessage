import React from "react";
import type { OptionsProp, CallbacksProp, Word } from "react-wordcloud";
import ReactWordcloud from "react-wordcloud";
import { useSlowWrappedStats } from "../../hooks/dataHooks";
import { CHART_HEIGHT, SectionHeader, SectionWrapper } from "./Containers";
import Box from "@mui/material/Box";
import { ErrorBoundary } from "../ErrorBoundary";
import { LinearProgress } from "@mui/material";

const options = {
  deterministic: true,
  fontSizes: [20, 70],
  padding: 10,
  rotations: 0,
} as OptionsProp;

const callbacks = {
  getWordColor: (word: Word) => {
    return "#5871f5";
  },
} as CallbacksProp;
export const SimpleWordcloud = () => {
  const { data: wrappedStats, isLoading } = useSlowWrappedStats();

  const topOneHundred = wrappedStats?.topOneHundred;
  const data = React.useMemo(
    () =>
      topOneHundred?.map((l) => ({
        text: l[0],
        value: l[1],
      })) || [],
    [topOneHundred],
  );
  return (
    <SectionWrapper sx={{ width: "100%", height: CHART_HEIGHT }}>
      <SectionHeader>Wordcloud</SectionHeader>
      {isLoading && <LinearProgress />}
      <Box sx={{ width: "100%", height: "90%" }}>
        <ErrorBoundary>{data && <ReactWordcloud callbacks={callbacks} options={options} words={data} />}</ErrorBoundary>
      </Box>
    </SectionWrapper>
  );
};
