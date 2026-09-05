import { signAsync } from "@electron/osx-sign";

export const sign = async (options) => {
  const identity = process.env.MIMESSAGE_CODESIGN_IDENTITY;
  if (!identity?.match(/^[A-F0-9]{40}$/)) {
    throw new Error("MIMESSAGE_CODESIGN_IDENTITY must be a unique SHA-1 signing identity.");
  }

  await signAsync({ ...options, identity });
};
