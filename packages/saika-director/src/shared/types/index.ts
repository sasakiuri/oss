// ElectronAPI
export type { ElectronAPI } from './ElectronAPI';

// Board window config (shared between main and renderer)
export type { BoardType, BoardWindowConfig } from './BoardWindowConfig';

// Result Type (functional error handling)
export type { Result, Ok, Err, ParseError } from './Result';
export { Result as ResultUtil, createParseError } from './Result';
