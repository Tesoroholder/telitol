import { createServerFn } from "@tanstack/react-start";

/** Which social sign-in buttons to show — only providers with credentials configured. */
export const getAuthOptions = createServerFn({ method: "GET" }).handler(
  async () => {
    const { enabledSocialProviders } = await import("./server");
    return { social: enabledSocialProviders };
  },
);
