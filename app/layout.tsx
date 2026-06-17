import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Chatbot — RAG, Tools & Approvals",
  description:
    "Production-style AI chatbot built with the Vercel AI SDK: streaming, tool calling, multi-step, human approval, file upload and RAG.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
