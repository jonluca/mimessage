declare module "colorthief/dist/color-thief.mjs" {
  export type RGBColor = [number, number, number];
  export default class ColorThief {
    getColor: (img: HTMLImageElement | null, quality: number = 10) => RGBColor;
    getPalette: (img: HTMLImageElement | null, colorCount: number = 10, quality: number = 10) => RGBColor[] | null;
  }
}
