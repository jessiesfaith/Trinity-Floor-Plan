import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trinity Floor Planner',
  description: 'Interactive office floor planner with PDF import, calibration, geometry-based validation and scenario planning.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
