export const SERVER_AVAILABLE_EVENT = "codebro:server-available";
export const SERVER_UNAVAILABLE_EVENT = "codebro:server-unavailable";

export function reportServerAvailable(): void {
  window.dispatchEvent(new Event(SERVER_AVAILABLE_EVENT));
}

export function reportServerUnavailable(): void {
  window.dispatchEvent(new Event(SERVER_UNAVAILABLE_EVENT));
}
