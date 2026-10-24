import "./globals.css";

export const metadata = {
  title: "RxReach — Pharmacy delivery for Western MA",
  description: "Find a pharmacy that can deliver your medication to your door."
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
