export const logger = (debug: boolean, ...messages: any) => {
  if (!debug) return;
  console.log(...messages);
};
