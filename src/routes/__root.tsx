import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Frame } from "@/components/frame";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TeliTol" },
      {
        name: "description",
        content:
          "Ask people about real life, or ask AI. TeliTol is a community for questions and lived experience.",
      },
      { name: "theme-color", content: "#0e9f6e" },
      { property: "og:title", content: "TeliTol" },
      { property: "og:description", content: "Ask a person, or ask AI." },
      { property: "og:image", content: "/og.jpg" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <Frame />
        <Scripts />
      </body>
    </html>
  ),
});
