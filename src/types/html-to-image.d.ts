// Tipado mínimo para usar html-to-image en cliente
declare module 'html-to-image' {
  export function toPng(
    node: HTMLElement,
    options?: {
      cacheBust?: boolean;
      pixelRatio?: number;
      backgroundColor?: string;
      width?: number;
      height?: number;
      style?: Partial<CSSStyleDeclaration>;
      filter?: (domNode: HTMLElement) => boolean;
      canvasWidth?: number;
      canvasHeight?: number;
      skipFonts?: boolean;
      imagePlaceholder?: string;
      quality?: number;
    }
  ): Promise<string>;

  // Exportaciones comunes que no usamos ahora, por si luego las necesitas
  export function toJpeg(node: HTMLElement, options?: any): Promise<string>;
  export function toSvg(node: HTMLElement, options?: any): Promise<string>;
}
