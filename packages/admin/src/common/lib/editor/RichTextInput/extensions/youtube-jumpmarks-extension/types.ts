/**
 * Jump mark interface
 */
export interface JumpMark {
  time: number;
  label: string;
  description: string;
}

/**
 * Jump mark data interface for modal
 */
export interface JumpMarkData {
  src: string;
  width?: number;
  height?: number;
  title?: string;
  jumpMarks: JumpMark[];
  showJumpMarks: boolean;
}
