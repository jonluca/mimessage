import ColorThief from "colorthief/dist/color-thief.mjs";
import type { Contact } from "node-mac-contacts";
const colorThief = new ColorThief();

export function getIntervalString(timeDiff: number): string {
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  if (timeDiff < MINUTE) {
    return `${Math.round(timeDiff / 1000)} sec`;
  } else if (timeDiff < HOUR) {
    return `${Math.round(timeDiff / MINUTE)} min`;
  } else if (timeDiff < DAY) {
    return `${Math.round(timeDiff / HOUR)} hrs`;
  } else {
    return `${Math.round(timeDiff / DAY)} days`;
  }
}

export const cleanFileUrl = (url: string | null | undefined) => {
  if (!url) {
    return undefined;
  }
  return url.replace("file:", "mimessage-asset:");
};

export const getContactName = (contact: Contact | null | undefined) => {
  if (!contact) {
    return "";
  }
  if (contact.nickname) {
    return contact.nickname;
  } else {
    if (contact.firstName || contact.lastName) {
      return `${contact.firstName || ""} ${contact.lastName || ""}`.trim();
    }
  }

  return "";
};

export const getAverageRGB = async (base64Image: string): Promise<{ r: number; g: number; b: number } | null> => {
  try {
    const imgEl = new Image();
    imgEl.src = base64Image;
    if (imgEl.complete) {
      const palette = colorThief.getColor(imgEl, 20);
      if (!palette) {
        return null;
      }
      return { r: palette[0], g: palette[1], b: palette[2] };
    }
    return new Promise((resolve) => {
      let resolved = false;

      const tryResolve = (value: any) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };
      setTimeout(() => {
        tryResolve(null);
      }, 1000);
      imgEl.addEventListener("load", function () {
        try {
          const palette = colorThief.getColor(imgEl);
          tryResolve({ r: palette[0], g: palette[1], b: palette[2] });
        } catch (e) {
          tryResolve(null);
        }
      });
      imgEl.addEventListener("error", () => {
        tryResolve(null);
      });
    });
  } catch (e) {
    return null;
  }
};
