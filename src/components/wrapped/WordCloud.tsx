import React from "react";
import { computeWords } from "@isoterik/react-word-cloud";
import type { ComputedWordData, Word } from "@isoterik/react-word-cloud";
import { useSlowWrappedStats } from "../../hooks/dataHooks";
import { SectionHeader, SectionWrapper } from "./Containers";
import { ErrorBoundary } from "../ErrorBoundary";

const CLOUD_WIDTH = 1000;
const CLOUD_HEIGHT = 320;
const MIN_FONT_SIZE = 15;
const MAX_FONT_SIZE = 80;

const createSeededRandom = () => {
  let seed = 0x5eed1234;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
};

const DeterministicWordCloud = ({ words }: { words: Word[] }) => {
  const [computedWords, setComputedWords] = React.useState<ComputedWordData[]>([]);
  const [computeError, setComputeError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    let active = true;
    setComputeError(null);
    const squareRoots = words.map((word) => Math.sqrt(Math.max(0, word.value)));
    const minValue = Math.min(...squareRoots);
    const maxValue = Math.max(...squareRoots);
    const fontSize = (word: Word) => {
      if (minValue === maxValue) {
        return (MIN_FONT_SIZE + MAX_FONT_SIZE) / 2;
      }
      const value = Math.sqrt(Math.max(0, word.value));
      return MIN_FONT_SIZE + ((value - minValue) / (maxValue - minValue)) * (MAX_FONT_SIZE - MIN_FONT_SIZE);
    };

    void computeWords(
      {
        words,
        width: CLOUD_WIDTH,
        height: CLOUD_HEIGHT,
        font: "-apple-system, BlinkMacSystemFont, sans-serif",
        fontSize,
        padding: 5,
        rotate: () => 0,
        random: createSeededRandom(),
      },
      () => undefined,
    ).then(
      (nextWords) => {
        if (active) {
          setComputedWords(nextWords);
        }
      },
      (error: unknown) => {
        if (active) {
          setComputeError(error instanceof Error ? error : new Error("Unable to compute word cloud"));
        }
      },
    );

    return () => {
      active = false;
    };
  }, [words]);

  if (computeError) {
    throw computeError;
  }

  return (
    <svg
      className="wrapped-word-cloud"
      aria-label="Favorite word cloud"
      role="img"
      viewBox={`0 0 ${CLOUD_WIDTH} ${CLOUD_HEIGHT}`}
      width="100%"
      height="100%"
    >
      <g transform={`translate(${CLOUD_WIDTH / 2}, ${CLOUD_HEIGHT / 2})`}>
        {computedWords.map((word, index) => (
          <text
            key={`${word.text}-${index}`}
            className="wrapped-word-cloud-word"
            textAnchor="middle"
            transform={`translate(${word.x}, ${word.y}) rotate(${word.rotate})`}
            style={{
              fontFamily: word.font,
              fontSize: `${word.size}px`,
              fontStyle: word.style,
              fontWeight: word.weight,
            }}
          >
            <title>{`${word.text}: ${word.value}`}</title>
            {word.text}
          </text>
        ))}
      </g>
    </svg>
  );
};

export const SimpleWordcloud = () => {
  const { data: wrappedStats, isLoading } = useSlowWrappedStats();

  const topOneHundred = wrappedStats?.topOneHundred;
  const data = React.useMemo(
    () =>
      (
        topOneHundred?.map((l) => ({
          text: l[0],
          value: l[1],
        })) || []
      ).slice(0, 50),
    [topOneHundred],
  );
  return (
    <SectionWrapper className="wrapped-wordcloud-card">
      <SectionHeader>Favorite Words</SectionHeader>
      {isLoading && <progress className="wrapped-progress" aria-label="Loading favorite words" />}
      <div className="wrapped-wordcloud-canvas">
        <ErrorBoundary variant="section">{data.length > 0 && <DeterministicWordCloud words={data} />}</ErrorBoundary>
      </div>
    </SectionWrapper>
  );
};
