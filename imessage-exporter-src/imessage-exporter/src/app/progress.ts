import { ProgressBar, ProgressStyle } from 'indicatif';

export function buildProgressBarExport(totalMessages: number): ProgressBar {
  const pb = new ProgressBar(totalMessages);
  pb.setStyle(
    new ProgressStyle()
      .template(
        "{spinner:.green} [{elapsed}] [{bar:.blue}] {pos}/{len} ({per_sec}, ETA: {eta})"
      )
      .progressChars("#>-")
  );
  pb.setPosition(0);
  pb.enableSteadyTick(100);
  return pb;
}