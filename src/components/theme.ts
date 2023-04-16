import { createTheme } from "@mui/material/styles";
declare module "@mui/material/styles" {
  interface Theme {
    colors: {
      black: string;
      white: string;
      ghostWhite: string;
      orient: string;
      poloBlue: string;
      lavenderBlue: string;
      darkCerulean: string;
      mayaBlue: string;
      aliceBlue: string;
      aliceBlue1: string;
      chatbotShadow: string;
      linkWater: string;
      madison: string;
      lowBlack: string;
      buttonShadow: string;
      gray: string;
      overlay: string;
      paleBlue: string;
      lightGray: string;
      error: string;
      greenLight: string;
      darkGreen: string;
      semiGray: string;
      slate: string;
      quartz: string;
      toubkal: string;
      atlas: string;
      shale: string;
      himalayas: string;
      sandstone: string;
      monte: string;
    };
  }

  interface ThemeOptions {
    colors: {
      black: string;
      white: string;
      orient: string;
      poloBlue: string;
      lavenderBlue: string;
      ghostWhite: string;
      darkCerulean: string;
      mayaBlue: string;
      aliceBlue: string;
      aliceBlue1: string;
      chatbotShadow: string;
      linkWater: string;
      madison: string;
      lowBlack: string;
      buttonShadow: string;
      gray: string;
      paleBlue: string;
      lightGray: string;
      error: string;
      overlay: string;
      greenLight: string;
      darkGreen: string;
      semiGray: string;
      slate: string;
      quartz: string;
      toubkal: string;
      atlas: string;
      shale: string;
      himalayas: string;
      sandstone: string;
      monte: string;
    };
  }
}

const baseThemeOptions = {
  colors: {
    monte: "#A9B2FE",
    ghostWhite: "#ECEEFF",
    white: "#FFFFFF",
    black: "#000000",
    greenLight: "#F7FCF8",
    darkGreen: "#4F7C6C",
    sandstone: "#F9F4EA",
    lowBlack: "#1E1D1D",
    atlas: "#FFFAE6",
    slate: "#6B6B72",
    quartz: "#F6F7FF",
    gray: "#EDEDED",
    error: "#E01515",
    himalayas: "#FEF4F4",
    lightGray: "#6B6B72",
    shale: "#9A6804",
    toubkal: "#FFC146",
    orient: "#214170",
    poloBlue: "#84a0c8",
    lavenderBlue: "#C9DFFF",
    semiGray: "#F8F8F8",
    darkCerulean: "#083F8F",
    paleBlue: "#4456F5",
    mayaBlue: "#6EA7FA",
    aliceBlue: "#E9F2FF",
    linkWater: "#E0E0E3",
    aliceBlue1: "#F5F9FF",
    madison: "#2E3A59",
    chatbotShadow: "rgba(0, 0, 0, 0.25)",
    buttonShadow: "rgba(0, 0, 0, 0.1)",
    overlay: "rgba(0, 0, 0, 0.3)",
  },
  components: {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          "& fieldset": {
            borderColor: "white",
          },
          input: {
            color: "white",
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          "& fieldset": {
            borderColor: "white",
          },
        },
      },
    },
  },

  typography: {
    allVariants: {
      color: "#ffffff",
    },
    fontFamily: "arbeit, sans-serif",
    h1: {
      fontStyle: "normal",
      fontWeight: 600,
      fontSize: "32px",
      lineHeight: "48px",
      color: "#ffffff",
    },
    h2: {
      fontStyle: "normal",
      fontWeight: 400,
      fontSize: "24px",
      lineHeight: "32px",
      color: "#ffffff",
    },
    h3: {
      fontStyle: "normal",
      fontWeight: 400,
      fontSize: "22px",
      lineHeight: "32px",
      color: "#ffffff",
    },
    h4: {
      fontStyle: "normal",
      fontWeight: 400,
      lineHeight: "24px",
      fontSize: "18px",
      color: "#ffffff",
    },
    h6: {
      fontStyle: "normal",
      fontWeight: 400,
      lineHeight: "20px",
      fontSize: "16px",
      color: "#ffffff",
    },
    h5: {
      fontStyle: "normal",
      fontWeight: 400,
      lineHeight: "17.5px",
      fontSize: "14px",
      color: "#ffffff",
    },
  },
  palette: {
    primary: {
      main: "#5871f5",
      light: "#ffffff",
      contrastText: "#fff", //button text white instead of black
    },
    secondary: {
      main: "#8ad7ff",
    },
    error: {
      main: "#ff1403",
    },
    action: {
      disabled: "#6B6B72",
    },
  },
};

const DefaultTheme = createTheme(baseThemeOptions);

export default DefaultTheme;
