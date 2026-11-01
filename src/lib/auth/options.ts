import { createServerFn } from "@tanstack/react-start";

/**
 * What the sign-in page can offer: social buttons only for providers with
 * credentials configured, and "Forgot password?" only when email can be sent.
 */
export const getAuthOptions = createServerFn({ method: "GET" }).handler(
  async () => {
    const { enabledSocialProviders } = await import("./server");
    const { emailEnabled } = await import("../email.server");
    return {
      social: enabledSocialProviders,
      passwordReset: emailEnabled() || process.env.NODE_ENV !== "production",
    };
  },
);
