import { Roboto_Flex, Marcellus } from "next/font/google";
import "./globals.css";

const robotoFlex = Roboto_Flex({
  variable: "--font-roboto-flex",
  subsets: ["latin"],
});

const marcellus = Marcellus({
  variable: "--font-marcellus",
  subsets: ["latin"],
  weight: "400",
});

export const metadata = {
  title: "AI Dungeon Master Library",
  description: "D&D Beyond Sourcebook Extractor",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${robotoFlex.variable} ${marcellus.variable} h-full antialiased font-sans`}
    >
      <body className="h-full flex flex-col bg-gray-900 text-gray-100 relative overflow-hidden">
        {/* Draggable Title Bar for Electron */}
        <div 
          className="w-full h-8 flex-shrink-0 bg-transparent absolute top-0 left-0 z-50" 
          style={{ WebkitAppRegion: "drag" }}
        ></div>
        
        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden mt-8 relative z-10">
          {children}
        </div>

        {/* Legal Disclaimer Footer */}
        <footer className="w-full bg-gray-950 border-t border-gray-800 p-4 text-center text-xs text-gray-500 font-sans z-10">
          <p>
            For personal use and backup only. Not affiliated with, endorsed, or sponsored by D&D Beyond, Wizards of the Coast, or Hasbro.
          </p>
        </footer>
      </body>
    </html>
  );
}
