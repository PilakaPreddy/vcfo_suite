// Ambient types for this package. The reference pulls in chrome.* from this package's own
// node_modules, so the files also typecheck when the Suite repository's root tsconfig includes
// this folder; the CSS declaration covers the side panel's stylesheet import there too.
/// <reference types="chrome" />
declare module '*.css';
